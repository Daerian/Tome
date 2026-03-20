"""
Tests for routers/generate.py.

Covers:
- build_history()  : unit tests, no network calls
- POST /api/generate : integration tests using a mocked agent
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
        """
        Parameters
        ----------
        None

        Returns
        -------
        Asserts build_history([]) == []
        """
        assert build_history([]) == []

    def test_user_message_becomes_model_request(self):
        """
        Parameters
        ----------
        Single user message.

        Returns
        -------
        Asserts output is a ModelRequest with correct content.
        """
        msgs = [Message(role="user", content="Hello")]
        result = build_history(msgs)

        assert len(result) == 1
        assert isinstance(result[0], ModelRequest)
        assert isinstance(result[0].parts[0], UserPromptPart)
        assert result[0].parts[0].content == "Hello"

    def test_assistant_message_becomes_model_response(self):
        """
        Parameters
        ----------
        Single assistant message.

        Returns
        -------
        Asserts output is a ModelResponse with correct content.
        """
        msgs = [Message(role="assistant", content="Hi there!")]
        result = build_history(msgs)

        assert len(result) == 1
        assert isinstance(result[0], ModelResponse)
        assert isinstance(result[0].parts[0], TextPart)
        assert result[0].parts[0].content == "Hi there!"

    def test_alternating_conversation_preserves_order(self):
        """
        Parameters
        ----------
        Two-turn conversation (user, assistant, user).

        Returns
        -------
        Asserts types and order are preserved.
        """
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
        """
        Parameters
        ----------
        Message with special characters.

        Returns
        -------
        Asserts content is not modified.
        """
        content = "Hello! How are you? 😊\nNew line."
        msgs = [Message(role="user", content=content)]
        result = build_history(msgs)

        assert result[0].parts[0].content == content


# ---------------------------------------------------------------------------
# POST /api/generate integration tests (agent mocked)
# ---------------------------------------------------------------------------

@pytest.fixture
def mock_agent_result():
    """A fake agent result object mimicking pydantic_ai RunResult."""
    result = MagicMock()
    result.output = "This is a mocked Claude response."
    return result


@pytest.mark.asyncio
async def test_generate_returns_result(mock_agent_result):
    """
    POST /api/generate with a single user message returns a result string.

    Parameters
    ----------
    mock_agent_result : MagicMock
        Fixture providing a fake agent run result.

    Returns
    -------
    Asserts response contains ``result`` key with expected string.
    """
    with patch("routers.generate.agent.run", new=AsyncMock(return_value=mock_agent_result)):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post("/api/generate", json={
                "messages": [{"role": "user", "content": "Hello"}]
            })

    assert response.status_code == 200
    assert response.json()["result"] == "This is a mocked Claude response."


@pytest.mark.asyncio
async def test_generate_passes_history_to_agent(mock_agent_result):
    """
    Agent receives the correct history excluding the last user message.

    Parameters
    ----------
    mock_agent_result : MagicMock
        Fixture providing a fake agent run result.

    Returns
    -------
    Asserts agent.run is called with history length == total messages - 1.
    """
    mock_run = AsyncMock(return_value=mock_agent_result)

    with patch("routers.generate.agent.run", new=mock_run):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            await client.post("/api/generate", json={
                "messages": [
                    {"role": "user", "content": "First message"},
                    {"role": "assistant", "content": "First reply"},
                    {"role": "user", "content": "Second message"},
                ]
            })

    # agent.run called with the last user prompt and 2 history messages
    call_kwargs = mock_run.call_args
    assert call_kwargs.args[0] == "Second message"
    assert len(call_kwargs.kwargs["message_history"]) == 2


@pytest.mark.asyncio
async def test_generate_testing_mode_flag(mock_agent_result):
    """
    When TESTING_MODE=true the response includes ``testing: True``.

    Parameters
    ----------
    mock_agent_result : MagicMock
        Fixture providing a fake agent run result.

    Returns
    -------
    Asserts ``testing`` key is present and True in response.
    """
    with patch("routers.generate.agent.run", new=AsyncMock(return_value=mock_agent_result)):
        with patch("routers.generate.TESTING_MODE", True):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                response = await client.post("/api/generate", json={
                    "messages": [{"role": "user", "content": "Test"}]
                })

    assert response.json().get("testing") is True


@pytest.mark.asyncio
async def test_generate_invalid_body_returns_422():
    """
    A malformed request body returns HTTP 422 Unprocessable Entity.

    Returns
    -------
    Asserts status code is 422 when messages field is missing.
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/api/generate", json={"wrong_field": "data"})

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_health_endpoint():
    """
    GET /health returns status ok.

    Returns
    -------
    Asserts ``status`` is ``"ok"`` in response.
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"
