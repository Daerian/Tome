"""
Tests for tools/reference_tools.py.

Each tool is tested with mocked httpx responses.
"""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from tools.reference_tools import (
    lookup_spell,
    lookup_monster,
    lookup_item,
    lookup_condition,
    lookup_class,
    lookup_race,
    search_rules,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _mock_response(data):
    """Create a mock httpx response with the given JSON data."""
    response = MagicMock()
    response.json.return_value = data
    response.raise_for_status = MagicMock()
    return response


def _patch_httpx(response_data):
    """Context manager that patches httpx.AsyncClient to return mock data."""
    mock_response = _mock_response(response_data)
    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=mock_response)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    return patch("tools.reference_tools.httpx.AsyncClient", return_value=mock_client)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestLookupSpell:
    @pytest.mark.asyncio
    async def test_no_results(self):
        with _patch_httpx({"results": []}):
            result = await lookup_spell("nonexistent")
        assert "No spells found" in result

    @pytest.mark.asyncio
    async def test_formats_spell(self):
        with _patch_httpx({"results": [{
            "name": "Fireball",
            "level_int": 3,
            "school": "Evocation",
            "casting_time": "1 action",
            "range": "150 feet",
            "components": "V, S, M",
            "duration": "Instantaneous",
            "concentration": "no",
            "desc": "A bright streak flashes from your pointing finger...",
            "higher_level": "When you cast this spell using a spell slot of 4th level...",
        }]}):
            result = await lookup_spell("fireball")
        assert "Fireball" in result
        assert "Evocation" in result
        assert "150 feet" in result
        assert "Higher Levels" in result


class TestLookupMonster:
    @pytest.mark.asyncio
    async def test_no_results(self):
        with _patch_httpx({"results": []}):
            result = await lookup_monster("nonexistent")
        assert "No monsters found" in result

    @pytest.mark.asyncio
    async def test_formats_monster(self):
        with _patch_httpx({"results": [{
            "name": "Goblin",
            "size": "Small",
            "type": "humanoid",
            "alignment": "neutral evil",
            "challenge_rating": "1/4",
            "xp": 50,
            "armor_class": 15,
            "hit_points": 7,
            "hit_dice": "2d6",
            "speed": {"walk": "30 ft."},
            "strength": 8, "dexterity": 14, "constitution": 10,
            "intelligence": 10, "wisdom": 8, "charisma": 8,
            "senses": "darkvision 60 ft.",
            "languages": "Common, Goblin",
            "special_abilities": [
                {"name": "Nimble Escape", "desc": "Can Disengage or Hide as a bonus action."}
            ],
            "actions": [
                {"name": "Scimitar", "desc": "Melee Weapon Attack: +4 to hit, 5 ft."}
            ],
            "legendary_actions": None,
        }]}):
            result = await lookup_monster("goblin")
        assert "Goblin" in result
        assert "CR: 1/4" in result
        assert "Nimble Escape" in result
        assert "Scimitar" in result


class TestLookupItem:
    @pytest.mark.asyncio
    async def test_no_results(self):
        with _patch_httpx({"results": []}):
            result = await lookup_item("nonexistent")
        assert "No magic items found" in result

    @pytest.mark.asyncio
    async def test_formats_item(self):
        with _patch_httpx({"results": [{
            "name": "Bag of Holding",
            "type": "Wondrous item",
            "rarity": "uncommon",
            "requires_attunement": "",
            "desc": "This bag has an interior space considerably larger...",
        }]}):
            result = await lookup_item("bag of holding")
        assert "Bag of Holding" in result
        assert "uncommon" in result


class TestLookupCondition:
    @pytest.mark.asyncio
    async def test_no_results(self):
        with _patch_httpx({"results": []}):
            result = await lookup_condition("nonexistent")
        assert "No conditions found" in result

    @pytest.mark.asyncio
    async def test_formats_condition(self):
        with _patch_httpx({"results": [{
            "name": "Blinded",
            "desc": "A blinded creature can't see and automatically fails...",
        }]}):
            result = await lookup_condition("blinded")
        assert "Blinded" in result


class TestSearchRules:
    @pytest.mark.asyncio
    async def test_no_results(self):
        with _patch_httpx({"results": []}):
            result = await search_rules("nonexistent")
        assert "No rules found" in result

    @pytest.mark.asyncio
    async def test_formats_rules(self):
        with _patch_httpx({"results": [{
            "name": "Combat",
            "parent": "Rules",
            "desc": "A typical combat encounter is a clash between two sides...",
        }]}):
            result = await search_rules("combat")
        assert "Combat" in result
