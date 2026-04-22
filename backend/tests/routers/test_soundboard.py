"""
Tests for routers/soundboard.py.

Covers:
- Pure helpers: _proxy_url, _normalize
- _fetch_catalog: cache hit, TTL expiry, upstream failure fallback, bad shape
- GET /api/soundboard/catalog: 200 with tracks, 503 on empty, URL rewriting,
  count/attribution, cache hit on second call
- GET /api/soundboard/proxy: host validation, successful stream, content headers,
  Range passthrough, 404 on upstream 403, 502 on upstream 5xx, 502 on network error
"""

import time
from unittest.mock import AsyncMock, MagicMock, patch

import httpx as _httpx
import pytest
from httpx import ASGITransport, AsyncClient

from main import app
from routers.soundboard import _catalog_cache, _fetch_catalog, _normalize, _proxy_url

# ---------------------------------------------------------------------------
# Sample data
# ---------------------------------------------------------------------------

SAMPLE_RAW_TRACK = {
    "key": 42,
    "track_title": "Tavern Music",
    "link": "https://sounds.tabletopaudio.com/42.mp3",
    "track_type": "loop",
    "track_genre": ["Fantasy"],
    "tags": ["tavern, inn, medieval"],
    "flavor_text": "A warm tavern ambience.",
    "large_image": "https://tabletopaudio.com/img/42.jpg",
    "small_image": "",
    "new": False,
}

SAMPLE_RAW_FEED = {"tracks": [SAMPLE_RAW_TRACK]}

VALID_AUDIO_URL = "https://sounds.tabletopaudio.com/42.mp3"

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def reset_catalog_cache():
    """Isolate each test from cached catalog data."""
    _catalog_cache["fetched_at"] = 0.0
    _catalog_cache["tracks"] = []
    yield
    _catalog_cache["fetched_at"] = 0.0
    _catalog_cache["tracks"] = []


# ---------------------------------------------------------------------------
# Mock helpers
# ---------------------------------------------------------------------------


def _mock_catalog_httpx(data):
    """Patch httpx.AsyncClient in routers.soundboard to return the given catalog."""
    response = MagicMock()
    response.json.return_value = data
    response.raise_for_status = MagicMock()

    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=response)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)

    return patch("routers.soundboard.httpx.AsyncClient", return_value=mock_client)


def _mock_proxy_httpx(status_code=200, headers=None, chunks=None):
    """Patch httpx for a streaming proxy request."""
    if headers is None:
        headers = {"content-type": "audio/mpeg", "content-length": "512"}
    if chunks is None:
        chunks = [b"audio", b"data"]

    async def _aiter_bytes(chunk_size=8192):
        for chunk in chunks:
            yield chunk

    mock_resp = MagicMock()
    mock_resp.status_code = status_code
    mock_resp.headers = dict(headers)
    mock_resp.aiter_bytes = _aiter_bytes

    class _StreamCtx:
        async def __aenter__(self):
            return mock_resp

        async def __aexit__(self, *a):
            pass

    mock_client = MagicMock()
    mock_client.stream = MagicMock(return_value=_StreamCtx())

    class _ClientCtx:
        async def __aenter__(self):
            return mock_client

        async def __aexit__(self, *a):
            pass

    return patch("routers.soundboard.httpx.AsyncClient", return_value=_ClientCtx())


def _mock_proxy_httpx_request_error():
    """Patch httpx to raise RequestError when entering the client context."""

    class _FailingClientCtx:
        async def __aenter__(self):
            raise _httpx.RequestError("network error", request=MagicMock())

        async def __aexit__(self, *a):
            pass

    return patch(
        "routers.soundboard.httpx.AsyncClient", return_value=_FailingClientCtx()
    )


# ---------------------------------------------------------------------------
# Unit tests: _proxy_url
# ---------------------------------------------------------------------------


