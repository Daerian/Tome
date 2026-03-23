"""
Tests for tools/fivetools_tools.py.

Each tool is tested with mocked httpx responses. The cache is cleared
between tests to ensure isolation.
"""

import time
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from tools.fivetools_tools import (
    _strip_tags,
    _clean_entry,
    _cache,
    lookup_5etools_monster,
    lookup_5etools_spell,
    lookup_5etools_item,
    lookup_5etools_feat,
    browse_5etools_adventure,
    browse_5etools_source,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def clear_cache():
    """Clear the module-level cache before each test."""
    _cache.clear()
    yield
    _cache.clear()


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
    return patch("tools.fivetools_tools.httpx.AsyncClient", return_value=mock_client)


SAMPLE_MONSTER = {
    "name": "Goblin",
    "source": "MM",
    "size": ["S"],
    "type": {"type": "humanoid", "tags": ["goblinoid"]},
    "alignment": ["N", "E"],
    "ac": [15],
    "hp": {"average": 7, "formula": "2d6"},
    "speed": {"walk": 30},
    "str": 8, "dex": 14, "con": 10, "int": 10, "wis": 8, "cha": 8,
    "passive": 9,
    "languages": ["Common", "Goblin"],
    "cr": "1/4",
    "trait": [
        {"name": "Nimble Escape", "entries": ["The goblin can Disengage or Hide as a bonus action."]}
    ],
    "action": [
        {"name": "Scimitar", "entries": [
            "{@atk mw} {@hit 4} to hit, reach 5 ft., one target. "
            "{@h}{@damage 1d6 + 2} slashing damage."
        ]}
    ],
}

SAMPLE_SPELL = {
    "name": "Fireball",
    "source": "PHB",
    "level": 3,
    "school": "V",
    "time": [{"number": 1, "unit": "action"}],
    "range": {"type": "point", "distance": {"type": "feet", "amount": 150}},
    "components": {"v": True, "s": True, "m": "a tiny ball of bat guano and sulfur"},
    "duration": [{"type": "instant"}],
    "entries": [
        "A bright streak flashes from your pointing finger to a point you "
        "choose within range and then blossoms with a low roar into an "
        "explosion of flame. Each creature in a 20-foot-radius sphere "
        "centered on that point must make a {@dc 15} Dexterity saving throw."
    ],
    "entriesHigherLevel": [
        "When you cast this spell using a spell slot of 4th level or higher, "
        "the damage increases by {@dice 1d6} for each slot level above 3rd."
    ],
}


# ---------------------------------------------------------------------------
# Markup cleaner tests
# ---------------------------------------------------------------------------

class TestStripTags:
    def test_strips_dice_tag(self):
        assert _strip_tags("{@dice 2d6}") == "2d6"

    def test_strips_damage_tag(self):
        assert _strip_tags("{@damage 1d8 + 3}") == "1d8 + 3"

    def test_strips_creature_tag_with_source(self):
        assert _strip_tags("{@creature goblin|mm}") == "goblin"

    def test_strips_hit_tag(self):
        assert _strip_tags("{@hit 5}") == "5"

    def test_preserves_plain_text(self):
        text = "No tags here at all."
        assert _strip_tags(text) == text

    def test_strips_multiple_tags(self):
        text = "{@atk mw} {@hit 4} to hit, {@damage 1d6} damage"
        result = _strip_tags(text)
        assert "mw" in result
        assert "4" in result
        assert "1d6" in result
        assert "{@" not in result


class TestCleanEntry:
    def test_cleans_plain_string(self):
        assert _clean_entry("Hello world") == "Hello world"

    def test_cleans_string_with_tags(self):
        result = _clean_entry("{@dice 2d6} damage")
        assert result == "2d6 damage"

    def test_cleans_list_of_strings(self):
        result = _clean_entry(["Line 1", "Line 2"])
        assert "Line 1" in result
        assert "Line 2" in result

    def test_cleans_entries_type(self):
        entry = {"type": "entries", "name": "Feature", "entries": ["Does a thing."]}
        result = _clean_entry(entry)
        assert "**Feature**" in result
        assert "Does a thing." in result

    def test_cleans_list_type(self):
        entry = {"type": "list", "items": ["Item A", "Item B"]}
        result = _clean_entry(entry)
        assert "- Item A" in result
        assert "- Item B" in result

    def test_cleans_table_type(self):
        entry = {
            "type": "table",
            "caption": "Treasure",
            "colLabels": ["d100", "Result"],
            "rows": [["01-10", "Nothing"], ["11-20", "Gold"]],
        }
        result = _clean_entry(entry)
        assert "Table: Treasure" in result
        assert "Nothing" in result

    def test_cleans_quote_type(self):
        entry = {"type": "quote", "entries": ["A wise saying."], "by": "Elminster"}
        result = _clean_entry(entry)
        assert "A wise saying." in result
        assert "Elminster" in result


# ---------------------------------------------------------------------------
# Monster lookup tests
# ---------------------------------------------------------------------------

class TestLookup5etoolsMonster:
    @pytest.mark.asyncio
    async def test_no_results(self):
        with _patch_httpx({"monster": []}):
            result = await lookup_5etools_monster("nonexistent")
        assert "No monsters found" in result

    @pytest.mark.asyncio
    async def test_formats_monster(self):
        with _patch_httpx({"monster": [SAMPLE_MONSTER]}):
            result = await lookup_5etools_monster("goblin")
        assert "Goblin" in result
        assert "CR: 1/4" in result
        assert "Nimble Escape" in result
        assert "Scimitar" in result
        assert "STR 8" in result

    @pytest.mark.asyncio
    async def test_source_filter(self):
        with _patch_httpx({"monster": [SAMPLE_MONSTER]}):
            result = await lookup_5etools_monster("goblin", source="MM")
        assert "Goblin" in result


# ---------------------------------------------------------------------------
# Spell lookup tests
# ---------------------------------------------------------------------------

class TestLookup5etoolsSpell:
    @pytest.mark.asyncio
    async def test_no_results(self):
        with _patch_httpx({"spell": []}):
            result = await lookup_5etools_spell("nonexistent")
        assert "No spells found" in result

    @pytest.mark.asyncio
    async def test_formats_spell(self):
        with _patch_httpx({"spell": [SAMPLE_SPELL]}):
            result = await lookup_5etools_spell("fireball")
        assert "Fireball" in result
        assert "Evocation" in result
        assert "150 feet" in result
        assert "Instantaneous" in result
        assert "bat guano" in result
        assert "At Higher Levels" in result


# ---------------------------------------------------------------------------
# Item lookup tests
# ---------------------------------------------------------------------------

class TestLookup5etoolsItem:
    @pytest.mark.asyncio
    async def test_no_results(self):
        with _patch_httpx({"baseitem": []}):
            result = await lookup_5etools_item("nonexistent")
        assert "No items found" in result

    @pytest.mark.asyncio
    async def test_formats_item(self):
        item = {
            "name": "Longsword",
            "source": "PHB",
            "type": "M",
            "weight": 3,
            "value": 1500,
            "dmg1": "1d8",
            "dmgType": "slashing",
        }
        with _patch_httpx({"baseitem": [item]}):
            result = await lookup_5etools_item("longsword")
        assert "Longsword" in result
        assert "15 gp" in result
        assert "1d8" in result


# ---------------------------------------------------------------------------
# Feat lookup tests
# ---------------------------------------------------------------------------

class TestLookup5etoolsFeat:
    @pytest.mark.asyncio
    async def test_no_results(self):
        with _patch_httpx({"feat": []}):
            result = await lookup_5etools_feat("nonexistent")
        assert "No feats found" in result

    @pytest.mark.asyncio
    async def test_formats_feat(self):
        feat = {
            "name": "Sentinel",
            "source": "PHB",
            "entries": [
                "You have mastered techniques to take advantage of every "
                "drop in any enemy's guard."
            ],
        }
        with _patch_httpx({"feat": [feat]}):
            result = await lookup_5etools_feat("sentinel")
        assert "Sentinel" in result
        assert "mastered techniques" in result


# ---------------------------------------------------------------------------
# Adventure browsing tests
# ---------------------------------------------------------------------------

class TestBrowse5etoolsAdventure:
    @pytest.mark.asyncio
    async def test_unknown_adventure(self):
        result = await browse_5etools_adventure("zzz")
        assert "Unknown adventure code" in result

    @pytest.mark.asyncio
    async def test_lists_sections(self):
        sections = [
            {"type": "section", "name": "Into the Mists", "page": 1, "id": "001", "entries": []},
            {"type": "section", "name": "The Village of Barovia", "page": 20, "id": "002", "entries": []},
        ]
        with _patch_httpx({"data": sections}):
            result = await browse_5etools_adventure("cos")
        assert "Curse of Strahd" in result
        assert "Into the Mists" in result
        assert "Village of Barovia" in result

    @pytest.mark.asyncio
    async def test_section_content(self):
        sections = [
            {
                "type": "section",
                "name": "Into the Mists",
                "page": 1,
                "id": "001",
                "entries": ["The mists part to reveal a dark forest."],
            },
        ]
        with _patch_httpx({"data": sections}):
            result = await browse_5etools_adventure("cos", section="Mists")
        assert "Into the Mists" in result
        assert "dark forest" in result

    @pytest.mark.asyncio
    async def test_section_not_found(self):
        sections = [
            {"type": "section", "name": "Chapter 1", "page": 1, "id": "001", "entries": []},
        ]
        with _patch_httpx({"data": sections}):
            result = await browse_5etools_adventure("cos", section="nonexistent")
        assert "No section matching" in result


# ---------------------------------------------------------------------------
# Source browsing tests
# ---------------------------------------------------------------------------

class TestBrowse5etoolsSource:
    @pytest.mark.asyncio
    async def test_lists_monsters(self):
        monsters = [
            {"name": "Goblin", "cr": "1/4", "type": {"type": "humanoid"}},
            {"name": "Hobgoblin", "cr": "1/2", "type": "humanoid"},
        ]
        with _patch_httpx({"monster": monsters}):
            result = await browse_5etools_source("MM", "monster")
        assert "Goblin" in result
        assert "Hobgoblin" in result
        assert "CR 1/4" in result

    @pytest.mark.asyncio
    async def test_lists_spells(self):
        spells = [
            {"name": "Fireball", "level": 3, "school": "V"},
            {"name": "Shield", "level": 1, "school": "A"},
        ]
        with _patch_httpx({"spell": spells}):
            result = await browse_5etools_source("PHB", "spell")
        assert "Fireball" in result
        assert "Shield" in result
        assert "Evocation" in result

    @pytest.mark.asyncio
    async def test_unknown_source(self):
        result = await browse_5etools_source("ZZZ", "monster")
        assert "No bestiary file" in result

    @pytest.mark.asyncio
    async def test_unknown_content_type(self):
        result = await browse_5etools_source("MM", "weapon")
        assert "Unknown content_type" in result


# ---------------------------------------------------------------------------
# Cache tests
# ---------------------------------------------------------------------------

class TestCache:
    @pytest.mark.asyncio
    async def test_cache_hit_skips_fetch(self):
        """Second call within TTL should not trigger a new HTTP fetch."""
        data = {"monster": [SAMPLE_MONSTER]}
        with _patch_httpx(data) as mock_cls:
            await lookup_5etools_monster("goblin", source="MM")
            await lookup_5etools_monster("goblin", source="MM")

            # httpx.AsyncClient should only be constructed once
            assert mock_cls.call_count == 1

    @pytest.mark.asyncio
    async def test_cache_expired_refetches(self):
        """After TTL expires, a new fetch should occur."""
        data = {"monster": [SAMPLE_MONSTER]}
        with _patch_httpx(data) as mock_cls:
            await lookup_5etools_monster("goblin", source="MM")

            # Expire the cache entry
            for key in list(_cache.keys()):
                ts, entities = _cache[key]
                _cache[key] = (ts - 7200, entities)  # 2 hours ago

            await lookup_5etools_monster("goblin", source="MM")
            assert mock_cls.call_count == 2
