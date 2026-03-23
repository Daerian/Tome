"""
Session-prep router — generates an AI-powered pre-session brief for the DM.

Gathers campaign context (recent sessions, characters, locations, missions,
story beats, factions) and sends it to Claude to produce a structured brief
with five sections: Story So Far, Key Figures, Active Threads, Locations of
Note, and Session Hooks.  The DM can optionally provide prep notes (e.g.
"moving the party to the Underdark") which take highest priority in the
generated brief.  The result is persisted on the session record.
"""

from fastapi import APIRouter
from pydantic import BaseModel
from pydantic_ai import Agent
from pydantic_ai.models.anthropic import AnthropicModel
from pydantic_ai.providers.anthropic import AnthropicProvider
from dotenv import load_dotenv
from supabase_client import supabase as sb
import os

load_dotenv()

router = APIRouter()

# Reusable model instance shared across requests
model = AnthropicModel(
    "claude-haiku-4-5",
    provider=AnthropicProvider(api_key=os.getenv("ANTHROPIC_API_KEY")),
)

SESSION_PREP_SYSTEM_PROMPT = (
    "You are Tome, a D&D session preparation assistant for Dungeon Masters. "
    "Given campaign context including previous sessions, characters, locations, "
    "active story threads, and missions, produce a concise pre-session brief.\n\n"
    "If DM Prep Notes are provided, treat them as the DM's intended direction "
    "for the upcoming session. Prioritize characters, locations, and threads "
    "relevant to those notes.\n\n"
    "Structure your response with EXACTLY these five section headers, each on "
    "its own line prefixed with '## ':\n\n"
    "## Story So Far\n"
    "A short narrative timeline of the most recent 2-3 sessions. Write in past "
    "tense, third person. Focus on events most relevant to the upcoming session's "
    "attending characters and active plot threads. Keep it to 2-3 paragraphs.\n\n"
    "## Key Figures\n"
    "List the most important characters (PCs and NPCs) relevant to the current "
    "situation. For each, provide their name, a one-line description, and why "
    "they matter right now. Prioritize characters attending the upcoming session "
    "and NPCs involved in active missions or story beats.\n\n"
    "## Active Threads\n"
    "List open story beats, active/available missions, and unresolved plot hooks. "
    "For each, note its current status and what the players might do next. "
    "Prioritize by relevance to the attending characters.\n\n"
    "## Locations of Note\n"
    "List locations relevant to the current narrative — where the party is, "
    "where active missions lead, and where recent events occurred. Include a "
    "brief description for each.\n\n"
    "## Session Hooks\n"
    "Suggest 2-4 concrete entry points for the upcoming session based on "
    "active threads, character goals, and recent cliffhangers. These are "
    "starting-point ideas for the DM, not a script.\n\n"
    "Do not invent information that is not in the provided context. "
    "If a section has no relevant data, write 'No data available yet.' "
    "for that section."
)


# ---------------------------------------------------------------------------
# Request model
# ---------------------------------------------------------------------------


class SessionPrepRequest(BaseModel):
    """Identifies the session to prep and optional DM hints."""

    session_id: str
    campaign_id: str
    dm_prep_notes: str | None = None


# ---------------------------------------------------------------------------
# Context builder
# ---------------------------------------------------------------------------


