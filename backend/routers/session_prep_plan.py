"""
Session Prep Plan router — AI-powered encounter drafting for the Scriptorium.

Three endpoints:

  POST /api/session-routes
      Returns 3 suggested session direction hooks based on campaign context.
      The DM selects one (or writes a custom direction) to steer encounters.

  POST /api/session-prep-plan
      Given the DM's planning parameters (per-type tone, encounter mix,
      selected objectives, optional session direction), generates 5 candidate
      encounters for every encounter type requested.
      Also generates NPC highlights and loot suggestions.
      Persists the full candidate set to sessions.prep_config.

  POST /api/session-prep-encounter
      Regenerates a single encounter card in-place.  Accepts an optional DM
      hint to steer the output.  Returns one EncounterSuggestion; the frontend
      swaps it into the candidate list at the relevant index.
"""

import json
import os
from typing import Literal

from dotenv import load_dotenv
from fastapi import APIRouter
from pydantic import BaseModel
from pydantic_ai import Agent
from pydantic_ai.models.anthropic import AnthropicModel
from pydantic_ai.providers.anthropic import AnthropicProvider

from supabase_client import supabase as sb

load_dotenv()

router = APIRouter()

model = AnthropicModel(
    "claude-haiku-4-5",
    provider=AnthropicProvider(api_key=os.getenv("ANTHROPIC_API_KEY")),
)

# ---------------------------------------------------------------------------
# Shared Pydantic models
# ---------------------------------------------------------------------------


class EncounterMix(BaseModel):
    rp: int = 2
    combat: int = 2
    puzzles: int = 1


class EncounterTone(BaseModel):
    """Per-encounter-type tone — each type can have a different intensity."""

    rp: Literal["light", "moderate", "intense"] = "moderate"
    combat: Literal["light", "moderate", "intense"] = "moderate"
    puzzle: Literal["light", "moderate", "intense"] = "moderate"


class SelectedObjective(BaseModel):
    id: str
    type: Literal["mission", "story_beat"]
    title: str


class EncounterSuggestion(BaseModel):
    type: Literal["rp", "combat", "puzzle"]
    title: str
    description: str
    npcs_involved: list[str] = []
    enemies: str | None = None
    difficulty: Literal["easy", "medium", "hard", "deadly"] | None = None
    loot_hint: str | None = None
    location: str | None = None


class NPCHighlight(BaseModel):
    name: str
    role: str
    character_id: str | None = None


class LootSuggestion(BaseModel):
    name: str
    category: Literal["gold", "item", "gem", "art", "magic_item", "other"]
    description: str
    source: str


# ---------------------------------------------------------------------------
# /api/session-routes  request + output models
# ---------------------------------------------------------------------------


class SessionRoute(BaseModel):
    title: str
    description: str


class RouteSuggestionsOutput(BaseModel):
    routes: list[SessionRoute]


class RouteRequest(BaseModel):
    session_id: str
    campaign_id: str


# ---------------------------------------------------------------------------
# /api/session-prep-plan  request + output models
# ---------------------------------------------------------------------------


class PrepPlanRequest(BaseModel):
    session_id: str
    campaign_id: str
    encounter_tone: EncounterTone = EncounterTone()
    encounter_mix: EncounterMix = EncounterMix()
    selected_objectives: list[SelectedObjective] = []
    session_direction: str | None = None


class PrepCandidatesOutput(BaseModel):
    """5 candidates per requested encounter type; empty list for skipped types."""

    rp_candidates: list[EncounterSuggestion] = []
    combat_candidates: list[EncounterSuggestion] = []
    puzzle_candidates: list[EncounterSuggestion] = []
    npc_highlights: list[NPCHighlight] = []
    loot_suggestions: list[LootSuggestion] = []


# ---------------------------------------------------------------------------
# /api/session-prep-encounter  request + output models
# ---------------------------------------------------------------------------


