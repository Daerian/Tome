"""
Soundboard router for DM audio playback in Tome.

Phase 1 (MVP): exposes a catalog endpoint and an audio proxy endpoint.

Catalog: fetches and caches the public Tabletop Audio JSON feed
(tabletopaudio.com/tta_data), normalizes tracks, and rewrites all audio
URLs to go through /api/soundboard/proxy.

Proxy: required because the Tabletop Audio CDN uses split hotlink protection.
Newer tracks (key >= ~371) are open to any request, but older tracks require
a Referer header pointing to tabletopaudio.com or they return 403. Browser
audio elements never send that Referer for cross-origin requests, so the
backend proxies the request and injects the header. The proxy validates the
target host before forwarding to prevent SSRF.
"""

import os
import time
from urllib.parse import unquote, urlencode, urlparse

import httpx
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

router = APIRouter()

# Lazy imports to avoid circular dependency at module load time.
# generate.py defines the soundboard_agent and imports soundboard_tools;
# soundboard.py imports the agent only inside the suggest endpoint handler.

TABLETOP_AUDIO_CATALOG_URL = "https://tabletopaudio.com/tta_data"
ALLOWED_AUDIO_HOST = "sounds.tabletopaudio.com"
PROXY_REFERER = "https://tabletopaudio.com/"
CACHE_TTL_SECONDS = 24 * 60 * 60

FREESOUND_API_BASE = "https://freesound.org/apiv2"
FREESOUND_FIELDS = "id,name,tags,previews,duration,license,username"
SFX_CACHE_TTL = 300  # 5 minutes — Freesound rate limits: 60 req/min, 2000 req/day

# In-memory SFX cache: maps lowercased query string to {results, fetched_at}.
_sfx_cache: dict[str, dict] = {}

# In-memory catalog cache. Keyed by "fetched_at" (float timestamp) and
# "tracks" (list of normalized dicts). Survives across requests for the
# lifetime of the process; refreshed once per day.
_catalog_cache: dict[str, object] = {
    "fetched_at": 0.0,
    "tracks": [],
}

# Tracks the timestamp of the last successful catalog-to-DB sync so we only
# write to Supabase once per cache generation (24h TTL).
_db_sync_at: float = 0.0


# ---------------------------------------------------------------------------
# Catalog helpers
# ---------------------------------------------------------------------------


def _proxy_url(original_url: str) -> str:
    """Return a relative proxy URL for the given CDN audio URL."""
    return f"/api/soundboard/proxy?{urlencode({'url': original_url})}"


def _normalize(track: dict) -> dict:
    """Map a raw Tabletop Audio track dict into the normalized shape.

    The raw feed uses "track_genre" (list) and "tags" (list of
    comma-separated strings in older entries, plain strings in newer ones).
    Both are flattened into clean lists here so callers never need to know
    about the source format.
    """
    key = track.get("key")
    genres_raw = track.get("track_genre") or []
    tags_raw = track.get("tags") or []

    genres = [g.strip() for g in genres_raw if isinstance(g, str) and g.strip()]

    # Tags may arrive as a list of comma-separated strings or plain strings.
    tags: list[str] = []
    if isinstance(tags_raw, list):
        for t in tags_raw:
            if isinstance(t, str):
                tags.extend(part.strip() for part in t.split(",") if part.strip())
    elif isinstance(tags_raw, str):
        tags.extend(part.strip() for part in tags_raw.split(",") if part.strip())

    original_url = track.get("link") or ""
    return {
        "id": f"tabletop_audio:{key}",
        "source": "tabletop_audio",
        "external_id": str(key) if key is not None else "",
        "title": track.get("track_title") or "Untitled",
        # Rewrite to the proxy so the CDN Referer check is handled server-side.
        "url": _proxy_url(original_url) if original_url else "",
        "track_type": track.get("track_type") or "",
        "genres": genres,
        "tags": tags,
        "flavor": track.get("flavor_text") or "",
        "image_url": track.get("large_image") or track.get("small_image") or "",
        "is_new": bool(track.get("new")),
    }


