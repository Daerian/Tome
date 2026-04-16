"""
Session Prep Plan router — AI-powered encounter and session planning for DMs.

The DM configures the session on the frontend (tone, encounter mix, selected
objectives) and this endpoint generates a structured plan containing:
  - Concrete encounter suggestions (roleplay / combat / puzzle)
  - NPC highlights relevant to this session
  - Loot suggestions tied to specific encounters

Uses PydanticAI structured output so the frontend receives clean JSON rather
than prose that needs post-processing.  The result is persisted back to
sessions.prep_config for the DM to edit.
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
# Pydantic models — request and structured AI output
# ---------------------------------------------------------------------------


class EncounterMix(BaseModel):
    rp: int = 2
    combat: int = 2
    puzzles: int = 1


class SelectedObjective(BaseModel):
    id: str
    type: Literal["mission", "story_beat"]
    title: str


class PrepPlanRequest(BaseModel):
    session_id: str
    campaign_id: str
    tone: Literal["light", "moderate", "intense"] = "moderate"
    encounter_mix: EncounterMix = EncounterMix()
    selected_objectives: list[SelectedObjective] = []


class EncounterSuggestion(BaseModel):
    type: Literal["rp", "combat", "puzzle"]
    title: str
    description: str
    npcs_involved: list[str] = []
    enemies: str | None = None
    difficulty: Literal["easy", "medium", "hard", "deadly"] | None = None
    loot_hint: str | None = None


class NPCHighlight(BaseModel):
    name: str
    role: str
    character_id: str | None = None


class LootSuggestion(BaseModel):
    name: str
    category: Literal["gold", "item", "gem", "art", "magic_item", "other"]
    description: str
    source: str


class PrepPlanOutput(BaseModel):
    encounters: list[EncounterSuggestion]
    npc_highlights: list[NPCHighlight]
    loot_suggestions: list[LootSuggestion]


# ---------------------------------------------------------------------------
# Context builder — reuses the same campaign data fetch as session_prep.py
# ---------------------------------------------------------------------------


def build_plan_context(
    session_id: str,
    campaign_id: str,
    tone: str,
    encounter_mix: EncounterMix,
    selected_objectives: list[SelectedObjective],
) -> str | None:
    """Fetch campaign data and assemble a context string for encounter planning."""

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

    # Previous completed sessions for narrative context
    prev_sessions_res = (
        sb.table("sessions")
        .select("session_number, title, summary, in_world_start_date")
        .eq("campaign_id", campaign_id)
        .eq("status", "completed")
        .order("session_number", desc=True)
        .limit(3)
        .execute()
    )

    # Attending PCs
    attendees_res = (
        sb.table("session_attendees")
        .select(
            "character_id, characters(id, name, race, class, level, description)"
        )
        .eq("session_id", session_id)
        .execute()
    )

    # All characters (NPCs etc.)
    npcs_res = (
        sb.table("characters")
        .select("id, name, type, race, class, level, description, status")
        .eq("campaign_id", campaign_id)
        .execute()
    )

    # All active missions — we'll highlight the selected ones
    missions_res = (
        sb.table("missions")
        .select("id, title, description, type, status, priority, reward_description")
        .eq("campaign_id", campaign_id)
        .in_("status", ["available", "active"])
        .execute()
    )

    # Active story beats
    beats_res = (
        sb.table("story_beats")
        .select("id, title, description, type, status")
        .eq("campaign_id", campaign_id)
        .in_("status", ["planted", "active"])
        .execute()
    )

    # Locations for setting context
    locations_res = (
        sb.table("locations")
        .select("id, name, type, description, parent_location_id")
        .eq("campaign_id", campaign_id)
        .execute()
    )

    # Factions
    factions_res = (
        sb.table("factions")
        .select("name, type, goals, alignment")
        .eq("campaign_id", campaign_id)
        .eq("status", "active")
        .execute()
    )

    # Build lookup maps
    all_chars = {ch["id"]: ch for ch in (npcs_res.data or [])}
    for a in attendees_res.data or []:
        ch = a.get("characters")
        if ch:
            all_chars[ch["id"]] = ch

    loc_map = {loc["id"]: loc for loc in (locations_res.data or [])}

    def loc_name(lid):
        loc = loc_map.get(lid)
        return loc["name"] if loc else "Unknown"

    # Build selected objective IDs for quick lookup
    selected_ids = {obj.id for obj in selected_objectives}

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

    # DM's planning parameters — highest priority
    lines.append("=== SESSION PLANNING PARAMETERS ===")
    tone_descriptions = {
        "light": "Light-hearted and fun — focus on comedy, exploration, and low-stakes encounters",
        "moderate": "Balanced mix of drama, action, and lighter moments",
        "intense": "High tension and stakes — dramatic confrontations, difficult choices, consequences",
    }
    lines.append(f"Tone: {tone.upper()} — {tone_descriptions.get(tone, tone)}")
    lines.append(
        f"Encounter Mix: {encounter_mix.rp} roleplay, "
        f"{encounter_mix.combat} combat, {encounter_mix.puzzles} puzzle/exploration"
    )

    if selected_objectives:
        lines.append("DM-Selected Objectives for this session:")
        for obj in selected_objectives:
            lines.append(f"  - [{obj.type}] {obj.title}")
    lines.append("")

    # Recent session history for narrative context
    prev = list(reversed(prev_sessions_res.data or []))
    if prev:
        lines.append("=== RECENT SESSION HISTORY ===")
        for ps in prev:
            lines.append(
                f"Session {ps['session_number']} ({ps.get('title', 'Untitled')}): "
                f"{ps.get('summary', 'No summary.')}"
            )
        lines.append("")

    # Existing prep brief for context (if already generated)
    if s.get("prep_brief"):
        lines.append("=== EXISTING PREP BRIEF (for context) ===")
        lines.append(s["prep_brief"][:1500])  # cap to avoid token bloat
        lines.append("")

    # Attending PCs
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
        lines.append("No attendees registered yet — plan for the full party.")
    lines.append("")

    # All NPCs (so the AI can suggest who is relevant)
    npcs = [ch for ch in (npcs_res.data or []) if ch.get("type") != "pc"]
    if npcs:
        lines.append("=== AVAILABLE NPCs & COMPANIONS ===")
        for npc in npcs:
            lines.append(
                f"- {npc['name']} (id:{npc['id']}, {npc['type']}, "
                f"{npc.get('race', '?')} {npc.get('class', '?')}): "
                f"{npc.get('description', '')} [Status: {npc.get('status', '?')}]"
            )
        lines.append("")

    # Missions — highlight selected ones
    missions = missions_res.data or []
    if missions:
        lines.append("=== ACTIVE MISSIONS ===")
        for m in missions:
            marker = " *** SELECTED FOR THIS SESSION ***" if m["id"] in selected_ids else ""
            lines.append(
                f"- [{m['priority']}] {m['title']}{marker}: "
                f"{m.get('description', '')}"
            )
            if m.get("reward_description"):
                lines.append(f"  Reward: {m['reward_description']}")
        lines.append("")

    # Story beats — highlight selected ones
    beats = beats_res.data or []
    if beats:
        lines.append("=== ACTIVE STORY BEATS ===")
        for b in beats:
            marker = " *** SELECTED FOR THIS SESSION ***" if b["id"] in selected_ids else ""
            lines.append(
                f"- [{b['type']}, {b['status']}] {b['title']}{marker}: "
                f"{b.get('description', '')}"
            )
        lines.append("")

    # Locations for setting encounters
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

    # Factions
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
# System prompt
# ---------------------------------------------------------------------------

SESSION_PLAN_SYSTEM_PROMPT = """\
You are Tome, a D&D session planning assistant for Dungeon Masters.

