"""
Tests for routers/recap.py.

Covers:
- Session or campaign not found → early return
- No notes of any kind → "Add notes first" message
- Player notes only → agent is called
- Contributed notes only → agent is called with attribution
- Previous session summary included in context
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from main import app


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
        for method in ("select", "eq", "neq", "lt", "order", "limit", "single", "in_"):
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


CAMPAIGN = {"name": "Lost Mines", "system": "D&D 5e"}
SESSION = {"session_number": 3, "title": "The Cave", "player_notes": None}
SESSION_WITH_NOTES = {**SESSION, "player_notes": "Party found a dragon egg."}
PREV_SESSION = [{"session_number": 2, "title": "Town", "summary": "The party rested."}]
NOTE = [{"content": "Tav picked the lock.", "profiles": {"display_name": "Alice"}}]


# ---------------------------------------------------------------------------
# POST /api/recap tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_recap_campaign_not_found():
    # sessions: first call (current session) → SESSION so data check passes;
    # but campaign is None so we hit the not-found branch.
    sb = _make_sb({"campaigns": None, "sessions": (SESSION, []), "notes": []})
    with patch("routers.recap.sb", sb):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.post(
                "/api/recap",
                json={"session_id": "s1", "campaign_id": "c1"},
            )

    assert response.status_code == 200
    assert "not found" in response.json()["recap"].lower()


@pytest.mark.asyncio
async def test_recap_session_not_found():
    sb = _make_sb({"campaigns": CAMPAIGN, "sessions": (None, []), "notes": []})
    with patch("routers.recap.sb", sb):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.post(
                "/api/recap",
                json={"session_id": "s1", "campaign_id": "c1"},
            )

    assert response.status_code == 200
    assert "not found" in response.json()["recap"].lower()


@pytest.mark.asyncio
async def test_recap_no_notes_returns_prompt():
    # Session has no player_notes, notes table returns empty
    sb = _make_sb({"campaigns": CAMPAIGN, "sessions": (SESSION, []), "notes": []})
    with patch("routers.recap.sb", sb):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.post(
                "/api/recap",
                json={"session_id": "s1", "campaign_id": "c1"},
            )

    assert response.status_code == 200
    assert "no notes" in response.json()["recap"].lower()


@pytest.mark.asyncio
async def test_recap_calls_agent_with_player_notes():
    mock_result = MagicMock()
    mock_result.output = "The party bravely descended..."
    # First sessions call: current session (has player_notes)
    # Second sessions call: prev sessions (empty)
    sb = _make_sb(
        {"campaigns": CAMPAIGN, "sessions": (SESSION_WITH_NOTES, []), "notes": []}
    )
    with patch("routers.recap.sb", sb):
        with patch("routers.recap.Agent") as MockAgent:
            instance = MockAgent.return_value
            instance.run = AsyncMock(return_value=mock_result)
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                response = await client.post(
                    "/api/recap",
                    json={"session_id": "s1", "campaign_id": "c1"},
                )

    assert response.status_code == 200
    assert response.json()["recap"] == "The party bravely descended..."
    instance.run.assert_called_once()


@pytest.mark.asyncio
async def test_recap_calls_agent_with_contributed_notes():
    mock_result = MagicMock()
    mock_result.output = "Alice's character solved the puzzle..."
    sb = _make_sb(
        {"campaigns": CAMPAIGN, "sessions": (SESSION, []), "notes": NOTE}
    )
    with patch("routers.recap.sb", sb):
        with patch("routers.recap.Agent") as MockAgent:
            instance = MockAgent.return_value
            instance.run = AsyncMock(return_value=mock_result)
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                response = await client.post(
                    "/api/recap",
                    json={"session_id": "s1", "campaign_id": "c1"},
                )

    assert response.status_code == 200
    assert response.json()["recap"] == "Alice's character solved the puzzle..."
    prompt = instance.run.call_args.args[0]
    assert "Alice" in prompt
    assert "Tav picked the lock." in prompt


@pytest.mark.asyncio
async def test_recap_includes_previous_session_summary():
    mock_result = MagicMock()
    mock_result.output = "Continuing from last time..."
    # First sessions call: current session; second: prev session list
    sb = _make_sb(
        {
            "campaigns": CAMPAIGN,
            "sessions": (SESSION_WITH_NOTES, PREV_SESSION),
            "notes": [],
        }
    )
    with patch("routers.recap.sb", sb):
        with patch("routers.recap.Agent") as MockAgent:
            instance = MockAgent.return_value
            instance.run = AsyncMock(return_value=mock_result)
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                await client.post(
                    "/api/recap",
                    json={"session_id": "s1", "campaign_id": "c1"},
                )

    prompt = instance.run.call_args.args[0]
    assert "The party rested." in prompt


@pytest.mark.asyncio
async def test_recap_invalid_body_returns_422():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post("/api/recap", json={"wrong": "data"})

    assert response.status_code == 422