async def _fetch_catalog() -> list[dict]:
    """Return the normalized catalog, refreshing from upstream when the TTL expires.

    On upstream failure the last cached payload is returned so the UI stays
    usable during outages. Returns an empty list only on the very first
    request if the upstream is unreachable.
    """
    now = time.time()
    fetched_at = float(_catalog_cache.get("fetched_at") or 0.0)
    cached_tracks = _catalog_cache.get("tracks") or []

    if cached_tracks and (now - fetched_at) < CACHE_TTL_SECONDS:
        return cached_tracks  # type: ignore[return-value]

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.get(
                TABLETOP_AUDIO_CATALOG_URL,
                headers={"Accept": "application/json"},
            )
            res.raise_for_status()
            data = res.json()
    except (httpx.HTTPError, ValueError):
        return cached_tracks  # type: ignore[return-value]

    raw_tracks = data.get("tracks") if isinstance(data, dict) else data
    if not isinstance(raw_tracks, list):
        return cached_tracks  # type: ignore[return-value]

    normalized = [_normalize(t) for t in raw_tracks if isinstance(t, dict)]
    _catalog_cache["fetched_at"] = now
    _catalog_cache["tracks"] = normalized
    return normalized


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/soundboard/catalog")
async def get_catalog():
    """Return the cached, normalized Tabletop Audio catalog.

    All track ``url`` fields point to ``/api/soundboard/proxy`` so the
    frontend never contacts the CDN directly. This avoids the
    hotlink-protection 403 that affects older tracks.
    """
    tracks = await _fetch_catalog()
    if not tracks:
        raise HTTPException(
            status_code=503,
            detail="Soundboard catalog is temporarily unavailable.",
        )

    return {
        "source": "tabletop_audio",
        "attribution": {
            "name": "Tabletop Audio",
            "url": "https://tabletopaudio.com/",
            "note": "Free ambiences by Tabletop Audio. Please consider donating.",
        },
        "count": len(tracks),
        "tracks": tracks,
    }


@router.get("/soundboard/proxy")
async def proxy_audio(url: str, request: Request):
    """Stream an audio file from the Tabletop Audio CDN.

    Injects ``Referer: https://tabletopaudio.com/`` to satisfy the CDN
    hotlink protection on older tracks. Validates that the target host is
    exactly ``sounds.tabletopaudio.com`` before forwarding to prevent SSRF.

    Passes through ``Range`` headers from the client so browser seeking works.
    """
    decoded = unquote(url)
    parsed = urlparse(decoded)

    if parsed.hostname != ALLOWED_AUDIO_HOST:
        raise HTTPException(status_code=400, detail="Invalid audio source host.")

    upstream_headers = {
        "User-Agent": "Mozilla/5.0 (compatible; Tome/1.0)",
        "Referer": PROXY_REFERER,
        "Accept": "audio/*,*/*",
    }
    if "range" in request.headers:
        upstream_headers["Range"] = request.headers["range"]

    async def _stream():
        async with (
            httpx.AsyncClient(timeout=60.0) as client,
            client.stream(
                "GET", decoded, headers=upstream_headers, follow_redirects=True
            ) as resp,
        ):
            # Stash response metadata on the function object so the caller
            # can read status and headers before consuming the body chunks.
            _stream.status_code = resp.status_code
            _stream.headers = resp.headers
            async for chunk in resp.aiter_bytes(chunk_size=8192):
                yield chunk

    gen = _stream()
    # Advance the generator to the first yield so that _stream.status_code
    # and _stream.headers are populated before we build the response object.
    try:
        first_chunk = await gen.__anext__()
    except StopAsyncIteration:
        first_chunk = None
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=502, detail=f"Audio fetch failed: {exc}"
        ) from exc

    status_code = getattr(_stream, "status_code", 200)
    resp_headers = getattr(_stream, "headers", {})

    if status_code == 403:
        raise HTTPException(status_code=404, detail="Track unavailable.")
    if status_code not in (200, 206):
        raise HTTPException(status_code=502, detail=f"Upstream returned {status_code}")

    content_type = resp_headers.get("content-type", "audio/mpeg")
    content_length = resp_headers.get("content-length")
    content_range = resp_headers.get("content-range")

    out_headers: dict[str, str] = {
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=86400",
    }
    if content_length:
        out_headers["Content-Length"] = content_length
    if content_range:
        out_headers["Content-Range"] = content_range

    async def _with_first(first, rest):
        if first is not None:
            yield first
        async for chunk in rest:
            yield chunk

    return StreamingResponse(
        _with_first(first_chunk, gen),
        status_code=status_code,
        headers=out_headers,
        media_type=content_type,
    )


# ---------------------------------------------------------------------------
# SFX search (Phase 3)
# ---------------------------------------------------------------------------