def build_session_prep_context(
    session_id: str,
    campaign_id: str,
    dm_prep_notes: str | None = None,
) -> str | None:
    """Fetch campaign data from Supabase and assemble a context string."""

    # --- Core data ---

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
            "session_number, title, status, dm_notes, "
            "in_world_start_date, in_world_end_date"
        )
        .eq("id", session_id)
        .single()
        .execute()
    )

    if not campaign_res.data or not session_res.data:
        return None

    c = campaign_res.data
    s = session_res.data

    # --- Previous sessions (last 3 completed) ---

    prev_sessions_res = (
        sb.table("sessions")
        .select(
            "id, session_number, title, summary, dm_notes, "
            "player_notes, in_world_start_date, in_world_end_date"
        )
        .eq("campaign_id", campaign_id)
        .eq("status", "completed")
        .order("session_number", desc=True)
        .limit(3)
        .execute()
    )

    # --- Session attendees (PCs for the target session) ---

    attendees_res = (
        sb.table("session_attendees")
        .select(
            "character_id, characters(id, name, race, class, level, "
            "description, backstory, status)"
        )
        .eq("session_id", session_id)
        .execute()
    )

    # --- Non-PC characters (NPCs, companions, deities) ---

    npcs_res = (
        sb.table("characters")
        .select("id, name, type, race, class, level, description, status")
        .eq("campaign_id", campaign_id)
        .neq("type", "pc")
        .execute()
    )

    # --- Active story beats ---

    beats_res = (
        sb.table("story_beats")
        .select("title, description, type, status, notes, sort_order")
        .eq("campaign_id", campaign_id)
        .in_("status", ["planted", "active"])
        .order("sort_order")
        .execute()
    )

    # --- Active / available missions ---

    missions_res = (
        sb.table("missions")
        .select(
            "title, description, type, status, priority, "
            "reward_description, notes, quest_giver_id"
        )
        .eq("campaign_id", campaign_id)
        .in_("status", ["available", "active"])
        .execute()
    )

    # --- Recent timeline events ---

    events_res = (
        sb.table("timeline_events")
        .select(
            "title, description, event_type, importance, "
            "in_world_date, location_id"
        )
        .eq("campaign_id", campaign_id)
        .order("sort_order", desc=True)
        .limit(20)
        .execute()
    )

    # --- Locations ---

    locations_res = (
        sb.table("locations")
        .select("id, name, type, description, parent_location_id")
        .eq("campaign_id", campaign_id)
        .execute()
    )

    # --- Active factions ---

    factions_res = (
        sb.table("factions")
        .select(
            "name, type, description, alignment, status, goals, "
            "leader_character_id, headquarters_location_id"
        )
        .eq("campaign_id", campaign_id)
        .eq("status", "active")
        .execute()
    )

    # --- Recent session notes ---

    notes_res = (
        sb.table("notes")
        .select("content, type, related_entity_id, profiles(display_name)")
        .eq("campaign_id", campaign_id)
        .eq("related_entity_type", "session")
        .eq("visibility", "public")
        .order("created_at", desc=True)
        .limit(30)
        .execute()
    )

    # ------------------------------------------------------------------
    # Build lookup dicts for FK resolution
    # ------------------------------------------------------------------

    all_characters = {
        ch["id"]: ch for ch in (npcs_res.data or [])
    }
    # Also index attending PCs
    for a in (attendees_res.data or []):
        ch = a.get("characters")
        if ch:
            all_characters[ch["id"]] = ch

    location_map = {
        loc["id"]: loc for loc in (locations_res.data or [])
    }

    def char_name(cid):
        ch = all_characters.get(cid)
        return ch["name"] if ch else "Unknown"

    def loc_name(lid):
        loc = location_map.get(lid)
        return loc["name"] if loc else "Unknown"

    # ------------------------------------------------------------------
    # Assemble context string
    # ------------------------------------------------------------------

    lines: list[str] = []

    # Campaign header
    lines.append(f"=== CAMPAIGN: {c['name']} ===")
    if c.get("description"):
        lines.append(f"Description: {c['description']}")
    lines.append(f"System: {c['system']}")
    lines.append("")

    # DM prep notes — highest priority context
    if dm_prep_notes and dm_prep_notes.strip():
        lines.append("=== DM'S PLANS FOR THIS SESSION ===")
        lines.append(dm_prep_notes.strip())
        lines.append("")

    # Upcoming session info
    lines.append("=== UPCOMING SESSION ===")
    lines.append(
        f"Session {s['session_number']}: {s.get('title') or 'Untitled'}"
    )
    lines.append(f"Status: {s['status']}")
    if s.get("dm_notes"):
        lines.append(f"DM Notes: {s['dm_notes']}")
    if s.get("in_world_start_date"):
        dates = s["in_world_start_date"]
        if s.get("in_world_end_date"):
            dates += f" to {s['in_world_end_date']}"
        lines.append(f"In-world date: {dates}")
    lines.append("")

    # Attending PCs
    attendees = attendees_res.data or []
    lines.append("=== ATTENDING CHARACTERS (PCs) ===")
    if attendees:
        for a in attendees:
            ch = a.get("characters")
            if not ch:
                continue
            desc = ch.get("description") or "No description"
            lines.append(
                f"- {ch['name']} ({ch.get('race', '?')} "
                f"{ch.get('class', '?')}, Level {ch.get('level', '?')}): "
                f"{desc}"
            )
            if ch.get("backstory"):
                lines.append(f"  Backstory: {ch['backstory']}")
    else:
        lines.append("No attendees registered for this session yet.")
    lines.append("")

    # Previous sessions (reverse to chronological order)
    prev_sessions = list(reversed(prev_sessions_res.data or []))
    notes = notes_res.data or []
    lines.append("=== RECENT SESSION HISTORY ===")
    if prev_sessions:
        for ps in prev_sessions:
            title = ps.get("title") or "Untitled"
            lines.append(
                f"\n--- Session {ps['session_number']}: {title} ---"
            )
            if ps.get("summary"):
                lines.append(f"Summary: {ps['summary']}")
            if ps.get("dm_notes"):
                lines.append(f"DM Notes: {ps['dm_notes']}")
            if ps.get("player_notes"):
                lines.append(f"Player Notes: {ps['player_notes']}")
            if ps.get("in_world_start_date"):
                dates = ps["in_world_start_date"]
                if ps.get("in_world_end_date"):
                    dates += f" to {ps['in_world_end_date']}"
                lines.append(f"In-world: {dates}")
            # Contributed notes for this session
            session_notes = [
                n for n in notes
                if n.get("related_entity_id") == ps["id"]
            ]
            if session_notes:
                lines.append("Contributed notes:")
                for n in session_notes:
                    author = "Unknown"
                    if n.get("profiles") and n["profiles"].get("display_name"):
                        author = n["profiles"]["display_name"]
                    lines.append(f"  [{author}] {n.get('content', '')}")
    else:
        lines.append("No completed sessions yet.")
    lines.append("")

    # Notable NPCs & companions
    npcs = npcs_res.data or []
    lines.append("=== NOTABLE NPCs & COMPANIONS ===")
    if npcs:
        for npc in npcs:
            desc = npc.get("description") or "No description"
            lines.append(
                f"- {npc['name']} ({npc['type']}, "
                f"{npc.get('race', '?')} {npc.get('class', '?')}): "
                f"{desc} [Status: {npc.get('status', '?')}]"
            )
    else:
        lines.append("No NPCs or companions recorded yet.")
    lines.append("")

    # Active story beats
    beats = beats_res.data or []
    lines.append("=== ACTIVE STORY BEATS ===")
    if beats:
        for b in beats:
            lines.append(
                f"- [{b['type']}, {b['status']}] "
                f"{b['title']}: {b.get('description', '')}"
            )
            if b.get("notes"):
                lines.append(f"  DM Notes: {b['notes']}")
    else:
        lines.append("No active story beats recorded yet.")
    lines.append("")

    # Active / available missions
    missions = missions_res.data or []
    lines.append("=== ACTIVE MISSIONS ===")
    if missions:
        for m in missions:
            lines.append(
                f"- [{m['type']}, {m['status']}, Priority: {m['priority']}] "
                f"{m['title']}: {m.get('description', '')}"
            )
            if m.get("quest_giver_id"):
                lines.append(f"  Quest giver: {char_name(m['quest_giver_id'])}")
            if m.get("reward_description"):
                lines.append(f"  Reward: {m['reward_description']}")
            if m.get("notes"):
                lines.append(f"  DM Notes: {m['notes']}")
    else:
        lines.append("No active missions yet.")
    lines.append("")

    # Recent timeline events
    events = events_res.data or []
    lines.append("=== RECENT TIMELINE EVENTS ===")
    if events:
        for e in events:
            loc = ""
            if e.get("location_id"):
                loc = f" @ {loc_name(e['location_id'])}"
            lines.append(
                f"- [{e['importance']}, {e['event_type']}] "
                f"{e['title']} ({e.get('in_world_date', '?')}){loc}: "
                f"{e.get('description', '')}"
            )
    else:
        lines.append("No timeline events recorded yet.")
    lines.append("")

    # Locations
    locs = locations_res.data or []
    lines.append("=== LOCATIONS ===")
    if locs:
        for loc in locs:
            parent = ""
            if loc.get("parent_location_id"):
                parent = f" (in {loc_name(loc['parent_location_id'])})"
            desc = loc.get("description") or "No description"
            lines.append(
                f"- {loc['name']} ({loc['type']}){parent}: {desc}"
            )
    else:
        lines.append("No locations recorded yet.")
    lines.append("")

    # Active factions
    factions = factions_res.data or []
    lines.append("=== ACTIVE FACTIONS ===")
    if factions:
        for f in factions:
            lines.append(
                f"- {f['name']} ({f['type']}, {f.get('alignment', '?')}): "
                f"{f.get('description', '')}"
            )
            if f.get("goals"):
                lines.append(f"  Goals: {f['goals']}")
            if f.get("leader_character_id"):
                lines.append(
                    f"  Leader: {char_name(f['leader_character_id'])}"
                )
            if f.get("headquarters_location_id"):
                lines.append(
                    f"  HQ: {loc_name(f['headquarters_location_id'])}"
                )
    else:
        lines.append("No active factions recorded yet.")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------


@router.post("/session-prep")
async def session_prep(body: SessionPrepRequest):
    """Generate a pre-session preparation brief and persist it."""

    context = build_session_prep_context(
        body.session_id, body.campaign_id, body.dm_prep_notes
    )

    if not context:
        return {"prep": "Session or campaign not found."}

    agent = Agent(model, system_prompt=SESSION_PREP_SYSTEM_PROMPT)
    result = await agent.run(
        f"Generate a session preparation brief using the following "
        f"campaign context:\n\n{context}"
    )

    # Persist the brief to the session record
    sb.table("sessions").update(
        {"prep_brief": result.output}
    ).eq("id", body.session_id).execute()

    return {"prep": result.output}