class TestProxyUrl:
    def test_rewrites_to_proxy_path(self):
        result = _proxy_url("https://sounds.tabletopaudio.com/1.mp3")
        assert result.startswith("/api/soundboard/proxy?url=")

    def test_encodes_original_url(self):
        result = _proxy_url("https://sounds.tabletopaudio.com/1.mp3")
        assert "sounds.tabletopaudio.com" in result

    def test_empty_string(self):
        result = _proxy_url("")
        assert result == "/api/soundboard/proxy?url="


# ---------------------------------------------------------------------------
# Unit tests: _normalize
# ---------------------------------------------------------------------------


class TestNormalize:
    def test_basic_fields(self):
        result = _normalize(SAMPLE_RAW_TRACK)
        assert result["id"] == "tabletop_audio:42"
        assert result["source"] == "tabletop_audio"
        assert result["external_id"] == "42"
        assert result["title"] == "Tavern Music"
        assert result["track_type"] == "loop"
        assert result["flavor"] == "A warm tavern ambience."
        assert result["image_url"] == "https://tabletopaudio.com/img/42.jpg"
        assert result["is_new"] is False

    def test_url_rewritten_to_proxy(self):
        result = _normalize(SAMPLE_RAW_TRACK)
        assert result["url"].startswith("/api/soundboard/proxy")
        assert "sounds.tabletopaudio.com" in result["url"]

    def test_genres_extracted(self):
        result = _normalize(SAMPLE_RAW_TRACK)
        assert result["genres"] == ["Fantasy"]

    def test_comma_separated_tags_split(self):
        result = _normalize(SAMPLE_RAW_TRACK)
        assert "tavern" in result["tags"]
        assert "inn" in result["tags"]
        assert "medieval" in result["tags"]

    def test_plain_string_tags_kept(self):
        track = {**SAMPLE_RAW_TRACK, "tags": ["forest", "dark", "outdoor"]}
        result = _normalize(track)
        assert result["tags"] == ["forest", "dark", "outdoor"]

    def test_tags_as_single_string(self):
        track = {**SAMPLE_RAW_TRACK, "tags": "coast, ocean, waves"}
        result = _normalize(track)
        assert "coast" in result["tags"]
        assert "ocean" in result["tags"]
        assert "waves" in result["tags"]

    def test_missing_key_gives_empty_external_id(self):
        track = {k: v for k, v in SAMPLE_RAW_TRACK.items() if k != "key"}
        result = _normalize(track)
        assert result["external_id"] == ""

    def test_missing_title_defaults_to_untitled(self):
        result = _normalize({**SAMPLE_RAW_TRACK, "track_title": None})
        assert result["title"] == "Untitled"

    def test_missing_link_gives_empty_url(self):
        result = _normalize({**SAMPLE_RAW_TRACK, "link": None})
        assert result["url"] == ""

    def test_is_new_truthy_int(self):
        result = _normalize({**SAMPLE_RAW_TRACK, "new": 1})
        assert result["is_new"] is True

    def test_small_image_used_when_large_absent(self):
        track = {
            **SAMPLE_RAW_TRACK,
            "large_image": "",
            "small_image": "https://tabletopaudio.com/small.jpg",
        }
        result = _normalize(track)
        assert result["image_url"] == "https://tabletopaudio.com/small.jpg"

    def test_genres_strips_whitespace(self):
        result = _normalize({**SAMPLE_RAW_TRACK, "track_genre": ["  Fantasy  ", " Horror "]})
        assert "Fantasy" in result["genres"]
        assert "Horror" in result["genres"]

    def test_empty_genres_list(self):
        result = _normalize({**SAMPLE_RAW_TRACK, "track_genre": []})
        assert result["genres"] == []

    def test_none_genres_gives_empty_list(self):
        result = _normalize({**SAMPLE_RAW_TRACK, "track_genre": None})
        assert result["genres"] == []


# ---------------------------------------------------------------------------
# Unit tests: _fetch_catalog
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_fetch_catalog_returns_normalized_tracks():
    with _mock_catalog_httpx(SAMPLE_RAW_FEED):
        tracks = await _fetch_catalog()
    assert len(tracks) == 1
    assert tracks[0]["title"] == "Tavern Music"


