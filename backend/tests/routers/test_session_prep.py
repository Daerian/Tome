"""
Tests for routers/session_prep.py.

Covers:
- build_session_prep_context() — not found, minimal data, dm_prep_notes,
  attendees, NPCs, story beats, missions, timeline events, locations, factions
- POST /api/session-prep — not found, success + persists brief
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from main import app
from routers.session_prep import build_session_prep_context


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_sb(table_data: dict) -> MagicMock:
    """
    Build a chainable Supabase mock.

    Values in table_data can be:
    - A plain value (returned for every call to that table)
    - A tuple of values (returned in sequence, one per call)
    """
    sb = MagicMock()
    call_counts: dict[str, int] = {}

    def _table(name):
        chain = MagicMock()
        for method in ("select", "eq", "neq", "order", "limit", "single", "in_", "update"):
            getattr(chain, method).return_value = chain

        values = table_data.get(name)
        if isinstance(values, tuple):
            idx = call_counts.get(name, 0)
            data = values[idx] if idx < len(values) else values[-1]
            call_counts[name] = idx + 1
        else:
            data = values

        chain.execute.return_value = MagicMock(data=data)
        return chain

    sb.table.side_effect = _table
    return sb


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

CAMPAIGN = {"name": "Shattered Realms", "description": "A world torn apart.", "system": "D&D 5e"}
SESSION = {
    "session_number": 5,
    "title": "The Siege",
    "status": "planned",
    "dm_notes": "Big battle incoming.",
    "in_world_start_date": "15 Flamerule",
    "in_world_end_date": "16 Flamerule",
    "prep_items": [],
}
ATTENDEE = {
    "character_id": "char-1",
    "characters": {
        "id": "char-1",
        "name": "Zara",
        "race": "Elf",
        "class": "Wizard",
        "level": 5,
        "description": "A curious mage.",
        "backstory": "Raised in a tower.",
        "status": "active",
    },
}
NPC = {
    "id": "npc-1",
    "name": "Lord Vance",
    "type": "npc",
    "race": "Human",
    "class": "Fighter",
    "level": 10,
    "description": "City commander.",
    "status": "alive",
}
BEAT = {
    "title": "The Siege Begins",
    "description": "Enemy forces approach.",
    "type": "cliffhanger",
    "status": "active",
    "notes": "DM knows the enemy leader.",
    "sort_order": 1,
}
MISSION = {
    "title": "Hold the Gate",
    "description": "Defend the city gate.",
    "type": "main",
    "status": "active",
    "priority": "critical",
    "reward_description": "City's gratitude",
    "notes": "Barricade first.",
    "quest_giver_id": None,
}
EVENT = {
    "title": "Enemy spotted",
    "description": "Scouts report movement.",
    "event_type": "military",
    "importance": "major",
    "in_world_date": "14 Flamerule",
    "location_id": None,
}
LOCATION = {
    "id": "loc-1",
    "name": "City Gate",
    "type": "structure",
    "description": "The main entrance.",
    "parent_location_id": None,
}
FACTION = {
    "name": "The Guard",
    "type": "military",
    "description": "City defenders.",
    "alignment": "lawful good",
    "status": "active",
    "goals": "Protect the city.",
    "leader_character_id": None,
    "headquarters_location_id": None,
}


def _full_sb(**overrides):
    """Return a mock sb with all tables populated, with optional overrides."""
    data = {
        "campaigns": CAMPAIGN,
        # sessions: first call = current session, second call = prev sessions list
        "sessions": (SESSION, []),
        "session_attendees": [ATTENDEE],
        "characters": [NPC],
        "story_beats": [BEAT],
        "missions": [MISSION],
        "timeline_events": [EVENT],
        "locations": [LOCATION],
        "factions": [FACTION],
        "notes": [],
    }
    data.update(overrides)
    return _make_sb(data)


# ---------------------------------------------------------------------------
# build_session_prep_context() unit tests
# ---------------------------------------------------------------------------


def test_build_context_returns_none_when_campaign_missing():
    sb = _full_sb(campaigns=None)
    with patch("routers.session_prep.sb", sb):
        result = build_session_prep_context("s1", "c1")
    assert result is None


def test_build_context_returns_none_when_session_missing():
    sb = _full_sb(sessions=(None, []))
    with patch("routers.session_prep.sb", sb):
        result = build_session_prep_context("s1", "c1")
    assert result is None


def test_build_context_includes_campaign_header():
    sb = _full_sb()
    with patch("routers.session_prep.sb", sb):
        result = build_session_prep_context("s1", "c1")

    assert "Shattered Realms" in result
    assert "D&D 5e" in result


def test_build_context_includes_dm_prep_notes():
    sb = _full_sb()
    with patch("routers.session_prep.sb", sb):
        result = build_session_prep_context("s1", "c1", dm_prep_notes="Move to the Underdark.")

    assert "DM'S PLANS FOR THIS SESSION" in result
    assert "Move to the Underdark." in result


def test_build_context_omits_dm_prep_section_when_empty():
    sb = _full_sb()
    with patch("routers.session_prep.sb", sb):
        result = build_session_prep_context("s1", "c1", dm_prep_notes="   ")

    assert "DM'S PLANS FOR THIS SESSION" not in result


def test_build_context_includes_attending_characters():
    sb = _full_sb()
    with patch("routers.session_prep.sb", sb):
        result = build_session_prep_context("s1", "c1")

    assert "Zara" in result
    assert "Elf Wizard" in result
    assert "Raised in a tower." in result


def test_build_context_no_attendees_message():
    sb = _full_sb(session_attendees=[])
    with patch("routers.session_prep.sb", sb):
        result = build_session_prep_context("s1", "c1")

    assert "No attendees registered" in result


def test_build_context_includes_npcs():
    sb = _full_sb()
    with patch("routers.session_prep.sb", sb):
        result = build_session_prep_context("s1", "c1")

    assert "Lord Vance" in result
    assert "City commander." in result


def test_build_context_includes_story_beats():
    sb = _full_sb()
    with patch("routers.session_prep.sb", sb):
        result = build_session_prep_context("s1", "c1")

    assert "The Siege Begins" in result
    assert "Enemy forces approach." in result


def test_build_context_includes_missions():
    sb = _full_sb()
    with patch("routers.session_prep.sb", sb):
        result = build_session_prep_context("s1", "c1")

    assert "Hold the Gate" in result
    assert "City's gratitude" in result


def test_build_context_includes_locations():
    sb = _full_sb()
    with patch("routers.session_prep.sb", sb):
        result = build_session_prep_context("s1", "c1")

    assert "City Gate" in result


def test_build_context_includes_factions():
    sb = _full_sb()
    with patch("routers.session_prep.sb", sb):
        result = build_session_prep_context("s1", "c1")

    assert "The Guard" in result
    assert "Protect the city." in result


# ---------------------------------------------------------------------------
# POST /api/session-prep tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_session_prep_not_found():
    sb = _full_sb(campaigns=None)
    with patch("routers.session_prep.sb", sb):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.post(
                "/api/session-prep",
                json={"session_id": "s1", "campaign_id": "missing"},
            )

    assert response.status_code == 200
    assert "not found" in response.json()["prep"].lower()


@pytest.mark.asyncio
async def test_session_prep_calls_agent_and_returns_brief():
    mock_result = MagicMock()
    mock_result.output = "## Story So Far\nThe party fought bravely..."
    sb = _full_sb()

    with patch("routers.session_prep.sb", sb):
        with patch("routers.session_prep.Agent") as MockAgent:
            MockAgent.return_value.run = AsyncMock(return_value=mock_result)
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                response = await client.post(
                    "/api/session-prep",
                    json={"session_id": "s1", "campaign_id": "c1"},
                )

    assert response.status_code == 200
    assert response.json()["prep"] == "## Story So Far\nThe party fought bravely..."


@pytest.mark.asyncio
async def test_session_prep_persists_brief():
    """The generated brief must be saved back to the session record."""
    mock_result = MagicMock()
    mock_result.output = "## Story So Far\nBrief content."
    sb = _full_sb()

    with patch("routers.session_prep.sb", sb):
        with patch("routers.session_prep.Agent") as MockAgent:
            MockAgent.return_value.run = AsyncMock(return_value=mock_result)
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                await client.post(
                    "/api/session-prep",
                    json={"session_id": "s1", "campaign_id": "c1"},
                )

    # Verify sb.table("sessions").update(...).eq(...).execute() was called
    sb.table.assert_any_call("sessions")


@pytest.mark.asyncio
async def test_session_prep_passes_dm_notes_in_context():
    mock_result = MagicMock()
    mock_result.output = "Brief."
    sb = _full_sb()

    with patch("routers.session_prep.sb", sb):
        with patch("routers.session_prep.Agent") as MockAgent:
            MockAgent.return_value.run = AsyncMock(return_value=mock_result)
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                await client.post(
                    "/api/session-prep",
                    json={
                        "session_id": "s1",
                        "campaign_id": "c1",
                        "dm_prep_notes": "Focus on the boss fight.",
                    },
                )

    prompt = MockAgent.return_value.run.call_args.args[0]
    assert "Focus on the boss fight." in prompt


@pytest.mark.asyncio
async def test_session_prep_invalid_body_returns_422():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post("/api/session-prep", json={"wrong": "field"})

    assert response.status_code == 422
