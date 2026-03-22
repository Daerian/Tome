"""
Generate router — handles AI chat requests with optional campaign context.

When a campaign_id is provided the router fetches all sessions and public
session notes from Supabase and injects them into the system prompt so the
LLM can answer questions grounded in the campaign's history.
"""

from fastapi import APIRouter
from pydantic import BaseModel
from pydantic_ai import Agent
from pydantic_ai.messages import (
    ModelRequest,
    ModelResponse,
    UserPromptPart,
    TextPart,
)
from pydantic_ai.models.anthropic import AnthropicModel
from pydantic_ai.providers.anthropic import AnthropicProvider
from dotenv import load_dotenv
from supabase_client import supabase as sb
import os

# Load .env before reading any env vars so the API key is available locally.
# In production (Render) the key is already in the environment — load_dotenv
# is a no-op.
load_dotenv()

router = APIRouter()  # FastAPI router — groups endpoints under /api prefix in main.py

# Toggle console-only output for local development
TESTING_MODE = os.getenv("TESTING_MODE", "false").lower() == "true"

# Reusable model instance — the API call is the expensive part, not the object
model = AnthropicModel(
    "claude-haiku-4-5",
    provider=AnthropicProvider(api_key=os.getenv("ANTHROPIC_API_KEY")),
)

# Base persona that gets extended with campaign context when available
SYSTEM_PROMPT_BASE = (
    '''
    You are Tome, a D&D companion assistant.
    You help players and DMs with their campaigns, recalling past sessions, 
    characters, locations, and lore. Answer based on the campaign history
    provided. If information isn't in the session history, say so rather 
    than making things up.
    '''
)


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------


class Message(BaseModel):
    """A single chat message with a speaker role and text content."""

    role: str      # "user" or "assistant"
    content: str   # the message text


class GenerateRequest(BaseModel):
    """The full conversation history sent from the frontend on each request.

    Attributes
    ----------
    messages : list[Message]
        Ordered oldest-to-newest; the last item is always the new user prompt.
    campaign_id : str | None
        Optional campaign UUID. When present the backend fetches campaign
        sessions and notes to enrich the system prompt.
    """

    messages: list[Message]
    campaign_id: str | None = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def build_history(messages: list[Message]) -> list:
    """Convert frontend message dicts into PydanticAI typed message objects.

    The frontend sends plain ``{role, content}`` dicts. PydanticAI requires
    ``ModelRequest`` (user turns) and ``ModelResponse`` (assistant turns) so
    that it can validate and trace the conversation correctly.

    Parameters
    ----------
    messages : list[Message]
        All messages *except* the latest user prompt — i.e. the prior
        conversation history to pass as context to the model.

    Returns
    -------
    list
        A list of ``ModelRequest`` and ``ModelResponse`` objects ready to
        pass to ``agent.run(..., message_history=...)``.
    """
    history = []  # accumulates typed PydanticAI message objects

    for msg in messages:
        if msg.role == "user":
            # UserPromptPart wraps the text; ModelRequest is the container
            # for user turns
            history.append(
                ModelRequest(parts=[UserPromptPart(content=msg.content)])
            )
        else:
            # TextPart wraps the text; ModelResponse is the container for
            # assistant turns
            history.append(
                ModelResponse(parts=[TextPart(content=msg.content)])
            )

    return history


