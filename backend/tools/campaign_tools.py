"""
Campaign tools — read and write tools for campaign data in Supabase.

All tools accept ``RunContext[CampaignDeps]`` as the first parameter so they
can access the Supabase client, campaign_id, user_id, and role.  Defined as
sync functions because the Supabase client is synchronous; pydantic_ai runs
them in a thread pool automatically.
"""

from pydantic_ai import RunContext
from tools.deps import CampaignDeps


# ---------------------------------------------------------------------------
# Read tools
# ---------------------------------------------------------------------------


def get_session_list(ctx: RunContext[CampaignDeps]) -> str:
    """Get a list of all sessions in this campaign with their number, title,
    status, and date played. Use this to orient yourself before diving into
    a specific session."""

    result = (
        ctx.deps.supabase.table("sessions")
        .select("session_number, title, status, played_date, summary")
        .eq("campaign_id", ctx.deps.campaign_id)
        .order("session_number")
        .execute()
    )
    sessions = result.data or []
    if not sessions:
        return "No sessions have been recorded for this campaign yet."

    lines = []
    for s in sessions:
        title = s.get("title") or "Untitled"
        date = s.get("played_date") or "not yet played"
        summary = s.get("summary") or ""
        summary_preview = (summary[:120] + "...") if len(summary) > 120 else summary
        line = f"- Session {s['session_number']}: {title} [{s['status']}] ({date})"
        if summary_preview:
            line += f"\n  {summary_preview}"
        lines.append(line)
    return "\n".join(lines)


def get_session_details(
    ctx: RunContext[CampaignDeps], session_number: int
) -> str:
    """Get full details for a specific session by its number, including
    summary, DM notes, player notes, contributed notes, and attendees."""

    session_res = (
        ctx.deps.supabase.table("sessions")
        .select(
            "id, session_number, title, status, summary, dm_notes, "
            "player_notes, played_date, in_world_start_date, in_world_end_date"
        )
        .eq("campaign_id", ctx.deps.campaign_id)
        .eq("session_number", session_number)
        .single()
        .execute()
    )
    s = session_res.data
    if not s:
        return f"No session #{session_number} found in this campaign."

    lines = [f"=== Session {s['session_number']}: {s.get('title') or 'Untitled'} ==="]
    lines.append(f"Status: {s['status']}")
    if s.get("played_date"):
        lines.append(f"Date played: {s['played_date']}")
    if s.get("in_world_start_date"):
        dates = s["in_world_start_date"]
        if s.get("in_world_end_date"):
            dates += f" to {s['in_world_end_date']}"
        lines.append(f"In-world date: {dates}")
    if s.get("summary"):
        lines.append(f"\nSummary:\n{s['summary']}")
    if s.get("dm_notes"):
        lines.append(f"\nDM Notes:\n{s['dm_notes']}")
    if s.get("player_notes"):
        lines.append(f"\nPlayer Notes:\n{s['player_notes']}")

    # Attendees
    attendees_res = (
        ctx.deps.supabase.table("session_attendees")
        .select("characters(name, race, class, level, status)")
        .eq("session_id", s["id"])
        .execute()
    )
    attendees = attendees_res.data or []
    if attendees:
        lines.append("\nAttendees:")
        for a in attendees:
            ch = a.get("characters")
            if ch:
                lines.append(
                    f"  - {ch['name']} ({ch.get('race', '?')} "
                    f"{ch.get('class', '?')}, Level {ch.get('level', '?')})"
                )

    # Contributed notes
    notes_res = (
        ctx.deps.supabase.table("notes")
        .select("content, profiles(display_name)")
        .eq("related_entity_id", s["id"])
        .eq("visibility", "public")
        .execute()
    )
    notes = notes_res.data or []
    if notes:
        lines.append("\nContributed Notes:")
        for n in notes:
            author = "Unknown"
            if n.get("profiles") and n["profiles"].get("display_name"):
                author = n["profiles"]["display_name"]
            lines.append(f"  [{author}] {n.get('content', '')}")

    return "\n".join(lines)