@pytest.mark.asyncio
async def test_fetch_catalog_populates_cache():
    with _mock_catalog_httpx(SAMPLE_RAW_FEED):
        await _fetch_catalog()
    assert _catalog_cache["fetched_at"] > 0
    assert len(_catalog_cache["tracks"]) == 1


@pytest.mark.asyncio
async def test_fetch_catalog_cache_hit_skips_http():
    _catalog_cache["fetched_at"] = time.time()
    _catalog_cache["tracks"] = [{"title": "Cached Track"}]

    mock_client = AsyncMock()
    with patch("routers.soundboard.httpx.AsyncClient", return_value=mock_client):
        tracks = await _fetch_catalog()

    assert tracks[0]["title"] == "Cached Track"
    mock_client.get.assert_not_called()


@pytest.mark.asyncio
async def test_fetch_catalog_expired_cache_refetches():
    _catalog_cache["fetched_at"] = 1.0
    _catalog_cache["tracks"] = [{"title": "Old Track"}]

    with _mock_catalog_httpx(SAMPLE_RAW_FEED):
        tracks = await _fetch_catalog()

    assert tracks[0]["title"] == "Tavern Music"


@pytest.mark.asyncio
async def test_fetch_catalog_upstream_failure_returns_stale_cache():
    _catalog_cache["fetched_at"] = 0.0
    _catalog_cache["tracks"] = [{"title": "Stale Track"}]

    mock_client = AsyncMock()
    mock_client.get = AsyncMock(
        side_effect=_httpx.RequestError("timeout", request=MagicMock())
    )
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)

    with patch("routers.soundboard.httpx.AsyncClient", return_value=mock_client):
        tracks = await _fetch_catalog()

    assert tracks[0]["title"] == "Stale Track"


@pytest.mark.asyncio
async def test_fetch_catalog_upstream_failure_empty_cache_returns_empty():
    mock_client = AsyncMock()
    mock_client.get = AsyncMock(
        side_effect=_httpx.RequestError("timeout", request=MagicMock())
    )
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)

    with patch("routers.soundboard.httpx.AsyncClient", return_value=mock_client):
        tracks = await _fetch_catalog()

    assert tracks == []


@pytest.mark.asyncio
async def test_fetch_catalog_invalid_json_shape_returns_stale():
    _catalog_cache["tracks"] = [{"title": "Stale"}]

    response = MagicMock()
    response.json.return_value = "not a dict or list"
    response.raise_for_status = MagicMock()

    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=response)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)

    with patch("routers.soundboard.httpx.AsyncClient", return_value=mock_client):
        tracks = await _fetch_catalog()

    assert tracks[0]["title"] == "Stale"


# ---------------------------------------------------------------------------
# Integration tests: GET /api/soundboard/catalog
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_catalog_200_with_tracks():
    with _mock_catalog_httpx(SAMPLE_RAW_FEED):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.get("/api/soundboard/catalog")

    assert response.status_code == 200
    data = response.json()
    assert data["count"] == 1
    assert len(data["tracks"]) == 1
    assert data["tracks"][0]["title"] == "Tavern Music"


@pytest.mark.asyncio
async def test_catalog_track_urls_rewritten_to_proxy():
    with _mock_catalog_httpx(SAMPLE_RAW_FEED):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.get("/api/soundboard/catalog")

    for track in response.json()["tracks"]:
        if track["url"]:
            assert track["url"].startswith("/api/soundboard/proxy")


@pytest.mark.asyncio
async def test_catalog_count_matches_tracks_length():
    two_tracks = {"tracks": [SAMPLE_RAW_TRACK, {**SAMPLE_RAW_TRACK, "key": 43}]}
    with _mock_catalog_httpx(two_tracks):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.get("/api/soundboard/catalog")

    data = response.json()
    assert data["count"] == len(data["tracks"])


@pytest.mark.asyncio
async def test_catalog_includes_attribution():
    with _mock_catalog_httpx(SAMPLE_RAW_FEED):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.get("/api/soundboard/catalog")

    attribution = response.json()["attribution"]
    assert "Tabletop Audio" in attribution["name"]
    assert "tabletopaudio.com" in attribution["url"]


