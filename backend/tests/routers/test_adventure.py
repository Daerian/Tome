"""
Tests for routers/adventure.py.

Covers:
- GET /api/adventure/{code}/toc — unknown code, fetch failure, valid TOC
- GET /api/adventure/{code}/section — unknown code, section found, not found
"""

from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from main import app

SECTIONS = [
    {"name": "Prologue", "page": 1},
    {"name": "Chapter 1: The Village", "page": 5},
    {"name": "Chapter 2: The Mine", "page": 12},
]


# ---------------------------------------------------------------------------
# GET /api/adventure/{code}/toc
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_toc_unknown_code():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.get("/api/adventure/notacode/toc")

    assert response.status_code == 200
    body = response.json()
    assert "error" in body
    assert "notacode" in body["error"]
    assert "available" in body


@pytest.mark.asyncio
async def test_toc_fetch_failure():
    with patch("routers.adventure._fetch_file", new_callable=AsyncMock) as mock_fetch:
        mock_fetch.return_value = None
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.get("/api/adventure/lmop/toc")

    assert response.status_code == 200
    assert "error" in response.json()


@pytest.mark.asyncio
async def test_toc_returns_sections():
    with patch("routers.adventure._fetch_file", new_callable=AsyncMock) as mock_fetch:
        mock_fetch.return_value = SECTIONS
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.get("/api/adventure/lmop/toc")

    assert response.status_code == 200
    body = response.json()
    assert body["code"] == "lmop"
    assert len(body["sections"]) == 3
    assert body["sections"][0]["name"] == "Prologue"
    assert body["sections"][0]["index"] == 0
    assert body["sections"][1]["page"] == 5


@pytest.mark.asyncio
async def test_toc_sections_without_page():
    sections = [{"name": "Introduction"}]  # no page key
    with patch("routers.adventure._fetch_file", new_callable=AsyncMock) as mock_fetch:
        mock_fetch.return_value = sections
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.get("/api/adventure/lmop/toc")

    body = response.json()
    assert body["sections"][0]["page"] is None


# ---------------------------------------------------------------------------
# GET /api/adventure/{code}/section
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_section_unknown_code():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.get(
            "/api/adventure/notacode/section", params={"name": "Prologue"}
        )

    assert response.status_code == 200
    assert "error" in response.json()


@pytest.mark.asyncio
async def test_section_found():
    with patch("routers.adventure._fetch_file", new_callable=AsyncMock) as mock_fetch:
        mock_fetch.return_value = SECTIONS
        with patch("routers.adventure._clean_entry", return_value="Cleaned content"):
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                response = await client.get(
                    "/api/adventure/lmop/section", params={"name": "prologue"}
                )

    assert response.status_code == 200
    body = response.json()
    assert body["title"] == "Prologue"
    assert body["content"] == "Cleaned content"


@pytest.mark.asyncio
async def test_section_partial_name_match():
    """Section lookup is case-insensitive and matches substrings."""
    with patch("routers.adventure._fetch_file", new_callable=AsyncMock) as mock_fetch:
        mock_fetch.return_value = SECTIONS
        with patch("routers.adventure._clean_entry", return_value="Content"):
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                response = await client.get(
                    "/api/adventure/lmop/section", params={"name": "village"}
                )

    body = response.json()
    assert body["title"] == "Chapter 1: The Village"


@pytest.mark.asyncio
async def test_section_not_found():
    with patch("routers.adventure._fetch_file", new_callable=AsyncMock) as mock_fetch:
        mock_fetch.return_value = SECTIONS
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.get(
                "/api/adventure/lmop/section", params={"name": "nonexistent section"}
            )

    assert response.status_code == 200
    body = response.json()
    assert "error" in body
    assert "available" in body