def search_characters(
    ctx: RunContext[CampaignDeps],
    name: str = "",
    character_type: str = "",
) -> str:
    """Search for characters in this campaign. You can filter by name
    (partial match) and/or type (pc, npc, companion, deity). Returns
    name, race, class, level, description, and status."""

    query = (
        ctx.deps.supabase.table("characters")
        .select(
            "name, type, race, class, level, alignment, status, "
            "description, backstory"
        )
        .eq("campaign_id", ctx.deps.campaign_id)
    )
    if name:
        query = query.ilike("name", f"%{name}%")
    if character_type:
        query = query.eq("type", character_type)

    result = query.limit(15).execute()
    characters = result.data or []
    if not characters:
        filter_desc = ""
        if name:
            filter_desc += f" matching '{name}'"
        if character_type:
            filter_desc += f" of type '{character_type}'"
        return f"No characters found{filter_desc}."

    lines = []
    for ch in characters:
        desc = ch.get("description") or "No description"
        lines.append(
            f"- {ch['name']} ({ch['type']}, {ch.get('race', '?')} "
            f"{ch.get('class', '?')}, Level {ch.get('level', '?')}): "
            f"{desc} [Status: {ch.get('status', '?')}]"
        )
        if ch.get("backstory"):
            backstory = ch["backstory"]
            if len(backstory) > 200:
                backstory = backstory[:200] + "..."
            lines.append(f"  Backstory: {backstory}")
    return "\n".join(lines)


def search_notes(
    ctx: RunContext[CampaignDeps], query: str = ""
) -> str:
    """Search through session notes in this campaign. Optionally filter
    by keyword. Returns note content with author names."""

    q = (
        ctx.deps.supabase.table("notes")
        .select("title, content, type, related_entity_id, profiles(display_name)")
        .eq("campaign_id", ctx.deps.campaign_id)
        .eq("visibility", "public")
        .order("created_at", desc=True)
        .limit(20)
    )
    if query:
        q = q.ilike("content", f"%{query}%")

    result = q.execute()
    notes = result.data or []
    if not notes:
        return f"No notes found{' matching ' + repr(query) if query else ''}."

    lines = []
    for n in notes:
        author = "Unknown"
        if n.get("profiles") and n["profiles"].get("display_name"):
            author = n["profiles"]["display_name"]
        title = n.get("title") or n.get("type", "note")
        content = n.get("content", "")
        if len(content) > 300:
            content = content[:300] + "..."
        lines.append(f"- [{author}] {title}: {content}")
    return "\n".join(lines)


def get_locations(
    ctx: RunContext[CampaignDeps], name: str = ""
) -> str:
    """Get locations in this campaign. Optionally filter by name (partial
    match). Returns name, type, description, and parent location."""

    query = (
        ctx.deps.supabase.table("locations")
        .select("id, name, type, description, parent_location_id")
        .eq("campaign_id", ctx.deps.campaign_id)
    )
    if name:
        query = query.ilike("name", f"%{name}%")

    result = query.limit(20).execute()
    locations = result.data or []
    if not locations:
        return f"No locations found{' matching ' + repr(name) if name else ''}."

    # Build parent lookup for hierarchy
    all_locs_res = (
        ctx.deps.supabase.table("locations")
        .select("id, name")
        .eq("campaign_id", ctx.deps.campaign_id)
        .execute()
    )
    loc_map = {loc["id"]: loc["name"] for loc in (all_locs_res.data or [])}

    lines = []
    for loc in locations:
        parent = ""
        if loc.get("parent_location_id"):
            parent_name = loc_map.get(loc["parent_location_id"], "Unknown")
            parent = f" (in {parent_name})"
        desc = loc.get("description") or "No description"
        if len(desc) > 200:
            desc = desc[:200] + "..."
        lines.append(f"- {loc['name']} ({loc['type']}){parent}: {desc}")
    return "\n".join(lines)


def get_missions(
    ctx: RunContext[CampaignDeps], status: str = ""
) -> str:
    """Get missions in this campaign. Optionally filter by status
    (available, active, completed, failed). Returns title, type, status,
    priority, quest giver, and reward."""

    query = (
        ctx.deps.supabase.table("missions")
        .select(
            "title, description, type, status, priority, "
            "reward_description, notes, quest_giver_id"
        )
        .eq("campaign_id", ctx.deps.campaign_id)
    )
    if status:
        query = query.eq("status", status)
    else:
        query = query.in_("status", ["available", "active"])

    result = query.limit(20).execute()
    missions = result.data or []
    if not missions:
        return f"No missions found{' with status ' + repr(status) if status else ''}."

    # Resolve quest giver names
    char_ids = [m["quest_giver_id"] for m in missions if m.get("quest_giver_id")]
    char_map = {}
    if char_ids:
        chars_res = (
            ctx.deps.supabase.table("characters")
            .select("id, name")
            .in_("id", char_ids)
            .execute()
        )
        char_map = {ch["id"]: ch["name"] for ch in (chars_res.data or [])}

    lines = []
    for m in missions:
        lines.append(
            f"- [{m['type']}, {m['status']}, Priority: {m['priority']}] "
            f"{m['title']}: {m.get('description', '')}"
        )
        if m.get("quest_giver_id"):
            giver = char_map.get(m["quest_giver_id"], "Unknown")
            lines.append(f"  Quest giver: {giver}")
        if m.get("reward_description"):
            lines.append(f"  Reward: {m['reward_description']}")
        if m.get("notes"):
            lines.append(f"  DM Notes: {m['notes']}")
    return "\n".join(lines)


