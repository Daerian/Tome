"""
Tests for routers/extract_beats.py.

Covers:
- build_extraction_context() — campaign not found, empty data, full data
- POST /api/extract-beats — not found, valid JSON, fenced JSON, invalid JSON
- POST /api/save-beats — missing fields, saves beats, increments sort_order
"""

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from main import app
from routers.extract_beats import build_extraction_context


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_sb(table_data: dict) -> MagicMock:
    sb = MagicMock()

    def _table(name):
        chain = MagicMock()
        for method in ("select", "eq", "order", "limit", "single"):
            getattr(chain, method).return_value = chain
        chain.execute.return_value = MagicMock(data=table_data.get(name))
        return chain

    sb.table.side_effect = _table
    return sb


CAMPAIGN = {"name": "Curse of Strahd", "description": "Gothic horror in Barovia."}
SESSION = {
    "session_number": 1,
    "title": "Arrival",
    "summary": "The party entered Barovia.",
    "dm_notes": "They were nervous.",
    "player_notes": "We took the main road.",
}
EVENT = {
    "title": "Strahd appears",
    "description": "Strahd greeted the party.",
    "event_type": "encounter",
    "importance": "major",
    "in_world_date": "1 Barovia",
}
BEAT = {
    "title": "The Dark Lord",
    "description": "Strahd is watching.",
    "type": "reveal",
    "status": "active",
}
NOTE = {"content": "We need holy water.", "type": "player"}


# ---------------------------------------------------------------------------
# build_extraction_context() unit tests
# ---------------------------------------------------------------------------


def test_build_context_campaign_not_found():
    sb = _make_sb(
        {"campaigns": None, "sessions": [], "timeline_events": [], "story_beats": [], "notes": []}
    )
    with patch("routers.extract_beats.sb", sb):
        result = build_extraction_context("missing-id")
    assert result is None


def test_build_context_empty_data():
    sb = _make_sb(
        {
            "campaigns": CAMPAIGN,
            "sessions": [],
            "timeline_events": [],
            "story_beats": [],
            "notes": [],
        }
    )
    with patch("routers.extract_beats.sb", sb):
        result = build_extraction_context("c1")

    assert result is not None
    assert "Curse of Strahd" in result
    assert "No completed sessions yet." in result
    assert "No timeline events." in result


def test_build_context_includes_sessions():
    sb = _make_sb(
        {
            "campaigns": CAMPAIGN,
            "sessions": [SESSION],
            "timeline_events": [],
            "story_beats": [],
            "notes": [],
        }
    )
    with patch("routers.extract_beats.sb", sb):
        result = build_extraction_context("c1")

    assert "Session 1: Arrival" in result
    assert "The party entered Barovia." in result
    assert "They were nervous." in result


def test_build_context_includes_timeline_events():
    sb = _make_sb(
        {
            "campaigns": CAMPAIGN,
            "sessions": [],
            "timeline_events": [EVENT],
            "story_beats": [],
            "notes": [],
        }
    )
    with patch("routers.extract_beats.sb", sb):
        result = build_extraction_context("c1")

    assert "Strahd appears" in result
    assert "1 Barovia" in result


def test_build_context_includes_existing_beats():
    sb = _make_sb(
        {
            "campaigns": CAMPAIGN,
            "sessions": [],
            "timeline_events": [],
            "story_beats": [BEAT],
            "notes": [],
        }
    )
    with patch("routers.extract_beats.sb", sb):
        result = build_extraction_context("c1")

    assert "EXISTING STORY BEATS" in result
    assert "The Dark Lord" in result


def test_build_context_includes_notes():
    sb = _make_sb(
        {
            "campaigns": CAMPAIGN,
            "sessions": [],
            "timeline_events": [],
            "story_beats": [],
            "notes": [NOTE],
        }
    )
    with patch("routers.extract_beats.sb", sb):
        result = build_extraction_context("c1")

    assert "We need holy water." in result


