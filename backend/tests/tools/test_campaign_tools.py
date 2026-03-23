"""
Tests for tools/campaign_tools.py.

Each tool is tested with a mocked Supabase client and a mock RunContext.
"""

import pytest
from unittest.mock import MagicMock
from tools.deps import CampaignDeps
from tools.campaign_tools import (
    get_session_list,
    get_session_details,
    search_characters,
    search_notes,
    get_locations,
    get_missions,
    get_factions,
    get_story_beats,
    get_timeline_events,
    add_note,
    update_character_status,
    add_timeline_event,
    update_mission_status,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_ctx(role="dm", data_map=None):
    """Create a mock RunContext with a chainable mock Supabase client.

    Parameters
    ----------
    role : str
        Role for the CampaignDeps (dm, player, spectator).
    data_map : dict | None
        Optional mapping of table names to return data. Each table's
        chained query will return the specified data from .execute().
    """
    data_map = data_map or {}

    def _make_chain(table_name):
        """Build a chainable mock where every method returns self and
        .execute() returns the configured data."""
        chain = MagicMock()
        result = MagicMock()
        result.data = data_map.get(table_name, [])
        chain.execute.return_value = result

        # Make every query method return the chain itself
        for method in [
            "select", "eq", "neq", "ilike", "in_", "order",
            "limit", "single", "insert", "update",
        ]:
            getattr(chain, method).return_value = chain

        return chain

    mock_sb = MagicMock()
    mock_sb.table.side_effect = lambda name: _make_chain(name)

    ctx = MagicMock()
    ctx.deps = CampaignDeps(
        supabase=mock_sb,
        campaign_id="test-campaign",
        user_id="test-user",
        role=role,
    )
    return ctx


# ---------------------------------------------------------------------------
# Read tool tests
# ---------------------------------------------------------------------------

class TestGetSessionList:
    def test_empty_returns_message(self):
        ctx = _make_ctx()
        result = get_session_list(ctx)
        assert "No sessions" in result

    def test_formats_sessions(self):
        ctx = _make_ctx(data_map={
            "sessions": [
                {
                    "session_number": 1,
                    "title": "The Beginning",
                    "status": "completed",
                    "played_date": "2025-01-15",
                    "summary": "The party met at a tavern.",
                },
                {
                    "session_number": 2,
                    "title": "Into the Dungeon",
                    "status": "planned",
                    "played_date": None,
                    "summary": "",
                },
            ]
        })
        result = get_session_list(ctx)
        assert "Session 1" in result
        assert "The Beginning" in result
        assert "completed" in result
        assert "Session 2" in result


class TestSearchCharacters:
    def test_empty_returns_message(self):
        ctx = _make_ctx()
        result = search_characters(ctx, name="Gandalf")
        assert "No characters found" in result
        assert "Gandalf" in result

    def test_formats_characters(self):
        ctx = _make_ctx(data_map={
            "characters": [
                {
                    "name": "Thorin",
                    "type": "pc",
                    "race": "Dwarf",
                    "class": "Fighter",
                    "level": 5,
                    "alignment": "Lawful Good",
                    "status": "alive",
                    "description": "A stout warrior",
                    "backstory": "Exiled prince of the mountain.",
                }
            ]
        })
        result = search_characters(ctx)
        assert "Thorin" in result
        assert "Dwarf" in result
        assert "Fighter" in result
        assert "Exiled prince" in result


class TestGetStoryBeats:
    def test_empty_returns_message(self):
        ctx = _make_ctx()
        result = get_story_beats(ctx)
        assert "No active story beats" in result

    def test_formats_beats(self):
        ctx = _make_ctx(data_map={
            "story_beats": [
                {
                    "title": "The Prophecy",
                    "description": "An ancient prophecy foretold...",
                    "type": "main_plot",
                    "status": "active",
                    "notes": "Reveal in session 5",
                    "sort_order": 1,
                }
            ]
        })
        result = get_story_beats(ctx)
        assert "The Prophecy" in result
        assert "main_plot" in result


class TestGetTimelineEvents:
    def test_empty_returns_message(self):
        ctx = _make_ctx()
        result = get_timeline_events(ctx)
        assert "No timeline events" in result

    def test_caps_limit_at_50(self):
        ctx = _make_ctx()
        # Should not raise even with large limit
        get_timeline_events(ctx, limit=100)


# ---------------------------------------------------------------------------
# Write tool tests
# ---------------------------------------------------------------------------

class TestAddNote:
    def test_creates_note(self):
        ctx = _make_ctx(data_map={
            "notes": [{"id": "new-note-id"}]
        })
        result = add_note(ctx, session_id="session-1", content="Thorin found the sword")
        assert "Note saved" in result
        assert "Thorin found the sword" in result

    def test_any_role_can_add_notes(self):
        ctx = _make_ctx(role="player", data_map={
            "notes": [{"id": "new-note-id"}]
        })
        result = add_note(ctx, session_id="session-1", content="A note from a player")
        assert "Note saved" in result


class TestUpdateCharacterStatus:
    def test_dm_can_update(self):
        ctx = _make_ctx(role="dm", data_map={
            "characters": [{"id": "char-1", "name": "Thorin", "status": "alive"}]
        })
        result = update_character_status(ctx, character_name="Thorin", status="dead")
        assert "Updated" in result
        assert "Thorin" in result

    def test_player_cannot_update(self):
        ctx = _make_ctx(role="player")
        result = update_character_status(ctx, character_name="Thorin", status="dead")
        assert "Only the DM" in result

    def test_character_not_found(self):
        ctx = _make_ctx(role="dm")
        result = update_character_status(ctx, character_name="Nobody", status="dead")
        assert "No character found" in result


class TestAddTimelineEvent:
    def test_dm_can_add(self):
        ctx = _make_ctx(role="dm", data_map={
            "timeline_events": [{"id": "event-1"}]
        })
        result = add_timeline_event(ctx, title="Battle of the Bridge", description="A fierce battle")
        assert "Timeline event recorded" in result

    def test_player_cannot_add(self):
        ctx = _make_ctx(role="player")
        result = add_timeline_event(ctx, title="Event", description="Desc")
        assert "Only the DM" in result


class TestUpdateMissionStatus:
    def test_dm_can_update(self):
        ctx = _make_ctx(role="dm", data_map={
            "missions": [{"id": "mission-1", "title": "Find the Gem", "status": "active"}]
        })
        result = update_mission_status(ctx, mission_title="Find the Gem", new_status="completed")
        assert "Updated" in result
        assert "Find the Gem" in result

    def test_player_cannot_update(self):
        ctx = _make_ctx(role="player")
        result = update_mission_status(ctx, mission_title="Find the Gem", new_status="completed")
        assert "Only the DM" in result