def get_factions(
    ctx: RunContext[CampaignDeps], name: str = ""
) -> str:
    """Get factions in this campaign. Optionally filter by name (partial
    match). Returns name, type, alignment, description, goals, leader,
    and headquarters."""

    query = (
        ctx.deps.supabase.table("factions")
        .select(
            "name, type, description, alignment, status, goals, "
            "leader_character_id, headquarters_location_id"
        )
        .eq("campaign_id", ctx.deps.campaign_id)
        .eq("status", "active")
    )
    if name:
        query = query.ilike("name", f"%{name}%")

    result = query.limit(15).execute()
    factions = result.data or []
    if not factions:
        return f"No active factions found{' matching ' + repr(name) if name else ''}."

    # Resolve FK names
    char_ids = [f["leader_character_id"] for f in factions if f.get("leader_character_id")]
    loc_ids = [f["headquarters_location_id"] for f in factions if f.get("headquarters_location_id")]

    char_map = {}
    if char_ids:
        chars_res = (
            ctx.deps.supabase.table("characters")
            .select("id, name").in_("id", char_ids).execute()
        )
        char_map = {ch["id"]: ch["name"] for ch in (chars_res.data or [])}

    loc_map = {}
    if loc_ids:
        locs_res = (
            ctx.deps.supabase.table("locations")
            .select("id, name").in_("id", loc_ids).execute()
        )
        loc_map = {loc["id"]: loc["name"] for loc in (locs_res.data or [])}

    lines = []
    for f in factions:
        lines.append(
            f"- {f['name']} ({f['type']}, {f.get('alignment', '?')}): "
            f"{f.get('description', '')}"
        )
        if f.get("goals"):
            lines.append(f"  Goals: {f['goals']}")
        if f.get("leader_character_id"):
            lines.append(f"  Leader: {char_map.get(f['leader_character_id'], 'Unknown')}")
        if f.get("headquarters_location_id"):
            lines.append(f"  HQ: {loc_map.get(f['headquarters_location_id'], 'Unknown')}")
    return "\n".join(lines)


def get_story_beats(ctx: RunContext[CampaignDeps]) -> str:
    """Get active and planted story beats (plot threads) in this campaign.
    Returns title, description, type, status, and DM notes."""

    result = (
        ctx.deps.supabase.table("story_beats")
        .select("title, description, type, status, notes, sort_order")
        .eq("campaign_id", ctx.deps.campaign_id)
        .in_("status", ["planted", "active"])
        .order("sort_order")
        .execute()
    )
    beats = result.data or []
    if not beats:
        return "No active story beats recorded for this campaign."

    lines = []
    for b in beats:
        lines.append(
            f"- [{b['type']}, {b['status']}] {b['title']}: "
            f"{b.get('description', '')}"
        )
        if b.get("notes"):
            lines.append(f"  DM Notes: {b['notes']}")
    return "\n".join(lines)


def get_timeline_events(
    ctx: RunContext[CampaignDeps], limit: int = 20
) -> str:
    """Get recent timeline events in this campaign. Returns title,
    description, event type, importance, in-world date, and location."""

    limit = min(limit, 50)

    result = (
        ctx.deps.supabase.table("timeline_events")
        .select(
            "title, description, event_type, importance, "
            "in_world_date, location_id"
        )
        .eq("campaign_id", ctx.deps.campaign_id)
        .order("sort_order", desc=True)
        .limit(limit)
        .execute()
    )
    events = result.data or []
    if not events:
        return "No timeline events recorded for this campaign."

    # Resolve location names
    loc_ids = [e["location_id"] for e in events if e.get("location_id")]
    loc_map = {}
    if loc_ids:
        locs_res = (
            ctx.deps.supabase.table("locations")
            .select("id, name").in_("id", loc_ids).execute()
        )
        loc_map = {loc["id"]: loc["name"] for loc in (locs_res.data or [])}

    lines = []
    for e in events:
        loc = ""
        if e.get("location_id"):
            loc = f" @ {loc_map.get(e['location_id'], 'Unknown')}"
        lines.append(
            f"- [{e['importance']}, {e['event_type']}] "
            f"{e['title']} ({e.get('in_world_date', '?')}){loc}: "
            f"{e.get('description', '')}"
        )
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Write tools
# ---------------------------------------------------------------------------