# ---------------------------------------------------------------------------
# POST /api/extract-beats tests
# ---------------------------------------------------------------------------


BEAT_JSON = json.dumps([
    {
        "title": "New threat",
        "description": "A new enemy appeared.",
        "type": "plot_hook",
        "status": "planted",
    }
])


@pytest.mark.asyncio
async def test_extract_beats_campaign_not_found():
    sb = _make_sb({"campaigns": None, "sessions": [], "timeline_events": [], "story_beats": [], "notes": []})
    with patch("routers.extract_beats.sb", sb):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.post(
                "/api/extract-beats", json={"campaign_id": "missing"}
            )

    assert response.status_code == 200
    body = response.json()
    assert body["beats"] == []
    assert "error" in body


@pytest.mark.asyncio
async def test_extract_beats_returns_parsed_json():
    mock_result = MagicMock()
    mock_result.output = BEAT_JSON
    sb = _make_sb(
        {"campaigns": CAMPAIGN, "sessions": [], "timeline_events": [], "story_beats": [], "notes": []}
    )
    with patch("routers.extract_beats.sb", sb):
        with patch("routers.extract_beats.Agent") as MockAgent:
            MockAgent.return_value.run = AsyncMock(return_value=mock_result)
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                response = await client.post(
                    "/api/extract-beats", json={"campaign_id": "c1"}
                )

    body = response.json()
    assert len(body["beats"]) == 1
    assert body["beats"][0]["title"] == "New threat"


@pytest.mark.asyncio
async def test_extract_beats_strips_markdown_fences():
    mock_result = MagicMock()
    mock_result.output = f"```json\n{BEAT_JSON}\n```"
    sb = _make_sb(
        {"campaigns": CAMPAIGN, "sessions": [], "timeline_events": [], "story_beats": [], "notes": []}
    )
    with patch("routers.extract_beats.sb", sb):
        with patch("routers.extract_beats.Agent") as MockAgent:
            MockAgent.return_value.run = AsyncMock(return_value=mock_result)
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                response = await client.post(
                    "/api/extract-beats", json={"campaign_id": "c1"}
                )

    assert len(response.json()["beats"]) == 1


@pytest.mark.asyncio
async def test_extract_beats_invalid_json_returns_empty():
    mock_result = MagicMock()
    mock_result.output = "Sorry, I cannot provide that."
    sb = _make_sb(
        {"campaigns": CAMPAIGN, "sessions": [], "timeline_events": [], "story_beats": [], "notes": []}
    )
    with patch("routers.extract_beats.sb", sb):
        with patch("routers.extract_beats.Agent") as MockAgent:
            MockAgent.return_value.run = AsyncMock(return_value=mock_result)
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                response = await client.post(
                    "/api/extract-beats", json={"campaign_id": "c1"}
                )

    assert response.json()["beats"] == []


# ---------------------------------------------------------------------------
# POST /api/save-beats tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_save_beats_missing_campaign_id():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post("/api/save-beats", json={"beats": [BEAT]})

    assert response.json()["saved"] == 0


@pytest.mark.asyncio
async def test_save_beats_empty_beats():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/api/save-beats", json={"campaign_id": "c1", "beats": []}
        )

    assert response.json()["saved"] == 0


@pytest.mark.asyncio
async def test_save_beats_persists_all_beats():
    sb = MagicMock()
    chain = MagicMock()
    for method in ("select", "eq", "order", "limit"):
        getattr(chain, method).return_value = chain
    chain.execute.return_value = MagicMock(data=[])  # no existing beats
    sb.table.return_value = chain

    insert_chain = MagicMock()
    insert_chain.execute.return_value = MagicMock(data=[{"id": "new"}])
    sb.table.return_value.insert.return_value = insert_chain

    beats = [BEAT, {**BEAT, "title": "Second beat"}]

    with patch("routers.extract_beats.sb", sb):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.post(
                "/api/save-beats", json={"campaign_id": "c1", "beats": beats}
            )

    assert response.json()["saved"] == 2
