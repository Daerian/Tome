"""
Extract-beats router — AI-powered extraction of story beats from campaign data.

Gathers session summaries, notes, timeline events, and existing story beats,
then asks Claude to identify the main narrative threads and return them as
structured story beats the DM can review and save.
"""

import json
import os

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

EXTRACT_BEATS_SYSTEM_PROMPT = (
    "You are Tome, a D&D narrative analyst. Given campaign session summaries, "
    "notes, and timeline events, extract the main story beats — the key "
    "narrative threads, plot hooks, reveals, twists, and unresolved questions "
    "that drive the campaign forward.\n\n"
    "Return your response as a JSON array of story beat objects. Each object "
    "must have these fields:\n"
    "- title: short name for the beat (max 60 chars)\n"
    "- description: 1-2 sentence summary of the beat\n"
    "- type: one of 'plot_hook', 'reveal', 'cliffhanger', 'character_moment', "
    "'twist', 'resolution', 'foreshadowing'\n"
    "- status: one of 'planted', 'active', 'revealed', 'resolved'\n\n"
    "Focus on:\n"
    "- Unresolved plot threads that the party is pursuing\n"
    "- Major revelations or twists that changed the narrative\n"
    "- Character-driven moments that defined relationships\n"
    "- Cliffhangers and foreshadowing that haven't paid off yet\n"
    "- Resolutions of previously active threads\n\n"
    "Do NOT include existing story beats that are provided — only extract NEW "
    "beats not already tracked. If there is nothing new to extract, return an "
    "empty array [].\n\n"
    "Return ONLY the JSON array, no other text."
)


# ---------------------------------------------------------------------------
# Request model
# ---------------------------------------------------------------------------


class ExtractBeatsRequest(BaseModel):
    campaign_id: str


# ---------------------------------------------------------------------------
# Context builder
# ---------------------------------------------------------------------------


def build_extraction_context(campaign_id: str) -> str | None:
    """Gather campaign data for story beat extraction."""

    campaign_res = (
        sb.table("campaigns")
        .select("name, description")
        .eq("id", campaign_id)
        .single()
        .execute()
    )
    if not campaign_res.data:
        return None

    c = campaign_res.data

    # All completed sessions with summaries
    sessions_res = (
        sb.table("sessions")
        .select("session_number, title, summary, dm_notes, player_notes")
        .eq("campaign_id", campaign_id)
        .eq("status", "completed")
        .order("session_number")
        .execute()
    )

    # Timeline events
    events_res = (
        sb.table("timeline_events")
        .select("title, description, event_type, importance, in_world_date")
        .eq("campaign_id", campaign_id)
        .order("sort_order")
        .execute()
    )

    # Existing story beats (so we don't duplicate)
    beats_res = (
        sb.table("story_beats")
        .select("title, description, type, status")
        .eq("campaign_id", campaign_id)
        .execute()
    )

    # Public notes
    notes_res = (
        sb.table("notes")
        .select("content, type")
        .eq("campaign_id", campaign_id)
        .eq("visibility", "public")
        .order("created_at", desc=True)
        .limit(30)
        .execute()
    )

    lines = [f"=== CAMPAIGN: {c['name']} ==="]
    if c.get("description"):
        lines.append(f"Description: {c['description']}")
    lines.append("")

    # Sessions
    sessions = sessions_res.data or []
    lines.append("=== SESSION HISTORY ===")
    if sessions:
        for s in sessions:
            lines.append(
                f"\n--- Session {s['session_number']}: {s.get('title') or 'Untitled'} ---"
            )
            if s.get("summary"):
                lines.append(f"Summary: {s['summary']}")
            if s.get("dm_notes"):
                lines.append(f"DM Notes: {s['dm_notes']}")
            if s.get("player_notes"):
                lines.append(f"Player Notes: {s['player_notes']}")
    else:
        lines.append("No completed sessions yet.")
    lines.append("")

    # Timeline
    events = events_res.data or []
    lines.append("=== TIMELINE EVENTS ===")
    if events:
        for e in events:
            lines.append(
                f"- [{e['importance']}, {e['event_type']}] "
                f"{e['title']} ({e.get('in_world_date', '?')}): "
                f"{e.get('description', '')}"
            )
    else:
        lines.append("No timeline events.")
    lines.append("")

    # Notes
    notes = notes_res.data or []
    if notes:
        lines.append("=== PLAYER & SESSION NOTES ===")
        for n in notes:
            lines.append(f"- [{n.get('type', 'note')}] {n.get('content', '')}")
        lines.append("")

    # Existing beats (to avoid duplicates)
    beats = beats_res.data or []
    if beats:
        lines.append("=== EXISTING STORY BEATS (do NOT duplicate these) ===")
        for b in beats:
            lines.append(
                f"- [{b['type']}, {b['status']}] {b['title']}: {b.get('description', '')}"
            )
        lines.append("")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------


@router.post("/extract-beats")
async def extract_beats(body: ExtractBeatsRequest):
    """Extract story beats from campaign data using AI."""

    context = build_extraction_context(body.campaign_id)
    if not context:
        return {"beats": [], "error": "Campaign not found."}

    agent = Agent(model, system_prompt=EXTRACT_BEATS_SYSTEM_PROMPT)
    result = await agent.run(
        f"Extract story beats from the following campaign data:\n\n{context}"
    )

    # Parse the JSON response
    try:
        raw = result.output.strip()
        # Handle markdown code fences
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1].rsplit("```", 1)[0].strip()
        beats = json.loads(raw)
        if not isinstance(beats, list):
            beats = []
    except (json.JSONDecodeError, IndexError):
        beats = []

    return {"beats": beats}


@router.post("/save-beats")
async def save_beats(body: dict):
    """Save extracted story beats to the database."""

    campaign_id = body.get("campaign_id")
    beats = body.get("beats", [])

    if not campaign_id or not beats:
        return {"saved": 0}

    # Get current max sort_order
    existing = (
        sb.table("story_beats")
        .select("sort_order")
        .eq("campaign_id", campaign_id)
        .order("sort_order", desc=True)
        .limit(1)
        .execute()
    )
    next_order = 1
    if existing.data:
        next_order = (existing.data[0].get("sort_order", 0) or 0) + 1

    saved = 0
    for beat in beats:
        row = {
            "campaign_id": campaign_id,
            "title": beat.get("title", "Untitled"),
            "description": beat.get("description", ""),
            "type": beat.get("type", "plot_hook"),
            "status": beat.get("status", "active"),
            "sort_order": next_order,
            "visibility": "secret",
        }
        result = sb.table("story_beats").insert(row).execute()
        if result.data:
            saved += 1
            next_order += 1

    return {"saved": saved}