class EncounterRewriteRequest(BaseModel):
    session_id: str
    campaign_id: str
    type: Literal["rp", "combat", "puzzle"]
    encounter_tone: EncounterTone = EncounterTone()
    selected_objectives: list[SelectedObjective] = []
    hint: str | None = None
    existing_titles: list[str] = []
    session_direction: str | None = None


class SingleEncounterOutput(BaseModel):
    encounter: EncounterSuggestion


# ---------------------------------------------------------------------------
# Context builder (shared between all three endpoints)
# ---------------------------------------------------------------------------


def build_plan_context(
    session_id: str,
    campaign_id: str,
    encounter_tone: EncounterTone,
    encounter_mix: EncounterMix,
    selected_objectives: list[SelectedObjective],
    session_direction: str | None = None,
) -> str | None:
    campaign_res = (
        sb.table("campaigns")
        .select("name, description, system")
        .eq("id", campaign_id)
        .single()
        .execute()
    )
    session_res = (
        sb.table("sessions")
        .select(
            "session_number, title, status, dm_notes, prep_brief, "
            "in_world_start_date, in_world_end_date, prep_items"
        )
        .eq("id", session_id)
        .single()
        .execute()
    )

    if not campaign_res.data or not session_res.data:
        return None

    c = campaign_res.data
    s = session_res.data

    prev_sessions_res = (
        sb.table("sessions")
        .select("session_number, title, summary, in_world_start_date")
        .eq("campaign_id", campaign_id)
        .eq("status", "completed")
        .order("session_number", desc=True)
        .limit(3)
        .execute()
    )
    attendees_res = (
        sb.table("session_attendees")
        .select("character_id, characters(id, name, race, class, level, description)")
        .eq("session_id", session_id)
        .execute()
    )
    npcs_res = (
        sb.table("characters")
        .select("id, name, type, race, class, level, description, status")
        .eq("campaign_id", campaign_id)
        .execute()
    )
    missions_res = (
        sb.table("missions")
        .select("id, title, description, type, status, priority, reward_description")
        .eq("campaign_id", campaign_id)
        .in_("status", ["available", "active"])
        .execute()
    )
    beats_res = (
        sb.table("story_beats")
        .select("id, title, description, type, status")
        .eq("campaign_id", campaign_id)
        .in_("status", ["planted", "active"])
        .execute()
    )
    locations_res = (
        sb.table("locations")
        .select("id, name, type, description, parent_location_id")
        .eq("campaign_id", campaign_id)
        .execute()
    )
    factions_res = (
        sb.table("factions")
        .select("name, type, goals, alignment")
        .eq("campaign_id", campaign_id)
        .eq("status", "active")
        .execute()
    )

    all_chars = {ch["id"]: ch for ch in (npcs_res.data or [])}
    for a in attendees_res.data or []:
        ch = a.get("characters")
        if ch:
            all_chars[ch["id"]] = ch

    loc_map = {loc["id"]: loc for loc in (locations_res.data or [])}

    def loc_name(lid):
        loc = loc_map.get(lid)
        return loc["name"] if loc else "Unknown"

    selected_ids = {obj.id for obj in selected_objectives}

    tone_desc = {
        "light": "Light-hearted — comedy, exploration, low stakes",
        "moderate": "Balanced — drama, action, lighter moments",
        "intense": "Intense — high tension, difficult choices, real consequences",
    }

    lines: list[str] = []

    lines.append(f"=== CAMPAIGN: {c['name']} ===")
    if c.get("description"):
        lines.append(f"Description: {c['description']}")
    lines.append(f"System: {c['system']}")
    lines.append("")

    lines.append("=== SESSION INFO ===")
    lines.append(f"Session {s['session_number']}: {s.get('title') or 'Untitled'}")
    if s.get("in_world_start_date"):
        lines.append(f"In-world date: {s['in_world_start_date']}")
    if s.get("dm_notes"):
        lines.append(f"DM Notes: {s['dm_notes']}")
    lines.append("")

    lines.append("=== SESSION PLANNING PARAMETERS ===")
    lines.append(
        f"Roleplay Tone: {encounter_tone.rp.upper()} — {tone_desc[encounter_tone.rp]}"
    )
    lines.append(
        f"Combat Tone: {encounter_tone.combat.upper()} — {tone_desc[encounter_tone.combat]}"
    )
    lines.append(
        f"Puzzle/Exploration Tone: {encounter_tone.puzzle.upper()} — {tone_desc[encounter_tone.puzzle]}"
    )
    lines.append(
        f"Encounter Mix: {encounter_mix.rp} roleplay, "
        f"{encounter_mix.combat} combat, {encounter_mix.puzzles} puzzle/exploration"
    )
    if selected_objectives:
        lines.append("DM-Selected Objectives:")
        for obj in selected_objectives:
            lines.append(f"  - [{obj.type}] {obj.title}")
    if session_direction:
        lines.append(f"Session Direction (chosen by DM): {session_direction}")
    lines.append("")

    prev = list(reversed(prev_sessions_res.data or []))
    if prev:
        lines.append("=== RECENT SESSION HISTORY ===")
        for ps in prev:
            lines.append(
                f"Session {ps['session_number']} ({ps.get('title', 'Untitled')}): "
                f"{ps.get('summary', 'No summary.')}"
            )
        lines.append("")

    if s.get("prep_brief"):
        lines.append("=== EXISTING PREP BRIEF (context only) ===")
        lines.append(s["prep_brief"][:1500])
        lines.append("")

    attendees = attendees_res.data or []
    lines.append("=== ATTENDING CHARACTERS ===")
    if attendees:
        for a in attendees:
            ch = a.get("characters")
            if ch:
                lines.append(
                    f"- {ch['name']} ({ch.get('race', '?')} "
                    f"{ch.get('class', '?')}, Level {ch.get('level', '?')}): "
                    f"{ch.get('description', '')}"
                )
    else:
        lines.append("No attendees registered — plan for the full party.")
    lines.append("")

    npcs = [ch for ch in (npcs_res.data or []) if ch.get("type") != "pc"]
    if npcs:
        lines.append("=== AVAILABLE NPCs ===")
        for npc in npcs:
            lines.append(
                f"- {npc['name']} (id:{npc['id']}, {npc['type']}, "
                f"{npc.get('race', '?')} {npc.get('class', '?')}): "
                f"{npc.get('description', '')} [Status: {npc.get('status', '?')}]"
            )
        lines.append("")

    missions = missions_res.data or []
    if missions:
        lines.append("=== ACTIVE MISSIONS ===")
        for m in missions:
            marker = " *** SELECTED ***" if m["id"] in selected_ids else ""
            lines.append(
                f"- [{m['priority']}] {m['title']}{marker}: {m.get('description', '')}"
            )
            if m.get("reward_description"):
                lines.append(f"  Reward: {m['reward_description']}")
        lines.append("")

    beats = beats_res.data or []
    if beats:
        lines.append("=== ACTIVE STORY BEATS ===")
        for b in beats:
            marker = " *** SELECTED ***" if b["id"] in selected_ids else ""
            lines.append(
                f"- [{b['type']}, {b['status']}] {b['title']}{marker}: "
                f"{b.get('description', '')}"
            )
        lines.append("")

    locs = locations_res.data or []
    if locs:
        lines.append("=== LOCATIONS ===")
        for loc in locs:
            parent = ""
            if loc.get("parent_location_id"):
                parent = f" (in {loc_name(loc['parent_location_id'])})"
            lines.append(
                f"- {loc['name']} ({loc['type']}){parent}: "
                f"{loc.get('description', 'No description')}"
            )
        lines.append("")

    factions = factions_res.data or []
    if factions:
        lines.append("=== ACTIVE FACTIONS ===")
        for f in factions:
            lines.append(
                f"- {f['name']} ({f['type']}, {f.get('alignment', '?')}): "
                f"{f.get('goals', '')}"
            )
        lines.append("")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# System prompts
