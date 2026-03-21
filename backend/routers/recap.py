"""
Recap router — generates a narrative session recap from session notes.

Fetches the target session's contributed notes (and the previous session's
summary for continuity), then asks Claude to write a polished 2-4 paragraph
narrative recap that the DM can adopt as the official session summary.
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

# Narrator persona — focused on turning raw notes into polished prose
RECAP_SYSTEM_PROMPT = (
    "You are Tome, a D&D campaign narrator. Given session notes contributed "
    "by players and the DM, write a compelling narrative recap of the session. "
    "Keep it concise (2-4 paragraphs). Write in past tense, third person. "
    "Capture key events, character actions, and important revelations. "
    "Do not add information that isn't in the notes."
)


# ---------------------------------------------------------------------------
# Request model
# ---------------------------------------------------------------------------


class RecapRequest(BaseModel):
    """Identifies the session to recap.

    Attributes
    ----------
    session_id : str
        UUID of the session whose notes should be summarised.
    campaign_id : str
        UUID of the campaign that owns the session.
    """

    session_id: str
    campaign_id: str


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------


@router.post("/recap")
async def recap(body: RecapRequest):
    """Generate a narrative recap from a session's notes.

    Pulls the session info, all public notes contributed by members, and
    the previous session's summary (for continuity). Sends everything to
    Claude with a narrator prompt and returns the generated recap.

    Parameters
    ----------
    body : RecapRequest
        Contains the ``session_id`` and ``campaign_id`` to recap.

    Returns
    -------
    dict
        ``{"recap": str}`` — the generated narrative, or an explanatory
        message when there are no notes to work with.
    """
    # --- Fetch data from Supabase (secret key, bypasses RLS) ---

    campaign_res = (
        sb.table("campaigns")
        .select("name, system")
        .eq("id", body.campaign_id)
        .single()
        .execute()
    )

    session_res = (
        sb.table("sessions")
        .select("session_number, title, player_notes")
        .eq("id", body.session_id)
        .single()
        .execute()
    )

    if not session_res.data or not campaign_res.data:
        return {"recap": "Session or campaign not found."}

    s = session_res.data
    c = campaign_res.data

    # Previous session summary for narrative continuity
    prev_res = (
        sb.table("sessions")
        .select("session_number, title, summary")
        .eq("campaign_id", body.campaign_id)
        .lt("session_number", s["session_number"])
        .order("session_number", desc=True)
        .limit(1)
        .execute()
    )

    # All public notes linked to this session
    notes_res = (
        sb.table("notes")
        .select("content, profiles(display_name)")
        .eq("campaign_id", body.campaign_id)
        .eq("related_entity_type", "session")
        .eq("related_entity_id", body.session_id)
        .eq("visibility", "public")
        .order("created_at")
        .execute()
    )

    notes = notes_res.data or []
    has_player_notes = bool(s.get("player_notes"))

    # Bail early if there is nothing to recap
    if not notes and not has_player_notes:
        return {
            "recap": (
                "No notes found for this session. "
                "Add some notes first, then generate a recap."
            )
        }

    # --- Build the context string for Claude ---

    lines: list[str] = [
        f"Campaign: {c['name']} ({c['system']})",
        f"Session {s['session_number']}: {s.get('title') or 'Untitled'}",
        "",
    ]

    # Include previous session summary for continuity
    prev_sessions = prev_res.data or []
    if prev_sessions and prev_sessions[0].get("summary"):
        p = prev_sessions[0]
        lines.append(
            f"Previous session recap "
            f"(Session {p['session_number']}: "
            f"{p.get('title') or 'Untitled'}):"
        )
        lines.append(p["summary"])
        lines.append("")

    # Current session's built-in player_notes field
    if has_player_notes:
        lines.append("Session player notes:")
        lines.append(s["player_notes"])
        lines.append("")

    # Individual contributed notes with author attribution
    if notes:
        lines.append("Contributed notes:")
        for n in notes:
            author = "Unknown"
            if n.get("profiles") and n["profiles"].get("display_name"):
                author = n["profiles"]["display_name"]
            lines.append(f"  [{author}] {n['content']}")

    context = "\n".join(lines)

    # --- Call Claude via PydanticAI ---

    agent = Agent(model, system_prompt=RECAP_SYSTEM_PROMPT)
    result = await agent.run(
        f"Generate a narrative recap from these session notes:\n\n{context}"
    )

    return {"recap": result.output}