@router.get("/soundboard/sfx/search")
async def sfx_search(
    q: str = Query(..., min_length=1),
    page_size: int = Query(default=15, ge=1, le=50),
):
    """Search Freesound for one-shot SFX clips.

    Requires ``FREESOUND_API_KEY`` in the backend environment. Results are
    cached per query for ``SFX_CACHE_TTL`` seconds to stay within Freesound's
    rate limits. Preview CDN URLs are returned directly — no proxy is required
    because HTML5 audio does not enforce CORS during playback.
    """
    api_key = os.getenv("FREESOUND_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="SFX search is not configured. Add FREESOUND_API_KEY to the backend environment.",
        )

    cache_key = q.lower().strip()
    cached = _sfx_cache.get(cache_key)
    if cached and (time.time() - cached["fetched_at"]) < SFX_CACHE_TTL:
        return {"count": len(cached["results"]), "results": cached["results"]}

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.get(
                f"{FREESOUND_API_BASE}/search/text/",
                params={
                    "query": q,
                    "fields": FREESOUND_FIELDS,
                    "page_size": page_size,
                    "token": api_key,
                },
            )
            res.raise_for_status()
            data = res.json()
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Freesound returned {exc.response.status_code}.",
        ) from exc
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=502, detail=f"Freesound unreachable: {exc}"
        ) from exc

    results = []
    for sound in data.get("results") or []:
        previews = sound.get("previews") or {}
        url = previews.get("preview-hq-mp3") or previews.get("preview-lq-mp3") or ""
        if not url:
            continue
        results.append(
            {
                "id": f"freesound:{sound['id']}",
                "source": "freesound",
                "external_id": str(sound["id"]),
                "title": sound.get("name") or "Untitled",
                "url": url,
                "tags": (sound.get("tags") or [])[:10],
                "duration": sound.get("duration"),
                "license": sound.get("license") or "",
                "attribution": sound.get("username") or "",
            }
        )

    _sfx_cache[cache_key] = {"results": results, "fetched_at": time.time()}
    return {"count": len(results), "results": results}


# ---------------------------------------------------------------------------
# Catalog DB sync (Phase 2)
# ---------------------------------------------------------------------------


async def _sync_catalog_to_db(sb) -> None:
    """Upsert the in-memory catalog into the soundboard_tracks Supabase table.

    Runs at most once per cache generation. Uses delete-then-insert because
    partial unique indexes on nullable columns cannot be referenced by the
    Supabase upsert on_conflict parameter. The service-role client bypasses
    all RLS so no special policies are needed for global tracks.
    """
    global _db_sync_at

    tracks = _catalog_cache.get("tracks") or []
    if not tracks:
        return

    fetched_at = float(_catalog_cache.get("fetched_at") or 0.0)
    if _db_sync_at >= fetched_at:
        return  # already synced this cache generation

    rows = [
        {
            "source": t["source"],
            "external_id": t["external_id"],
            "title": t["title"],
            "url": t["url"],
            "track_type": t.get("track_type", ""),
            "tags": t.get("tags") or [],
            "genres": t.get("genres") or [],
            "flavor": t.get("flavor", ""),
            "image_url": t.get("image_url", ""),
            "campaign_id": None,
        }
        for t in tracks
    ]

    try:
        # Replace all existing global Tabletop Audio tracks atomically.
        sb.table("soundboard_tracks").delete().eq("source", "tabletop_audio").is_(
            "campaign_id", "null"
        ).execute()

        batch_size = 100
        for i in range(0, len(rows), batch_size):
            sb.table("soundboard_tracks").insert(rows[i : i + batch_size]).execute()

        _db_sync_at = fetched_at
    except Exception:
        pass  # non-fatal — the in-memory catalog still works if DB is unavailable


# ---------------------------------------------------------------------------
# Suggest endpoint (Phase 2)
# ---------------------------------------------------------------------------


class SuggestRequest(BaseModel):
    campaign_id: str
    session_id: str
    user_id: str | None = None
    scene_hint: str | None = None


@router.post("/soundboard/suggest")
async def suggest_tracks(body: SuggestRequest):
    """Return 3 scene-aware track suggestions for the given session.

    Ensures the Tabletop Audio catalog is synced to the database, then runs
    the soundboard agent which uses the session context and the DB catalog to
    rank tracks by narrative fit.
    """
    from routers.generate import soundboard_agent
    from supabase_client import supabase as sb
    from tools.deps import CampaignDeps

    # Ensure catalog is in the database before the agent searches it.
    await _fetch_catalog()
    await _sync_catalog_to_db(sb)

    deps = CampaignDeps(
        supabase=sb,
        campaign_id=body.campaign_id,
        user_id=body.user_id or "",
        role="dm",
    )

    prompt = (
        f"session_id: {body.session_id}\n\nSuggest 3 ambient tracks for this session."
    )
    if body.scene_hint:
        prompt += f"\nAdditional context from the DM: {body.scene_hint}"

    result = await soundboard_agent.run(prompt, deps=deps)
    return result.output.model_dump()