# ---------------------------------------------------------------------------

ROUTE_SUGGESTIONS_SYSTEM_PROMPT = """\
You are Tome, a D&D session planning assistant. Given campaign context, \
suggest exactly 3 distinct possible directions the DM could take for the \
upcoming session.

Each route must:
- Have a short punchy title (3-6 words)
- Have a 2-3 sentence description — a compelling hook or opening premise
- Be clearly distinct from the other routes in focus, stakes, and approach
- Be rooted in the existing campaign lore, NPCs, and unresolved threads
- Name the inciting event or situation the players will encounter
- NOT prescribe the outcome — just set the opening direction

Do not invent characters or lore absent from the context.
"""

CANDIDATES_SYSTEM_PROMPT = """\
You are Tome, a D&D session planning assistant writing in a Scriptorium — a \
library of possible encounters for the Dungeon Master to choose from.

Given campaign context and DM planning parameters, generate a catalogue of \
encounter options:

- For EACH encounter type whose count is greater than zero, produce EXACTLY \
5 distinct candidate encounters in the corresponding list field.
- Types with count 0 must have an empty list.
- Within each type, make candidates meaningfully different from one another \
(different locations, different NPCs, different hooks, different stakes).
- Each encounter type has its own tone — the planning parameters specify a \
separate tone for roleplay, combat, and puzzle/exploration. Apply them.
- If a Session Direction is provided, use it as the session's creative spine \
— encounters should support or naturally lead into it.
- Prioritise objectives marked *** SELECTED ***.
- For combat candidates: always include enemies and difficulty.
- For roleplay candidates: always name the NPCs involved.
- For puzzle candidates: describe the challenge and a possible approach.
- For every encounter: include a `location` field naming the primary setting (1-4 words). Use named locations from the context where possible.
- NPC highlights: every NPC likely to appear, with their character_id if known.
- Loot suggestions: tie each to a named encounter source.
- Keep descriptions to 2-4 sentences. Do not invent characters or lore absent \
from the context.
"""