def add_note(
    ctx: RunContext[CampaignDeps],
    session_id: str,
    content: str,
    title: str = "",
) -> str:
    """Create a session note in the campaign. Use when the user asks you to
    save, remember, or record something about a session. Any campaign member
    can add notes."""

    result = (
        ctx.deps.supabase.table("notes")
        .insert({
            "campaign_id": ctx.deps.campaign_id,
            "created_by": ctx.deps.user_id,
            "related_entity_id": session_id,
            "related_entity_type": "session",
            "type": "session_note",
            "visibility": "public",
            "title": title or "Chat Note",
            "content": content,
        })
        .execute()
    )
    if result.data:
        return f"Note saved successfully: \"{content[:80]}{'...' if len(content) > 80 else ''}\""
    return "Failed to save note."


def update_character_status(
    ctx: RunContext[CampaignDeps],
    character_name: str,
    status: str,
) -> str:
    """Update a character's status (e.g. alive, dead, missing, retired).
    Only the DM can update character status."""

    if ctx.deps.role != "dm":
        return "Only the DM can update character status."

    # Find the character
    char_res = (
        ctx.deps.supabase.table("characters")
        .select("id, name, status")
        .eq("campaign_id", ctx.deps.campaign_id)
        .ilike("name", f"%{character_name}%")
        .limit(1)
        .execute()
    )
    characters = char_res.data or []
    if not characters:
        return f"No character found matching '{character_name}'."

    ch = characters[0]
    old_status = ch.get("status", "unknown")

    ctx.deps.supabase.table("characters").update(
        {"status": status}
    ).eq("id", ch["id"]).execute()

    return f"Updated {ch['name']}'s status from '{old_status}' to '{status}'."


def add_timeline_event(
    ctx: RunContext[CampaignDeps],
    title: str,
    description: str,
    in_world_date: str = "",
) -> str:
    """Record a new timeline event in the campaign. Only the DM can add
    timeline events. Use when the DM wants to log a significant event."""

    if ctx.deps.role != "dm":
        return "Only the DM can add timeline events."

    data = {
        "campaign_id": ctx.deps.campaign_id,
        "title": title,
        "description": description,
        "event_type": "story",
        "importance": "major",
    }
    if in_world_date:
        data["in_world_date"] = in_world_date

    result = (
        ctx.deps.supabase.table("timeline_events")
        .insert(data)
        .execute()
    )
    if result.data:
        return f"Timeline event recorded: \"{title}\""
    return "Failed to record timeline event."


def update_mission_status(
    ctx: RunContext[CampaignDeps],
    mission_title: str,
    new_status: str,
) -> str:
    """Update a mission's status (available, active, completed, failed).
    Only the DM can update mission status."""

    if ctx.deps.role != "dm":
        return "Only the DM can update mission status."

    mission_res = (
        ctx.deps.supabase.table("missions")
        .select("id, title, status")
        .eq("campaign_id", ctx.deps.campaign_id)
        .ilike("title", f"%{mission_title}%")
        .limit(1)
        .execute()
    )
    missions = mission_res.data or []
    if not missions:
        return f"No mission found matching '{mission_title}'."

    m = missions[0]
    old_status = m.get("status", "unknown")

    ctx.deps.supabase.table("missions").update(
        {"status": new_status}
    ).eq("id", m["id"]).execute()

    return f"Updated mission '{m['title']}' from '{old_status}' to '{new_status}'."


# ---------------------------------------------------------------------------
# Export all tools as a list for Agent(tools=[...])
# ---------------------------------------------------------------------------

READ_TOOLS = [
    get_session_list,
    get_session_details,
    search_characters,
    search_notes,
    get_locations,
    get_missions,
    get_factions,
    get_story_beats,
    get_timeline_events,
]

WRITE_TOOLS = [
    add_note,
    update_character_status,
    add_timeline_event,
    update_mission_status,
]

ALL_CAMPAIGN_TOOLS = READ_TOOLS + WRITE_TOOLS