@pytest.mark.asyncio
async def test_catalog_503_when_no_tracks():
    with patch("routers.soundboard._fetch_catalog", new=AsyncMock(return_value=[])):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.get("/api/soundboard/catalog")

    assert response.status_code == 503


@pytest.mark.asyncio
async def test_catalog_second_call_uses_cache():
    mock_client = AsyncMock()
    response = MagicMock()
    response.json.return_value = SAMPLE_RAW_FEED
    response.raise_for_status = MagicMock()
    mock_client.get = AsyncMock(return_value=response)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)

    with patch("routers.soundboard.httpx.AsyncClient", return_value=mock_client):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            await client.get("/api/soundboard/catalog")
            await client.get("/api/soundboard/catalog")

    assert mock_client.get.call_count == 1


# ---------------------------------------------------------------------------
# Integration tests: GET /api/soundboard/proxy
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_proxy_rejects_disallowed_host():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.get(
            "/api/soundboard/proxy", params={"url": "https://evil.com/audio.mp3"}
        )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_proxy_rejects_subdomain_spoofing():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.get(
            "/api/soundboard/proxy",
            params={"url": "https://evil.sounds.tabletopaudio.com/audio.mp3"},
        )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_proxy_streams_audio_body():
    with _mock_proxy_httpx(
        status_code=200,
        headers={"content-type": "audio/mpeg", "content-length": "10"},
        chunks=[b"audio", b"data"],
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.get(
                "/api/soundboard/proxy", params={"url": VALID_AUDIO_URL}
            )

    assert response.status_code == 200
    assert response.content == b"audiodata"


@pytest.mark.asyncio
async def test_proxy_forwards_content_type():
    with _mock_proxy_httpx(
        status_code=200,
        headers={"content-type": "audio/ogg"},
        chunks=[b"ogg"],
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.get(
                "/api/soundboard/proxy", params={"url": VALID_AUDIO_URL}
            )

    assert response.headers["content-type"].startswith("audio/ogg")


@pytest.mark.asyncio
async def test_proxy_forwards_content_length():
    with _mock_proxy_httpx(
        status_code=200,
        headers={"content-type": "audio/mpeg", "content-length": "4096"},
        chunks=[b"data"],
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.get(
                "/api/soundboard/proxy", params={"url": VALID_AUDIO_URL}
            )

    assert response.headers.get("content-length") == "4096"


@pytest.mark.asyncio
async def test_proxy_sets_accept_ranges():
    with _mock_proxy_httpx():
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.get(
                "/api/soundboard/proxy", params={"url": VALID_AUDIO_URL}
            )

    assert response.headers.get("accept-ranges") == "bytes"


@pytest.mark.asyncio
async def test_proxy_forwards_range_request():
    with _mock_proxy_httpx(
        status_code=206,
        headers={
            "content-type": "audio/mpeg",
            "content-length": "256",
            "content-range": "bytes 0-255/512",
        },
        chunks=[b"partial"],
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.get(
                "/api/soundboard/proxy",
                params={"url": VALID_AUDIO_URL},
                headers={"Range": "bytes=0-255"},
            )

    assert response.status_code == 206
    assert response.headers.get("content-range") == "bytes 0-255/512"


@pytest.mark.asyncio
async def test_proxy_upstream_403_returns_404():
    with _mock_proxy_httpx(status_code=403, chunks=[]):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.get(
                "/api/soundboard/proxy", params={"url": VALID_AUDIO_URL}
            )

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_proxy_upstream_500_returns_502():
    with _mock_proxy_httpx(status_code=500, chunks=[]):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.get(
                "/api/soundboard/proxy", params={"url": VALID_AUDIO_URL}
            )

    assert response.status_code == 502


@pytest.mark.asyncio
async def test_proxy_network_error_returns_502():
    with _mock_proxy_httpx_request_error():
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.get(
                "/api/soundboard/proxy", params={"url": VALID_AUDIO_URL}
            )

    assert response.status_code == 502