SINGLE_ENCOUNTER_SYSTEM_PROMPT = """\
You are Tome, a D&D encounter drafter. Generate a single, self-contained \
encounter of the requested type, tailored to the campaign context.

Rules:
- The encounter must differ from any existing titles listed.
- If the DM provides a hint, treat it as the primary creative direction.
- If a Session Direction is provided, the encounter should support or tie into it.
- Apply the tone specified for this encounter type.
- For combat: include enemies and a difficulty rating.
- For roleplay: name the NPCs involved.
- For puzzle/exploration: describe the challenge and a possible approach.
- Include a `location` field naming the primary setting (1-4 words).
- Keep the description to 2-4 sentences.
- Do not invent characters or lore absent from the context.
"""


# ---------------------------------------------------------------------------
# Endpoint 1 — suggest 3 session routes
# ---------------------------------------------------------------------------


@router.post("/session-routes")
async def session_routes(body: RouteRequest):
    """Generate 3 distinct session direction routes based on campaign context."""

    context = build_plan_context(
        body.session_id,
        body.campaign_id,
        EncounterTone(),
        EncounterMix(),
        [],
    )
    if not context:
        return {"error": "Session or campaign not found."}

    agent: Agent[None, RouteSuggestionsOutput] = Agent(
        model,
        output_type=RouteSuggestionsOutput,
        system_prompt=ROUTE_SUGGESTIONS_SYSTEM_PROMPT,
    )

    result = await agent.run(
        f"Suggest 3 possible session directions for the DM based on this "
        f"campaign context:\n\n{context}"
    )

    return {"routes": [r.model_dump() for r in result.output.routes]}


# ---------------------------------------------------------------------------
# Endpoint 2 — generate full candidate set
# ---------------------------------------------------------------------------