def get_campaign_context(campaign_id: str) -> str:
    """Fetch campaign sessions and notes from Supabase to build LLM context.

    Uses the backend's secret key (bypasses RLS) to pull:
    - Campaign name, description, and game system
    - All sessions ordered by session number
    - All public session notes with author display names

    The resulting string is appended to ``SYSTEM_PROMPT_BASE`` so the LLM
    can answer questions about the campaign's history.

    Parameters
    ----------
    campaign_id : str
        UUID of the campaign to fetch context for.

    Returns
    -------
    str
        A multi-line text block summarising the campaign's session history.
    """
    # --- Fetch data from Supabase ---

    campaign_res = (
        sb.table("campaigns")
        .select("name, description, system")
        .eq("id", campaign_id)
        .single()
        .execute()
    )

    sessions_res = (
        sb.table("sessions")
        .select(
            "id, session_number, title, summary, player_notes, "
            "status, played_date"
        )
        .eq("campaign_id", campaign_id)
        .order("session_number")
        .execute()
    )

    notes_res = (
        sb.table("notes")
        .select("title, content, related_entity_id, profiles(display_name)")
        .eq("campaign_id", campaign_id)
        .eq("type", "session_note")
        .eq("visibility", "public")
        .execute()
    )

    # --- Build context string ---

    lines: list[str] = []

    if campaign_res.data:
        c = campaign_res.data
        lines.append(f"=== CAMPAIGN: {c['name']} ===")
        if c.get("description"):
            lines.append(f"Description: {c['description']}")
        lines.append(f"System: {c['system']}")
        lines.append("")

    sessions = sessions_res.data or []
    notes = notes_res.data or []

    if sessions:
        lines.append("=== SESSION HISTORY ===")

        for s in sessions:
            title = s.get("title") or "Untitled"
            lines.append(
                f"\n--- Session {s['session_number']}: {title} ---"
            )
            if s.get("played_date"):
                lines.append(f"Date Played: {s['played_date']}")
            lines.append(f"Status: {s['status']}")
            if s.get("summary"):
                lines.append(f"Summary: {s['summary']}")
            if s.get("player_notes"):
                lines.append(f"Player Notes: {s['player_notes']}")

            # Attach contributed notes that reference this session
            session_notes = [
                n for n in notes if n.get("related_entity_id") == s["id"]
            ]
            if session_notes:
                lines.append("Contributed Notes:")
                for n in session_notes:
                    author = "Unknown"
                    if (
                        n.get("profiles")
                        and n["profiles"].get("display_name")
                    ):
                        author = n["profiles"]["display_name"]
                    lines.append(f"  [{author}] {n.get('content', '')}")
    else:
        lines.append(
            "No sessions have been recorded yet for this campaign."
        )

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------


@router.post("/generate")
async def generate(body: GenerateRequest):
    """Receive conversation history, optionally enrich with campaign context,
    and call LLM via PydanticAI.

    All messages except the last are treated as history; the last message is
    the new user prompt sent to the model. When ``campaign_id`` is provided
    the system prompt is enriched with session summaries and notes so the LLM
    can answer campaign-specific questions.

    Parameters
    ----------
    body : GenerateRequest
        Request body containing the full ordered message history and an
        optional campaign UUID.

    Returns
    -------
    dict
        ``{"result": str}`` with Claude's response, or
        ``{"result": str, "testing": True}`` when TESTING_MODE is enabled.
    """
    # Build the system prompt — extend with campaign context if available
    system_prompt = SYSTEM_PROMPT_BASE

    if body.campaign_id:
        try:
            context = get_campaign_context(body.campaign_id)
            if context:
                system_prompt = f"{SYSTEM_PROMPT_BASE}\n\n{context}"
        except Exception as e:
            # If context fetch fails, fall back to the base prompt rather
            # than breaking the entire request
            if TESTING_MODE:
                print(f"Failed to fetch campaign context: {e}")

    # Create an agent scoped to this request's system prompt.  The model
    # object is reused; only the lightweight Agent wrapper is recreated.
    campaign_agent = Agent(model, system_prompt=system_prompt)

    history = build_history(body.messages[:-1])   # prior turns
    user_prompt = body.messages[-1].content        # the new message

    # Call LLM via PydanticAI
    result = await campaign_agent.run(
        user_prompt, message_history=history
    )

    if TESTING_MODE:
        print("\n--- TESTING MODE ---")
        print(f"Campaign ID: {body.campaign_id}")
        print(f"System prompt length: {len(system_prompt)} chars")
        print(f"History depth: {len(history)} messages")
        print(f"User: {user_prompt}")
        print(f"Response: {result.output}")
        print("--------------------\n")
        return {"result": result.output, "testing": True}

    return {"result": result.output}