"""
Tests for routers/generate.py.

Covers:
- build_history()  : unit tests, no network calls
- POST /api/generate : integration tests using mocked agents
"""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from httpx import AsyncClient, ASGITransport
from pydantic_ai.messages import ModelRequest, ModelResponse, UserPromptPart, TextPart

from main import app
from routers.generate import build_history, Message


# ---------------------------------------------------------------------------
# build_history() unit tests
# ---------------------------------------------------------------------------

class TestBuildHistory:
    """Unit tests for build_history — no network calls required."""

    def test_empty_list_returns_empty(self):
        assert build_history([]) == []

    def test_user_message_becomes_model_request(self):
        msgs = [Message(role="user", content="Hello")]
        result = build_history(msgs)

        assert len(result) == 1
        assert isinstance(result[0], ModelRequest)
        assert isinstance(result[0].parts[0], UserPromptPart)
        assert result[0].parts[0].content == "Hello"

    def test_assistant_message_becomes_model_response(self):
        msgs = [Message(role="assistant", content="Hi there!")]
        result = build_history(msgs)

        assert len(result) == 1
        assert isinstance(result[0], ModelResponse)
        assert isinstance(result[0].parts[0], TextPart)
        assert result[0].parts[0].content == "Hi there!"

    def test_alternating_conversation_preserves_order(self):
        msgs = [
            Message(role="user", content="What is 2+2?"),
            Message(role="assistant", content="4"),
            Message(role="user", content="Are you sure?"),
        ]
        result = build_history(msgs)

        assert len(result) == 3
        assert isinstance(result[0], ModelRequest)
        assert isinstance(result[1], ModelResponse)
        assert isinstance(result[2], ModelRequest)

    def test_content_is_preserved_exactly(self):
        content = "Hello! How are you? 😊\nNew line."
        msgs = [Message(role="user", content=content)]
        result = build_history(msgs)

        assert result[0].parts[0].content == content


# ---------------------------------------------------------------------------
# POST /api/generate integration tests (agents mocked)
# ---------------------------------------------------------------------------

@pytest.fixture
def mock_agent_result():
    """A fake agent result object mimicking pydantic_ai RunResult."""
    result = MagicMock()
    result.output = "This is a mocked Claude response."
    return result


@pytest.mark.asyncio
async def test_generate_without_campaign(mock_agent_result):
    """POST /api/generate without campaign_id uses the general agent."""
    with patch("routers.generate.general_agent") as mock_general:
        mock_general.run = AsyncMock(return_value=mock_agent_result)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post("/api/generate", json={
                "messages": [{"role": "user", "content": "Hello"}]
            })

    assert response.status_code == 200
    assert response.json()["result"] == "This is a mocked Claude response."


@pytest.mark.asyncio
async def test_generate_with_campaign(mock_agent_result):
    """POST /api/generate with campaign_id uses the campaign agent."""
    with patch("routers.generate.campaign_agent") as mock_campaign:
        mock_campaign.run = AsyncMock(return_value=mock_agent_result)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post("/api/generate", json={
                "messages": [{"role": "user", "content": "Who are the characters?"}],
                "campaign_id": "test-campaign-id",
                "user_id": "test-user-id",
                "role": "dm",
            })

    assert response.status_code == 200
    assert response.json()["result"] == "This is a mocked Claude response."
    # Verify deps were passed
    call_kwargs = mock_campaign.run.call_args.kwargs
    assert call_kwargs["deps"].campaign_id == "test-campaign-id"
    assert call_kwargs["deps"].user_id == "test-user-id"
    assert call_kwargs["deps"].role == "dm"


@pytest.mark.asyncio
async def test_generate_passes_history(mock_agent_result):
    """Agent receives the correct history excluding the last user message."""
    with patch("routers.generate.general_agent") as mock_general:
        mock_general.run = AsyncMock(return_value=mock_agent_result)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            await client.post("/api/generate", json={
                "messages": [
                    {"role": "user", "content": "First message"},
                    {"role": "assistant", "content": "First reply"},
                    {"role": "user", "content": "Second message"},
                ]
            })

    call_args = mock_general.run.call_args
    assert call_args.args[0] == "Second message"
    assert len(call_args.kwargs["message_history"]) == 2


@pytest.mark.asyncio
async def test_generate_testing_mode_flag(mock_agent_result):
    """When TESTING_MODE=true the response includes testing: True."""
    with patch("routers.generate.general_agent") as mock_general:
        mock_general.run = AsyncMock(return_value=mock_agent_result)
        with patch("routers.generate.TESTING_MODE", True):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                response = await client.post("/api/generate", json={
                    "messages": [{"role": "user", "content": "Test"}]
                })

    assert response.json().get("testing") is True


@pytest.mark.asyncio
async def test_generate_invalid_body_returns_422():
    """A malformed request body returns HTTP 422."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/api/generate", json={"wrong_field": "data"})

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_generate_defaults_role_to_spectator(mock_agent_result):
    """When role is omitted, defaults to 'spectator'."""
    with patch("routers.generate.campaign_agent") as mock_campaign:
        mock_campaign.run = AsyncMock(return_value=mock_agent_result)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            await client.post("/api/generate", json={
                "messages": [{"role": "user", "content": "Hello"}],
                "campaign_id": "test-campaign-id",
            })

    call_kwargs = mock_campaign.run.call_args.kwargs
    assert call_kwargs["deps"].role == "spectator"
    assert call_kwargs["deps"].user_id == ""


@pytest.mark.asyncio
async def test_health_endpoint():
    """GET /health returns status ok."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"