Given campaign context and the DM's planning parameters (tone, encounter mix,
selected objectives), generate a concrete session plan.

Rules:
- Create EXACTLY the number of encounters specified in the encounter mix
  (e.g. "2 roleplay, 3 combat, 1 puzzle" = 6 total encounters in that breakdown).
- Tailor all encounters to the specified tone (light/moderate/intense).
- Prioritise objectives marked "SELECTED FOR THIS SESSION" — at least one
  encounter should directly advance each selected objective.
- For combat encounters specify realistic enemies and a difficulty rating.
- For roleplay encounters name the NPCs involved (use names from the NPC list).
- For puzzle/exploration encounters describe the challenge and a possible approach.
- NPC highlights: list every NPC likely to appear, with a one-line role summary
  and their character_id if known from the NPC list.
- Loot suggestions: tie each to a specific encounter and give it a D&D-appropriate
  category (gold/item/gem/art/magic_item/other).
- Do not invent characters, locations, or lore not present in the context.
- Keep descriptions concise (2-4 sentences each).
"""


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------


@router.post("/session-prep-plan")
async def session_prep_plan(body: PrepPlanRequest):
    """Generate a structured encounter plan and persist it to prep_config."""

    context = build_plan_context(
        body.session_id,
        body.campaign_id,
        body.tone,
        body.encounter_mix,
        body.selected_objectives,
    )

    if not context:
        return {"error": "Session or campaign not found."}

    agent: Agent[None, PrepPlanOutput] = Agent(
        model,
        output_type=PrepPlanOutput,
        system_prompt=SESSION_PLAN_SYSTEM_PROMPT,
    )

    result = await agent.run(
        f"Generate a session encounter plan using the following campaign context "
        f"and planning parameters:\n\n{context}"
    )

    plan = result.output

    # Build the prep_config payload to persist
    prep_config = {
        "tone": body.tone,
        "encounter_mix": body.encounter_mix.model_dump(),
        "selected_objectives": [o.model_dump() for o in body.selected_objectives],
        "encounters": [e.model_dump() for e in plan.encounters],
        "npc_highlights": [n.model_dump() for n in plan.npc_highlights],
        "loot_suggestions": [l.model_dump() for l in plan.loot_suggestions],
    }

    sb.table("sessions").update({"prep_config": json.dumps(prep_config)}).eq(
        "id", body.session_id
    ).execute()

    return {"plan": prep_config}