@router.post("/session-prep-plan")
async def session_prep_plan(body: PrepPlanRequest):
    """Generate 5 encounter candidates per requested type, plus NPCs and loot."""

    context = build_plan_context(
        body.session_id,
        body.campaign_id,
        body.encounter_tone,
        body.encounter_mix,
        body.selected_objectives,
        body.session_direction,
    )

    if not context:
        return {"error": "Session or campaign not found."}

    agent: Agent[None, PrepCandidatesOutput] = Agent(
        model,
        output_type=PrepCandidatesOutput,
        system_prompt=CANDIDATES_SYSTEM_PROMPT,
    )

    result = await agent.run(
        f"Draft the encounter catalogue for this session using the following "
        f"campaign context and planning parameters:\n\n{context}"
    )

    out = result.output

    prep_config_update = {
        "encounter_tone": body.encounter_tone.model_dump(),
        "encounter_mix": body.encounter_mix.model_dump(),
        "selected_objectives": [o.model_dump() for o in body.selected_objectives],
        "session_direction": body.session_direction,
        "candidates": {
            "rp": [e.model_dump() for e in out.rp_candidates],
            "combat": [e.model_dump() for e in out.combat_candidates],
            "puzzle": [e.model_dump() for e in out.puzzle_candidates],
        },
        "npc_highlights": [n.model_dump() for n in out.npc_highlights],
        "loot_suggestions": [ls.model_dump() for ls in out.loot_suggestions],
    }

    sb.table("sessions").update({"prep_config": json.dumps(prep_config_update)}).eq(
        "id", body.session_id
    ).execute()

    return {"plan": prep_config_update}


# ---------------------------------------------------------------------------
# Endpoint 3 — regenerate a single encounter card
# ---------------------------------------------------------------------------


@router.post("/session-prep-encounter")
async def session_prep_encounter(body: EncounterRewriteRequest):
    """Regenerate one encounter card, optionally guided by a DM hint."""

    campaign_res = (
        sb.table("campaigns")
        .select("name, description, system")
        .eq("id", body.campaign_id)
        .single()
        .execute()
    )
    session_res = (
        sb.table("sessions")
        .select("session_number, title, dm_notes, prep_brief")
        .eq("id", body.session_id)
        .single()
        .execute()
    )
    npcs_res = (
        sb.table("characters")
        .select("id, name, type, description, status")
        .eq("campaign_id", body.campaign_id)
        .neq("type", "pc")
        .execute()
    )

    c = campaign_res.data or {}
    s = session_res.data or {}

    # Extract the tone relevant to this encounter type
    type_tone = {
        "rp": body.encounter_tone.rp,
        "combat": body.encounter_tone.combat,
        "puzzle": body.encounter_tone.puzzle,
    }[body.type]

    tone_desc = {
        "light": "light-hearted, low stakes",
        "moderate": "balanced drama and action",
        "intense": "high tension, real consequences",
    }.get(type_tone, type_tone)

    type_label = {
        "rp": "Roleplay",
        "combat": "Combat",
        "puzzle": "Puzzle / Exploration",
    }[body.type]

    lines = [
        f"Campaign: {c.get('name', 'Unknown')} ({c.get('system', '5e')})",
        f"Session {s.get('session_number', '?')}: {s.get('title', 'Untitled')}",
        f"Encounter type needed: {type_label}",
        f"Tone for this encounter: {tone_desc}",
    ]

    if body.session_direction:
        lines.append(f"Session Direction: {body.session_direction}")

    if body.selected_objectives:
        lines.append(
            "Objectives to tie in: "
            + ", ".join(o.title for o in body.selected_objectives)
        )

    npcs = npcs_res.data or []
    if npcs:
        lines.append(
            "Available NPCs: "
            + ", ".join(f"{n['name']} ({n.get('description', '')})" for n in npcs[:10])
        )

    if body.existing_titles:
        lines.append(
            "Avoid duplicating these existing encounter titles: "
            + ", ".join(body.existing_titles)
        )

    if body.hint and body.hint.strip():
        lines.append(f"\nDM Direction: {body.hint.strip()}")

    context = "\n".join(lines)

    agent: Agent[None, SingleEncounterOutput] = Agent(
        model,
        output_type=SingleEncounterOutput,
        system_prompt=SINGLE_ENCOUNTER_SYSTEM_PROMPT,
    )

    result = await agent.run(
        f"Generate one {type_label} encounter for this session:\n\n{context}"
    )

    return {"encounter": result.output.encounter.model_dump()}
