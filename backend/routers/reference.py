"""
Reference router — D&D 5e rules lookup via Open5e API.

Provides a chat interface backed by tools that query the Open5e API for
official SRD content (monsters, spells, items, conditions, classes, races,
and general rules).
"""

import os

from dotenv import load_dotenv
from fastapi import APIRouter
from pydantic import BaseModel
from pydantic_ai import Agent
from pydantic_ai.messages import (
    ModelRequest,
    ModelResponse,
    TextPart,
    UserPromptPart,
)
from pydantic_ai.models.anthropic import AnthropicModel
from pydantic_ai.providers.anthropic import AnthropicProvider

from tools.fivetools_tools import (
    ALL_5ETOOLS_TOOLS,
    browse_5etools_source,
    lookup_5etools_monster,
)
from tools.reference_tools import ALL_REFERENCE_TOOLS, lookup_monster

load_dotenv()

router = APIRouter()

TESTING_MODE = os.getenv("TESTING_MODE", "false").lower() == "true"

model = AnthropicModel(
    os.getenv("CHAT_MODEL", "claude-haiku-4-5"),
    provider=AnthropicProvider(api_key=os.getenv("ANTHROPIC_API_KEY")),
)

# --- Tool lists by role ---
# DM gets all tools including monster lookups
DM_TOOLS = ALL_REFERENCE_TOOLS + ALL_5ETOOLS_TOOLS

# Players get everything except monster stat lookups
PLAYER_TOOLS = [t for t in ALL_REFERENCE_TOOLS if t is not lookup_monster] + [
    t
    for t in ALL_5ETOOLS_TOOLS
    if t not in (lookup_5etools_monster, browse_5etools_source)
]

DM_SYSTEM_PROMPT = (
    "You are Tome's D&D reference assistant. You help Dungeon Masters and "
    "players look up official D&D 5th Edition rules, monsters, spells, "
    "items, feats, conditions, classes, races, and adventure modules.\n\n"
    "You have two data sources:\n"
    "1. Open5e API tools (lookup_spell, lookup_monster, etc.) — fast lookups "
    "for SRD content.\n"
    "2. 5etools compendium tools (lookup_5etools_monster, lookup_5etools_spell, "
    "etc.) — covers ALL official sourcebooks including non-SRD content like "
    "Xanathar's, Tasha's, Volo's, Mordenkainen's, and adventure modules.\n\n"
    "Strategy: Try the Open5e tools first for basic SRD lookups. Use the "
    "5etools tools when the user asks for content from a specific non-SRD "
    "sourcebook, or when Open5e returns no results.\n"
    "Use browse_5etools_source to list content from a specific sourcebook.\n"
    "Use browse_5etools_adventure to navigate adventure module chapters.\n\n"
    "Always base your answers on the data returned by your tools. "
    "If a tool returns no results, say so — do not guess or make up stats.\n\n"
    "IMPORTANT: When tool results contain [STATBLOCK]...[/STATBLOCK] blocks, "
    "you MUST include them verbatim in your response without modification. "
    "These are machine-readable data blocks used by the frontend.\n\n"
    "Format stat blocks and spell descriptions clearly and readably."
)

PLAYER_SYSTEM_PROMPT = (
    "You are Tome's D&D reference assistant. You help players look up "
    "official D&D 5th Edition rules, spells, items, feats, conditions, "
    "classes, and races.\n\n"
    "You have two data sources:\n"
    "1. Open5e API tools (lookup_spell, etc.) — fast lookups for SRD content.\n"
    "2. 5etools compendium tools (lookup_5etools_spell, etc.) — covers ALL "
    "official sourcebooks.\n\n"
    "Strategy: Try the Open5e tools first. Use 5etools when the user asks for "
    "non-SRD content or when Open5e returns no results.\n\n"
    "IMPORTANT: You do NOT have access to monster stat blocks. If a player "
    "asks for monster stats, politely let them know that monster information "
    "is only available to the Dungeon Master. You can still discuss general "
    "monster lore or tactics that a character might know.\n\n"
    "Always base your answers on the data returned by your tools. "
    "If a tool returns no results, say so — do not guess or make up stats.\n\n"
    "Format spell descriptions and rules clearly and readably."
)

dm_ref_agent = Agent(
    model,
    system_prompt=DM_SYSTEM_PROMPT,
    tools=DM_TOOLS,
)

player_ref_agent = Agent(
    model,
    system_prompt=PLAYER_SYSTEM_PROMPT,
    tools=PLAYER_TOOLS,
)


# ---------------------------------------------------------------------------
# Request model
# ---------------------------------------------------------------------------


class Message(BaseModel):
    role: str
    content: str


class RefRequest(BaseModel):
    messages: list[Message]
    system: str | None = None
    role: str | None = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def build_history(messages: list[Message]) -> list:
    """Convert frontend messages to PydanticAI typed objects."""
    history = []
    for msg in messages:
        if msg.role == "user":
            history.append(ModelRequest(parts=[UserPromptPart(content=msg.content)]))
        else:
            history.append(ModelResponse(parts=[TextPart(content=msg.content)]))
    return history


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------


@router.post("/ref")
async def reference(body: RefRequest):
    """Answer D&D reference questions using Open5e API tools."""

    history = build_history(body.messages[:-1])
    user_prompt = body.messages[-1].content

    # Inject edition context so the LLM filters by the correct ruleset
    edition_context = ""
    if body.system == "5e-2024":
        edition_context = (
            "[EDITION CONTEXT: This campaign uses D&D 5th Edition 2024 rules. "
            "When looking up monsters, spells, or other content, always pass "
            "edition='2024' to 5etools tools. Prefer XPHB for spells and XMM "
            "for monsters. Only fall back to 2014 sources if 2024 has no results.]\n\n"
        )
    elif body.system == "5e-2014":
        edition_context = (
            "[EDITION CONTEXT: This campaign uses D&D 5th Edition 2014 rules. "
            "When looking up monsters, spells, or other content, always pass "
            "edition='2014' to 5etools tools. Use PHB for spells and MM for "
            "monsters. Do not use 2024 sources (XPHB, XMM).]\n\n"
        )

    agent = dm_ref_agent if body.role == "dm" else player_ref_agent
    result = await agent.run(edition_context + user_prompt, message_history=history)

    if TESTING_MODE:
        print("\n--- REFERENCE MODE ---")
        print(f"User: {user_prompt}")
        print(f"Response: {result.output}")
        print("----------------------\n")
        return {"result": result.output, "testing": True}

    return {"result": result.output}
