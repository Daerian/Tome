"""
Generate router — handles AI chat requests with optional campaign context.

When a campaign_id is provided the router uses a tool-equipped agent that
can query and modify campaign data on demand via Supabase.  When no
campaign_id is provided a simpler general-purpose agent is used.
"""

import os

from dotenv import load_dotenv
from fastapi import APIRouter
from pydantic import BaseModel
from pydantic_ai import Agent, RunContext
from pydantic_ai.messages import (
    ModelRequest,
    ModelResponse,
    TextPart,
    UserPromptPart,
)
from pydantic_ai.models.anthropic import AnthropicModel
from pydantic_ai.providers.anthropic import AnthropicProvider

from supabase_client import supabase as sb
from tools.campaign_tools import ALL_CAMPAIGN_TOOLS
from tools.deps import CampaignDeps
from tools.fivetools_tools import ADVENTURE_MAP
from tools.soundboard_tools import ALL_SOUNDBOARD_TOOLS

# Load .env before reading any env vars so the API key is available locally.
# In production (Render) the key is already in the environment — load_dotenv
# is a no-op.
load_dotenv()

router = APIRouter()  # FastAPI router — groups endpoints under /api prefix in main.py

# Toggle console-only output for local development
TESTING_MODE = os.getenv("TESTING_MODE", "false").lower() == "true"

# Configurable model via env var — defaults to Haiku 4.5
model = AnthropicModel(
    os.getenv("CHAT_MODEL", "claude-haiku-4-5"),
    provider=AnthropicProvider(api_key=os.getenv("ANTHROPIC_API_KEY")),
)

# Base persona shared by both agents
SYSTEM_PROMPT_BASE = (
    "You are Tome, a D&D companion assistant.\n"
    "You help players and DMs with their campaigns, recalling past sessions, "
    "characters, locations, and lore.\n\n"
    "When a user asks about campaign-specific information, use your tools to "
    "look up the relevant data rather than guessing. If your tools return no "
    "results, tell the user that information is not available.\n\n"
    "Do not make up information that is not in the campaign data. "
    "Be concise but thorough in your responses."
)


# ---------------------------------------------------------------------------
# Agents
# ---------------------------------------------------------------------------

# General agent — no tools, for non-campaign chat
general_agent = Agent(model, system_prompt=SYSTEM_PROMPT_BASE)

# Campaign agent — tool-equipped, for campaign-scoped chat
campaign_agent = Agent(
    model,
    system_prompt=SYSTEM_PROMPT_BASE,
    deps_type=CampaignDeps,
    tools=ALL_CAMPAIGN_TOOLS,
)


# ---------------------------------------------------------------------------
# Soundboard agent — structured track suggestions for a given session scene
# ---------------------------------------------------------------------------


class TrackSuggestion(BaseModel):
    """A single recommended ambient track with a fit rationale."""

    id: str  # e.g. "tabletop_audio:42"
    title: str
    reason: str  # one sentence explaining why this track fits the scene


class SoundboardSuggestResult(BaseModel):
    """Structured output from the soundboard agent."""

    suggestions: list[TrackSuggestion]


soundboard_agent = Agent(
    model,
    result_type=SoundboardSuggestResult,
    system_prompt=(
        "You are a D&D scene music curator for the app Tome. "
        "Given a campaign session's context, select exactly 3 ambient music tracks "
        "from the library that best fit the mood, tone, and setting.\n\n"
        "Steps:\n"
        "1. Call get_scene_context with the provided session_id to understand the scene.\n"
        "2. Call search_soundboard_library one or more times with relevant queries "
        "(e.g. the location type, dominant tone, active threat, narrative theme).\n"
        "3. Return exactly 3 tracks ranked by fit, with a one-sentence reason each.\n\n"
        "Focus on: location environment (dungeon, tavern, forest, city, sea), "
        "emotional tone (tense, mysterious, peaceful, celebratory, ominous), "
        "active threats or missions, and the overall narrative arc."
    ),
    deps_type=CampaignDeps,
    tools=ALL_SOUNDBOARD_TOOLS,
)


@campaign_agent.system_prompt
def _campaign_overview(ctx: RunContext[CampaignDeps]) -> str:
    """Dynamically inject a lightweight campaign overview into the system
    prompt.  This runs before each agent.run() and gives the LLM enough
    orientation to know what data is available without dumping everything."""

    return get_campaign_overview(ctx.deps.supabase, ctx.deps.campaign_id)


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------


class Message(BaseModel):
    """A single chat message with a speaker role and text content."""

    role: str  # "user" or "assistant"
    content: str  # the message text


