"""
Soundboard tools for the PydanticAI soundboard agent.

Used by the /api/soundboard/suggest endpoint to power scene-aware track
recommendations. The agent calls get_scene_context first to understand the
current session, then calls search_soundboard_library one or more times
with relevant queries before returning ranked suggestions.
"""

from pydantic_ai import RunContext

from tools.deps import CampaignDeps


def get_scene_context(ctx: RunContext[CampaignDeps], session_id: str) -> str:
    """Return a formatted scene description for the given session.

    Gathers campaign setting, session title and DM notes, active missions,
    active story beats, and known locations — all the narrative signals
    needed to pick appropriate ambient music.
    """
    sb = ctx.deps.supabase
    campaign_id = ctx.deps.campaign_id

    campaign = (
        sb.table("campaigns")
        .select("name, description, system")
        .eq("id", campaign_id)
        .single()
        .execute()
        .data
        or {}
    )

    session = (
        sb.table("sessions")
        .select("title, dm_notes, prep_brief, session_number")
        .eq("id", session_id)
        .single()
        .execute()
        .data
        or {}
    )

    missions = (
        sb.table("missions")
        .select("title, description, type")
        .eq("campaign_id", campaign_id)
        .in_("status", ["available", "active"])
        .limit(5)
        .execute()
        .data
        or []
    )

    beats = (
        sb.table("story_beats")
        .select("title, description, type")
        .eq("campaign_id", campaign_id)
        .in_("status", ["planted", "active"])
        .limit(5)
        .execute()
        .data
        or []
    )

    locations = (
        sb.table("locations")
        .select("name, type, description")
        .eq("campaign_id", campaign_id)
        .limit(10)
        .execute()
        .data
        or []
    )

    lines: list[str] = []

    lines.append(f"CAMPAIGN: {campaign.get('name', 'Unknown')}")
    if campaign.get("description"):
        lines.append(f"Description: {campaign['description']}")
    lines.append(f"System: {campaign.get('system', '5e-2014')}")
    lines.append("")

    num = session.get("session_number", "?")
    title = session.get("title") or "Untitled"
    lines.append(f"SESSION {num}: {title}")
    if session.get("dm_notes"):
        lines.append(f"DM Notes: {session['dm_notes']}")
    if session.get("prep_brief"):
        brief = session["prep_brief"]
        # Truncate very long prep briefs to keep prompt size reasonable.
        if len(brief) > 600:
            brief = brief[:600] + "…"
        lines.append(f"Prep Brief: {brief}")
    lines.append("")

    if missions:
        lines.append("ACTIVE MISSIONS:")
        for m in missions:
            desc = f" — {m['description']}" if m.get("description") else ""
            lines.append(f"  - {m['title']} ({m.get('type', 'quest')}){desc}")
        lines.append("")

    if beats:
        lines.append("ACTIVE STORY BEATS:")
        for b in beats:
            desc = f" — {b['description']}" if b.get("description") else ""
            lines.append(f"  - {b['title']} ({b.get('type', 'event')}){desc}")
        lines.append("")

    if locations:
        lines.append("KNOWN LOCATIONS:")
        for loc in locations:
            desc = f": {loc['description']}" if loc.get("description") else ""
            lines.append(f"  - {loc['name']} ({loc.get('type', 'place')}){desc}")

    return "\n".join(lines)


def search_soundboard_library(
    ctx: RunContext[CampaignDeps],
    query: str,
    limit: int = 15,
) -> list[dict]:
    """Search the global soundboard track library by free text.

    Matches against title, flavor text, tags, and genres. Returns up to
    ``limit`` results. Call multiple times with different queries (e.g.
    'dungeon', 'tense combat', 'forest travel') to explore the catalog
    before making final recommendations.
    """
    sb = ctx.deps.supabase

    # Fetch a broad set of global tracks, then filter client-side so we
    # are not constrained by PostgREST full-text search limitations.
    tracks = (
        sb.table("soundboard_tracks")
        .select("id, source, external_id, title, url, track_type, tags, genres, flavor")
        .is_("campaign_id", "null")
        .limit(400)
        .execute()
        .data
        or []
    )

    if query:
        ql = query.lower()
        tracks = [
            t
            for t in tracks
            if ql in (t.get("title") or "").lower()
            or ql in (t.get("flavor") or "").lower()
            or any(ql in tag.lower() for tag in (t.get("tags") or []))
            or any(ql in g.lower() for g in (t.get("genres") or []))
        ]

    return tracks[:limit]


ALL_SOUNDBOARD_TOOLS = [get_scene_context, search_soundboard_library]
