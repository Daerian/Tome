"""
Tests for routers/items.py — GET /api/items/search.

Covers:
- Pure helper functions (_is_magic, _format_item)
- Endpoint: name search (substring match)
- Endpoint: source filter
- Endpoint: combined name + source filter
- Endpoint: available_sources always returned
- Endpoint: mundane items excluded from results
- Endpoint: rarity and type normalisation in responses
- Endpoint: limit param respected
- Endpoint: graceful empty response when upstream fetch fails
- Endpoint: in-memory cache prevents duplicate HTTP calls
- Endpoint: invalid query params return 422
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from main import app
from routers.items import _cache, _format_item, _is_magic

# ---------------------------------------------------------------------------
# Sample data
# ---------------------------------------------------------------------------

SAMPLE_ITEMS = [
    {
        "name": "Bag of Holding",
        "source": "DMG",
        "rarity": "uncommon",
        "wondrous": True,
        "entries": ["This bag has an interior space considerably larger than its outside dimensions."],
    },
    {
        "name": "Ring of Protection",
        "source": "DMG",
        "rarity": "rare",
        "type": "RG",
        "reqAttune": True,
        "entries": ["You gain a +1 bonus to AC and saving throws while wearing this ring."],
    },
    {
        "name": "Staff of the Magi",
        "source": "DMG",
        "rarity": "legendary",
        "type": "ST",
        "reqAttune": True,
        "entries": ["This staff can be wielded as a magic quarterstaff."],
    },
    {
        "name": "Potion of Healing",
        "source": "DMG",
        "rarity": "common",
        "type": "P",
        "entries": ["You regain {@dice 2d4 + 2} hit points when you drink this potion."],
    },
    {
        "name": "Cloak of Elvenkind",
        "source": "XGE",
        "rarity": "uncommon",
        "wondrous": True,
        "reqAttune": "by a creature with no darkvision",
        "entries": ["While you wear this cloak, Wisdom (Perception) checks made to see you have disadvantage."],
    },
    {
        "name": "Cape of the Mountebank",
        "source": "DMG",
        "rarity": "rare",
        "wondrous": True,
        "entries": ["This cape smells faintly of brimstone."],
    },
    # Mundane item — must never appear in results
    {
        "name": "Longsword",
        "source": "PHB",
        "rarity": "none",
        "type": "M",
        "entries": ["A martial melee weapon."],
    },
    # Mundane item with no rarity field at all
    {
        "name": "Torch",
        "source": "PHB",
        "entries": ["Provides light for 1 hour."],
    },
]


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def clear_item_cache():
    """Isolate each test from cached HTTP results."""
    _cache.clear()
    yield
    _cache.clear()


def _mock_httpx(items: list[dict]):
    """Patch httpx.AsyncClient in routers.items to return the given item list."""
    response = MagicMock()
    response.json.return_value = {"item": items}
    response.raise_for_status = MagicMock()

    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=response)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)

    return patch("routers.items.httpx.AsyncClient", return_value=mock_client)


# ---------------------------------------------------------------------------
# Unit tests: _is_magic
# ---------------------------------------------------------------------------


class TestIsMagic:
    def test_magic_rarity_common(self):
        assert _is_magic({"rarity": "common"}) is True

    def test_magic_rarity_uncommon(self):
        assert _is_magic({"rarity": "uncommon"}) is True

    def test_magic_rarity_rare(self):
        assert _is_magic({"rarity": "rare"}) is True

    def test_magic_rarity_very_rare(self):
        assert _is_magic({"rarity": "very rare"}) is True

    def test_magic_rarity_legendary(self):
        assert _is_magic({"rarity": "legendary"}) is True

    def test_magic_rarity_artifact(self):
        assert _is_magic({"rarity": "artifact"}) is True

    def test_magic_wondrous_flag(self):
        # No rarity, but wondrous=True → magic
        assert _is_magic({"wondrous": True}) is True

    def test_magic_req_attune_bool(self):
        assert _is_magic({"reqAttune": True}) is True

    def test_magic_req_attune_string(self):
        # reqAttune can be a condition string instead of True
        assert _is_magic({"reqAttune": "by a wizard"}) is True

    def test_not_magic_none_rarity(self):
        assert _is_magic({"rarity": "none", "type": "M"}) is False

    def test_not_magic_no_fields(self):
        assert _is_magic({"name": "Torch"}) is False

    def test_not_magic_unknown_rarity(self):
        assert _is_magic({"rarity": "unknown"}) is False


# ---------------------------------------------------------------------------
# Unit tests: _format_item
# ---------------------------------------------------------------------------


class TestFormatItem:
    def test_very_rare_normalised_to_underscore(self):
        item = {"name": "Dragon Scale Mail", "source": "DMG", "rarity": "very rare", "type": "A"}
        result = _format_item(item)
        assert result["rarity"] == "very_rare"

    def test_wondrous_flag_sets_item_type(self):
        item = {"name": "Bag of Holding", "source": "DMG", "rarity": "uncommon", "wondrous": True}
        result = _format_item(item)
        assert result["item_type"] == "wondrous"

    def test_wondrous_overrides_type_code(self):
        # If both wondrous=True and a type code exist, wondrous wins
        item = {"name": "X", "source": "DMG", "rarity": "rare", "wondrous": True, "type": "RG"}
        result = _format_item(item)
        assert result["item_type"] == "wondrous"

    def test_type_code_ring(self):
        item = {"name": "Ring of Protection", "source": "DMG", "rarity": "rare", "type": "RG"}
        result = _format_item(item)
        assert result["item_type"] == "ring"

    def test_type_code_staff(self):
        item = {"name": "Staff of the Magi", "source": "DMG", "rarity": "legendary", "type": "ST"}
        result = _format_item(item)
        assert result["item_type"] == "staff"

    def test_type_code_wand(self):
        item = {"name": "Wand of Fireballs", "source": "DMG", "rarity": "rare", "type": "WD"}
        result = _format_item(item)
        assert result["item_type"] == "wand"

    def test_type_code_potion(self):
        item = {"name": "Potion of Healing", "source": "DMG", "rarity": "common", "type": "P"}
        result = _format_item(item)
        assert result["item_type"] == "potion"

    def test_type_code_scroll(self):
        item = {"name": "Scroll of Fireball", "source": "DMG", "rarity": "uncommon", "type": "SC"}
        result = _format_item(item)
        assert result["item_type"] == "scroll"

    def test_type_code_weapon(self):
        item = {"name": "Sword of Wounding", "source": "DMG", "rarity": "rare", "type": "M"}
        result = _format_item(item)
        assert result["item_type"] == "weapon"

    def test_unknown_type_code_defaults_to_other(self):
        item = {"name": "Mystery Item", "source": "DMG", "rarity": "rare", "type": "ZZ"}
        result = _format_item(item)
        assert result["item_type"] == "other"

    def test_req_attune_bool(self):
        item = {"name": "X", "source": "DMG", "rarity": "rare", "type": "RG", "reqAttune": True}
        result = _format_item(item)
        assert result["requires_attunement"] is True

    def test_req_attune_string(self):
        item = {"name": "X", "source": "DMG", "rarity": "rare", "wondrous": True, "reqAttune": "by a spellcaster"}
        result = _format_item(item)
        assert result["requires_attunement"] is True
        # The attunement condition should appear in the description
        assert "by a spellcaster" in result["description"]

    def test_req_attune_false(self):
        item = {"name": "X", "source": "DMG", "rarity": "uncommon", "wondrous": True, "reqAttune": False}
        result = _format_item(item)
        assert result["requires_attunement"] is False

    def test_source_full_name_resolved(self):
        item = {"name": "X", "source": "DMG", "rarity": "rare", "wondrous": True}
        result = _format_item(item)
        assert result["source_full"] == "Dungeon Master's Guide (2014)"

    def test_unknown_source_falls_back_to_code(self):
        item = {"name": "X", "source": "HOMEBREW", "rarity": "rare", "wondrous": True}
        result = _format_item(item)
        assert result["source_full"] == "HOMEBREW"

    def test_5etools_tags_stripped_from_description(self):
        item = {
            "name": "Potion of Healing",
            "source": "DMG",
            "rarity": "common",
            "type": "P",
            "entries": ["You regain {@dice 2d4 + 2} hit points."],
        }
        result = _format_item(item)
        assert "{@" not in result["description"]
        assert "2d4 + 2" in result["description"]


# ---------------------------------------------------------------------------
# Integration tests: GET /api/items/search
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_search_returns_only_magic_items():
    with _mock_httpx(SAMPLE_ITEMS):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/api/items/search?q=&limit=50")

    assert response.status_code == 200
    names = [r["name"] for r in response.json()["results"]]
    assert "Longsword" not in names
    assert "Torch" not in names
    assert "Bag of Holding" in names


@pytest.mark.asyncio
async def test_search_by_name_substring():
    with _mock_httpx(SAMPLE_ITEMS):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/api/items/search?q=cloak")

    assert response.status_code == 200
    names = [r["name"] for r in response.json()["results"]]
    assert names == ["Cloak of Elvenkind"]


@pytest.mark.asyncio
async def test_search_by_name_case_insensitive():
    with _mock_httpx(SAMPLE_ITEMS):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/api/items/search?q=BAG+OF")

    assert response.status_code == 200
    names = [r["name"] for r in response.json()["results"]]
    assert "Bag of Holding" in names


@pytest.mark.asyncio
async def test_search_by_source_filter():
    with _mock_httpx(SAMPLE_ITEMS):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/api/items/search?source=XGE&limit=50")

    assert response.status_code == 200
    results = response.json()["results"]
    assert len(results) == 1
    assert results[0]["name"] == "Cloak of Elvenkind"


@pytest.mark.asyncio
async def test_search_source_filter_case_insensitive():
    with _mock_httpx(SAMPLE_ITEMS):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/api/items/search?source=xge&limit=50")

    assert response.status_code == 200
    results = response.json()["results"]
    assert all(r["source"] == "XGE" for r in results)


@pytest.mark.asyncio
async def test_search_combined_name_and_source():
    with _mock_httpx(SAMPLE_ITEMS):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/api/items/search?q=ring&source=DMG")

    assert response.status_code == 200
    names = [r["name"] for r in response.json()["results"]]
    assert names == ["Ring of Protection"]


@pytest.mark.asyncio
async def test_search_combined_no_match_returns_empty():
    with _mock_httpx(SAMPLE_ITEMS):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/api/items/search?q=cloak&source=DMG")

    assert response.status_code == 200
    assert response.json()["results"] == []


@pytest.mark.asyncio
async def test_available_sources_always_returned():
    with _mock_httpx(SAMPLE_ITEMS):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/api/items/search?q=bag")

    data = response.json()
    codes = [s["code"] for s in data["available_sources"]]
    assert "DMG" in codes
    assert "XGE" in codes
    # Mundane PHB longsword shouldn't contribute a source
    assert "PHB" not in codes


@pytest.mark.asyncio
async def test_available_sources_not_affected_by_filters():
    """Source list reflects ALL magic items, not just filtered results."""
    with _mock_httpx(SAMPLE_ITEMS):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/api/items/search?source=XGE")

    data = response.json()
    codes = [s["code"] for s in data["available_sources"]]
    # Even though we filtered to XGE, DMG must still appear in the source list
    assert "DMG" in codes
    assert "XGE" in codes


@pytest.mark.asyncio
async def test_available_sources_include_full_name():
    with _mock_httpx(SAMPLE_ITEMS):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/api/items/search?q=bag")

    sources = {s["code"]: s["name"] for s in response.json()["available_sources"]}
    assert sources["DMG"] == "Dungeon Master's Guide (2014)"
    assert sources["XGE"] == "Xanathar's Guide to Everything"


@pytest.mark.asyncio
async def test_results_sorted_alphabetically():
    with _mock_httpx(SAMPLE_ITEMS):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/api/items/search?source=DMG&limit=50")

    names = [r["name"] for r in response.json()["results"]]
    assert names == sorted(names)


@pytest.mark.asyncio
async def test_limit_respected():
    with _mock_httpx(SAMPLE_ITEMS):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/api/items/search?limit=2")

    assert len(response.json()["results"]) <= 2


@pytest.mark.asyncio
async def test_limit_zero_returns_no_results_but_sources():
    with _mock_httpx(SAMPLE_ITEMS):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/api/items/search?limit=0")

    data = response.json()
    assert data["results"] == []
    assert len(data["available_sources"]) > 0


@pytest.mark.asyncio
async def test_total_reflects_untruncated_count():
    with _mock_httpx(SAMPLE_ITEMS):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            # Fetch with limit=1 — total should still be the real match count
            response = await client.get("/api/items/search?source=DMG&limit=1")

    data = response.json()
    assert data["total"] > 1
    assert len(data["results"]) == 1


@pytest.mark.asyncio
async def test_rarity_normalised_in_response():
    items = [{"name": "Dragon Scale Mail", "source": "DMG", "rarity": "very rare", "type": "A"}]
    with _mock_httpx(items):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/api/items/search?q=dragon")

    result = response.json()["results"][0]
    assert result["rarity"] == "very_rare"


@pytest.mark.asyncio
async def test_upstream_http_error_returns_empty_gracefully():
    import httpx as _httpx

    mock_client = AsyncMock()
    mock_client.get = AsyncMock(
        side_effect=_httpx.RequestError("network error", request=MagicMock())
    )
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)

    with patch("routers.items.httpx.AsyncClient", return_value=mock_client):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/api/items/search?q=bag")

    assert response.status_code == 200
    data = response.json()
    assert data["results"] == []
    assert data["total"] == 0


@pytest.mark.asyncio
async def test_cache_prevents_duplicate_http_calls():
    mock_client = AsyncMock()
    response = MagicMock()
    response.json.return_value = {"item": SAMPLE_ITEMS}
    response.raise_for_status = MagicMock()
    mock_client.get = AsyncMock(return_value=response)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)

    with patch("routers.items.httpx.AsyncClient", return_value=mock_client):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            await client.get("/api/items/search?q=bag")
            await client.get("/api/items/search?q=ring")

    # Both requests share the same cache — only one HTTP GET should have been made
    assert mock_client.get.call_count == 1


@pytest.mark.asyncio
async def test_limit_above_max_returns_422():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/items/search?limit=999")

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_empty_query_with_no_source_returns_all_magic():
    with _mock_httpx(SAMPLE_ITEMS):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/api/items/search?limit=50")

    names = [r["name"] for r in response.json()["results"]]
    # All magic items present
    assert "Bag of Holding" in names
    assert "Ring of Protection" in names
    assert "Cloak of Elvenkind" in names
    # Mundane items absent
    assert "Longsword" not in names
    assert "Torch" not in names