class GenerateRequest(BaseModel):
    """The full conversation history sent from the frontend on each request."""

    messages: list[Message]
    campaign_id: str | None = None
    user_id: str | None = None
    role: str | None = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def build_history(messages: list[Message]) -> list:
    """Convert frontend message dicts into PydanticAI typed message objects.

    The frontend sends plain ``{role, content}`` dicts. PydanticAI requires
    ``ModelRequest`` (user turns) and ``ModelResponse`` (assistant turns) so
    that it can validate and trace the conversation correctly.
    """
    history = []

    for msg in messages:
        if msg.role == "user":
            history.append(ModelRequest(parts=[UserPromptPart(content=msg.content)]))
        else:
            history.append(ModelResponse(parts=[TextPart(content=msg.content)]))

    return history


def get_campaign_overview(supabase, campaign_id: str) -> str:
    """Fetch campaign metadata and entity counts for a lightweight system
    prompt.  This replaces the old get_campaign_context() which dumped all
    sessions and notes into the prompt."""

    campaign_res = (
        supabase.table("campaigns")
        .select("name, description, system, adventure_source")
        .eq("id", campaign_id)
        .single()
        .execute()
    )
    if not campaign_res.data:
        return ""

    c = campaign_res.data

    # Quick counts via select("id") — lightweight queries
    sessions = (
        supabase.table("sessions")
        .select("id")
        .eq("campaign_id", campaign_id)
        .execute()
        .data
        or []
    )
    characters = (
        supabase.table("characters")
        .select("id, type")
        .eq("campaign_id", campaign_id)
        .execute()
        .data
        or []
    )
    locations = (
        supabase.table("locations")
        .select("id")
        .eq("campaign_id", campaign_id)
        .execute()
        .data
        or []
    )
    missions = (
        supabase.table("missions")
        .select("id")
        .eq("campaign_id", campaign_id)
        .in_("status", ["available", "active"])
        .execute()
        .data
        or []
    )
    beats = (
        supabase.table("story_beats")
        .select("id")
        .eq("campaign_id", campaign_id)
        .in_("status", ["planted", "active"])
        .execute()
        .data
        or []
    )
    factions = (
        supabase.table("factions")
        .select("id")
        .eq("campaign_id", campaign_id)
        .eq("status", "active")
        .execute()
        .data
        or []
    )

    pc_count = len([ch for ch in characters if ch.get("type") == "pc"])
    npc_count = len(characters) - pc_count

    lines = [
        f"\n=== CAMPAIGN: {c['name']} ===",
    ]
    if c.get("description"):
        lines.append(f"Description: {c['description']}")
    system = c.get("system", "5e-2014")
    lines.append(f"System: {system}")
    if system == "5e-2024":
        lines.append(
            "Edition: 2024 rules. When using 5etools lookup tools, always pass "
            "edition='2024'. Prefer XPHB for spells and XMM for monsters."
        )
    elif system == "5e-2014":
        lines.append(
            "Edition: 2014 rules. When using 5etools lookup tools, always pass "
            "edition='2014'. Use PHB for spells and MM for monsters. "
            "Do not use 2024 sources (XPHB, XMM)."
        )
    lines.append("")
    lines.append("Available campaign data (use your tools to look up details):")
    lines.append(f"- {len(sessions)} sessions")
    lines.append(f"- {pc_count} PCs, {npc_count} NPCs/companions")
    lines.append(f"- {len(locations)} locations")
    lines.append(f"- {len(missions)} active missions")
    lines.append(f"- {len(beats)} active story beats")
    lines.append(f"- {len(factions)} active factions")

    # Adventure module context
    adv_code = c.get("adventure_source")
    if adv_code and adv_code.lower() in ADVENTURE_MAP:
        adv_name = ADVENTURE_MAP[adv_code.lower()][0]
        lines.append("")
        lines.append(f"Adventure Module: {adv_name} ({adv_code.upper()})")
        lines.append(
            "This campaign is based on a published adventure. Use the "
            "browse_5etools_adventure tool with adventure='"
            f"{adv_code.lower()}' to look up chapter content when the user "
            "asks about adventure details, encounters, locations, or plot."
        )

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------


@router.post("/generate")
async def generate(body: GenerateRequest):
    """Receive conversation history, optionally use campaign tools, and
    return the LLM response.

    When ``campaign_id`` is provided the campaign agent is used with tools
    that can query and modify campaign data.  Otherwise a general agent
    answers without tools.
    """
    history = build_history(body.messages[:-1])
    user_prompt = body.messages[-1].content

    if body.campaign_id:
        deps = CampaignDeps(
            supabase=sb,
            campaign_id=body.campaign_id,
            user_id=body.user_id or "",
            role=body.role or "spectator",
        )
        result = await campaign_agent.run(
            user_prompt, deps=deps, message_history=history
        )
    else:
        result = await general_agent.run(user_prompt, message_history=history)

    if TESTING_MODE:
        print("\n--- TESTING MODE ---")
        print(f"Campaign ID: {body.campaign_id}")
        print(f"History depth: {len(history)} messages")
        print(f"User: {user_prompt}")
        print(f"Response: {result.output}")
        print("--------------------\n")
        return {"result": result.output, "testing": True}

    return {"result": result.output}
