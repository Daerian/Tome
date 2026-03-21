-- ============================================================================
-- TOME — Phase 2 Database Schema
-- D&D Companion App · Supabase / PostgreSQL
-- ============================================================================
-- Depends on Phase 1: profiles, campaigns, campaign_members, characters,
-- conversations, messages, handle_updated_at(), is_campaign_member(),
-- is_campaign_dm().
-- ============================================================================

-- ============================================================================
-- 1. LOCATIONS — self-referential hierarchy
--    world → continent → region → city/town/village → building → room
-- ============================================================================

create table public.locations (
  id                  uuid        primary key default gen_random_uuid(),
  campaign_id         uuid        not null references public.campaigns (id) on delete cascade,
  parent_location_id  uuid        references public.locations (id) on delete set null,
  name                text        not null,
  type                text        not null
                                  check (type in (
                                    'continent', 'region', 'city', 'town', 'village',
                                    'dungeon', 'building', 'room', 'wilderness', 'plane'
                                  )),
  description         text,
  notes               text,
  visibility          text        not null default 'public'
                                  check (visibility in ('public', 'private', 'secret')),
  properties          jsonb       not null default '{}'::jsonb,
  player_map_url      text,
  dm_map_url          text,
  coordinates         jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.locations is
  'Hierarchical location tree — self-referential via parent_location_id.';
comment on column public.locations.notes is
  'DM-only notes about this location (enforce in application layer alongside visibility).';
comment on column public.locations.visibility is
  'public = all campaign members, private = DM only, secret = DM only. Enforcement is only at the application layer; RLS does not restrict access based on this column.';
comment on column public.locations.properties is
  'Flexible JSONB blob for population, climate, governance, etc.';
comment on column public.locations.coordinates is
  'Optional JSONB for map coordinates, e.g. {"x": 100, "y": 200} or {"lat": ..., "lng": ...}.';

create index idx_locations_campaign_id        on public.locations (campaign_id);
create index idx_locations_parent_location_id on public.locations (parent_location_id);

create trigger locations_updated_at
  before update on public.locations
  for each row execute function public.handle_updated_at();

-- ============================================================================
-- 2. FACTIONS — guilds, religions, kingdoms, cults
-- ============================================================================

create table public.factions (
  id                      uuid        primary key default gen_random_uuid(),
  campaign_id             uuid        not null references public.campaigns (id) on delete cascade,
  name                    text        not null,
  type                    text        not null
                                      check (type in (
                                        'guild', 'kingdom', 'religion', 'cult',
                                        'merchant_company', 'military', 'criminal', 'other'
                                      )),
  description             text,
  alignment               text,
  status                  text        not null default 'active'
                                      check (status in ('active', 'disbanded', 'secret', 'destroyed')),
  headquarters_location_id uuid       references public.locations (id) on delete set null,
  leader_character_id     uuid        references public.characters (id) on delete set null,
  goals                   text,
  notes                   text,
  visibility              text        not null default 'public'
                                      check (visibility in ('public', 'private', 'secret')),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

comment on table public.factions is
  'Organisations: guilds, kingdoms, religions, cults, and more.';
comment on column public.factions.notes is
  'DM-only notes about this faction.';
comment on column public.factions.visibility is
  'public = all campaign members, private = DM only, secret = DM only.';

create index idx_factions_campaign_id on public.factions (campaign_id);

create trigger factions_updated_at
  before update on public.factions
  for each row execute function public.handle_updated_at();

-- ============================================================================
-- 3. SESSIONS — real-world session tracking
-- ============================================================================

create table public.sessions (
  id                  uuid        primary key default gen_random_uuid(),
  campaign_id         uuid        not null references public.campaigns (id) on delete cascade,
  session_number      integer     not null,
  title               text,
  scheduled_date      date,
  played_date         date,
  status              text        not null default 'planned'
                                  check (status in ('planned', 'in_progress', 'completed', 'cancelled')),
  summary             text,
  dm_notes            text,
  player_notes        text,
  in_world_start_date text,
  in_world_end_date   text,
  duration_minutes    integer,
  xp_awarded          integer,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.sessions is
  'Tracks real-world game sessions and links them to in-world time.';
comment on column public.sessions.dm_notes is
  'Private DM notes — visibility enforced at the application layer. '
  'RLS allows all members to SELECT the row; the app must strip dm_notes for non-DMs.';
comment on column public.sessions.in_world_start_date is
  'Free-form text for in-world calendar dates (e.g. "3rd of Mirtul, 1492 DR").';

create index idx_sessions_campaign_id on public.sessions (campaign_id);

create trigger sessions_updated_at
  before update on public.sessions
  for each row execute function public.handle_updated_at();

-- ============================================================================
-- 4. SESSION_ATTENDEES — who played which character
-- ============================================================================

create table public.session_attendees (
  id           uuid        primary key default gen_random_uuid(),
  session_id   uuid        not null references public.sessions (id) on delete cascade,
  character_id uuid        not null references public.characters (id) on delete cascade,
  user_id      uuid        not null references public.profiles (id) on delete cascade,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  unique (session_id, character_id)
);

comment on table public.session_attendees is
  'Junction table recording which player played which character in a session.';

create index idx_session_attendees_session_id on public.session_attendees (session_id);

create trigger session_attendees_updated_at
  before update on public.session_attendees
  for each row execute function public.handle_updated_at();

-- ============================================================================
-- 5. TIMELINE_EVENTS — chronological history
-- ============================================================================

create table public.timeline_events (
  id                  uuid        primary key default gen_random_uuid(),
  campaign_id         uuid        not null references public.campaigns (id) on delete cascade,
  session_id          uuid        references public.sessions (id) on delete set null,
  in_world_date       text        not null,
  sort_order          integer     not null,
  title               text        not null,
  description         text,
  event_type          text        not null
                                  check (event_type in (
                                    'world_history', 'campaign_event', 'character_event',
                                    'political', 'divine', 'combat', 'discovery'
                                  )),
  importance          text        not null default 'minor'
                                  check (importance in ('major', 'minor', 'background')),
  visibility          text        not null default 'public'
                                  check (visibility in ('public', 'private', 'secret')),
  related_entity_type text,
  related_entity_id   uuid,
  location_id         uuid        references public.locations (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.timeline_events is
  'Chronological events in the campaign world, sortable by sort_order.';
comment on column public.timeline_events.in_world_date is
  'Free-form text for in-world calendar dates.';
comment on column public.timeline_events.related_entity_type is
  'Polymorphic reference type — e.g. "character", "faction", "location".';
comment on column public.timeline_events.related_entity_id is
  'Polymorphic reference UUID — the entity indicated by related_entity_type.';
comment on column public.timeline_events.visibility is
  'public = all campaign members, private = DM only, secret = DM only.';

create index idx_timeline_events_campaign_id on public.timeline_events (campaign_id);
create index idx_timeline_events_session_id  on public.timeline_events (session_id);

create trigger timeline_events_updated_at
  before update on public.timeline_events
  for each row execute function public.handle_updated_at();

-- ============================================================================
-- 6. STORY_BEATS — narrative threads
-- ============================================================================

create table public.story_beats (
  id                uuid        primary key default gen_random_uuid(),
  campaign_id       uuid        not null references public.campaigns (id) on delete cascade,
  session_id        uuid        references public.sessions (id) on delete set null,
  timeline_event_id uuid        references public.timeline_events (id) on delete set null,
  title             text        not null,
  description       text,
  type              text        not null
                                check (type in (
                                  'plot_hook', 'reveal', 'cliffhanger',
                                  'character_moment', 'twist', 'resolution', 'foreshadowing'
                                )),
  status            text        not null default 'planted'
                                check (status in (
                                  'planted', 'active', 'revealed', 'resolved', 'abandoned'
                                )),
  visibility        text        not null default 'secret'
                                check (visibility in ('public', 'private', 'secret')),
  sort_order        integer     not null,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.story_beats is
  'Narrative threads the DM tracks — plot hooks, reveals, twists, etc.';
comment on column public.story_beats.visibility is
  'public = all campaign members, private = DM only, secret = DM only. '
  'Defaults to secret since most story beats are DM knowledge.';

create index idx_story_beats_campaign_id on public.story_beats (campaign_id);
create index idx_story_beats_session_id  on public.story_beats (session_id);

create trigger story_beats_updated_at
  before update on public.story_beats
  for each row execute function public.handle_updated_at();

-- ============================================================================
-- 7. NOTES — universal scratch pad
-- ============================================================================

create table public.notes (
  id                  uuid        primary key default gen_random_uuid(),
  campaign_id         uuid        not null references public.campaigns (id) on delete cascade,
  author_id           uuid        not null references public.profiles (id) on delete cascade,
  title               text        not null,
  content             text,
  type                text        not null default 'general'
                                  check (type in (
                                    'dm_prep', 'session_note', 'player_journal',
                                    'world_lore', 'general'
                                  )),
  is_shared           boolean     not null default false,
  is_pinned           boolean     not null default false,
  related_entity_type text,
  related_entity_id   uuid,
  tags                text[],
  visibility          text        not null default 'private'
                                  check (visibility in ('public', 'private', 'secret')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.notes is
  'Universal note-taking: DM prep, session notes, player journals, world lore.';
comment on column public.notes.visibility is
  'public = all campaign members, private = author + DM, secret = DM only.';
comment on column public.notes.is_shared is
  'When true, the note is visible to all campaign members regardless of visibility.';
comment on column public.notes.related_entity_type is
  'Polymorphic reference type — e.g. "character", "location", "session".';
comment on column public.notes.related_entity_id is
  'Polymorphic reference UUID — the entity indicated by related_entity_type.';

create index idx_notes_campaign_id on public.notes (campaign_id);
create index idx_notes_author_id   on public.notes (author_id);

create trigger notes_updated_at
  before update on public.notes
  for each row execute function public.handle_updated_at();

-- ============================================================================
-- 8. ROW-LEVEL SECURITY
-- ============================================================================

-- Turn RLS on for every new table
alter table public.locations         enable row level security;
alter table public.factions          enable row level security;
alter table public.sessions          enable row level security;
alter table public.session_attendees enable row level security;
alter table public.timeline_events   enable row level security;
alter table public.story_beats       enable row level security;
alter table public.notes             enable row level security;

-- --------------------------------------------------------------------------
-- LOCATIONS — visibility-based, no owner (private/secret = DM only)
-- --------------------------------------------------------------------------

-- SELECT: visibility controls who can see the location
create policy "Locations visible by campaign role and visibility"
  on public.locations for select
  to authenticated
  using (
    public.is_campaign_member(campaign_id)
    and (
      visibility = 'public'
      or (visibility = 'private' and public.is_campaign_dm(campaign_id))
      or (visibility = 'secret'  and public.is_campaign_dm(campaign_id))
    )
  );

-- INSERT: DM can create locations
create policy "DM can create locations"
  on public.locations for insert
  to authenticated
  with check (public.is_campaign_dm(campaign_id));

-- UPDATE: DM can edit locations
create policy "DM can update locations"
  on public.locations for update
  to authenticated
  using  (public.is_campaign_dm(campaign_id))
  with check (public.is_campaign_dm(campaign_id));

-- DELETE: DM can delete locations
create policy "DM can delete locations"
  on public.locations for delete
  to authenticated
  using (public.is_campaign_dm(campaign_id));

-- --------------------------------------------------------------------------
-- FACTIONS — visibility-based, no owner (private/secret = DM only)
-- --------------------------------------------------------------------------

-- SELECT: visibility controls who can see the faction
create policy "Factions visible by campaign role and visibility"
  on public.factions for select
  to authenticated
  using (
    public.is_campaign_member(campaign_id)
    and (
      visibility = 'public'
      or (visibility = 'private' and public.is_campaign_dm(campaign_id))
      or (visibility = 'secret'  and public.is_campaign_dm(campaign_id))
    )
  );

-- INSERT: DM can create factions
create policy "DM can create factions"
  on public.factions for insert
  to authenticated
  with check (public.is_campaign_dm(campaign_id));

-- UPDATE: DM can edit factions
create policy "DM can update factions"
  on public.factions for update
  to authenticated
  using  (public.is_campaign_dm(campaign_id))
  with check (public.is_campaign_dm(campaign_id));

-- DELETE: DM can delete factions
create policy "DM can delete factions"
  on public.factions for delete
  to authenticated
  using (public.is_campaign_dm(campaign_id));

-- --------------------------------------------------------------------------
-- SESSIONS — all members can read, DM can write
-- NOTE: The dm_notes column is visible to all members at the SQL level.
--       The application layer MUST strip dm_notes from responses for non-DM
--       users. This avoids the complexity of column-level security in RLS.
-- --------------------------------------------------------------------------

-- SELECT: all campaign members can read sessions
create policy "Campaign members can read sessions"
  on public.sessions for select
  to authenticated
  using (public.is_campaign_member(campaign_id));

-- INSERT: DM can create sessions
create policy "DM can create sessions"
  on public.sessions for insert
  to authenticated
  with check (public.is_campaign_dm(campaign_id));

-- UPDATE: DM can edit sessions
create policy "DM can update sessions"
  on public.sessions for update
  to authenticated
  using  (public.is_campaign_dm(campaign_id))
  with check (public.is_campaign_dm(campaign_id));

-- DELETE: DM can delete sessions
create policy "DM can delete sessions"
  on public.sessions for delete
  to authenticated
  using (public.is_campaign_dm(campaign_id));

-- --------------------------------------------------------------------------
-- SESSION_ATTENDEES — members can read, DM can write
-- --------------------------------------------------------------------------

-- SELECT: campaign members can see attendees
--   (join through sessions to get campaign_id)
create policy "Campaign members can read session attendees"
  on public.session_attendees for select
  to authenticated
  using (
    exists (
      select 1 from public.sessions s
      where s.id = session_id
        and public.is_campaign_member(s.campaign_id)
    )
  );

-- INSERT: DM can add attendees
create policy "DM can create session attendees"
  on public.session_attendees for insert
  to authenticated
  with check (
    exists (
      select 1 from public.sessions s
      where s.id = session_id
        and public.is_campaign_dm(s.campaign_id)
    )
  );

-- UPDATE: DM can edit attendees
create policy "DM can update session attendees"
  on public.session_attendees for update
  to authenticated
  using (
    exists (
      select 1 from public.sessions s
      where s.id = session_id
        and public.is_campaign_dm(s.campaign_id)
    )
  )
  with check (
    exists (
      select 1 from public.sessions s
      where s.id = session_id
        and public.is_campaign_dm(s.campaign_id)
    )
  );

-- DELETE: DM can remove attendees
create policy "DM can delete session attendees"
  on public.session_attendees for delete
  to authenticated
  using (
    exists (
      select 1 from public.sessions s
      where s.id = session_id
        and public.is_campaign_dm(s.campaign_id)
    )
  );

-- --------------------------------------------------------------------------
-- TIMELINE_EVENTS — visibility-based, no owner (private/secret = DM only)
-- --------------------------------------------------------------------------

-- SELECT: visibility controls who can see the event
create policy "Timeline events visible by campaign role and visibility"
  on public.timeline_events for select
  to authenticated
  using (
    public.is_campaign_member(campaign_id)
    and (
      visibility = 'public'
      or (visibility = 'private' and public.is_campaign_dm(campaign_id))
      or (visibility = 'secret'  and public.is_campaign_dm(campaign_id))
    )
  );

-- INSERT: DM can create timeline events
create policy "DM can create timeline events"
  on public.timeline_events for insert
  to authenticated
  with check (public.is_campaign_dm(campaign_id));

-- UPDATE: DM can edit timeline events
create policy "DM can update timeline events"
  on public.timeline_events for update
  to authenticated
  using  (public.is_campaign_dm(campaign_id))
  with check (public.is_campaign_dm(campaign_id));

-- DELETE: DM can delete timeline events
create policy "DM can delete timeline events"
  on public.timeline_events for delete
  to authenticated
  using (public.is_campaign_dm(campaign_id));

-- --------------------------------------------------------------------------
-- STORY_BEATS — visibility-based, no owner (private/secret = DM only)
-- --------------------------------------------------------------------------

-- SELECT: visibility controls who can see the story beat
create policy "Story beats visible by campaign role and visibility"
  on public.story_beats for select
  to authenticated
  using (
    public.is_campaign_member(campaign_id)
    and (
      visibility = 'public'
      or (visibility = 'private' and public.is_campaign_dm(campaign_id))
      or (visibility = 'secret'  and public.is_campaign_dm(campaign_id))
    )
  );

-- INSERT: DM can create story beats
create policy "DM can create story beats"
  on public.story_beats for insert
  to authenticated
  with check (public.is_campaign_dm(campaign_id));

-- UPDATE: DM can edit story beats
create policy "DM can update story beats"
  on public.story_beats for update
  to authenticated
  using  (public.is_campaign_dm(campaign_id))
  with check (public.is_campaign_dm(campaign_id));

-- DELETE: DM can delete story beats
create policy "DM can delete story beats"
  on public.story_beats for delete
  to authenticated
  using (public.is_campaign_dm(campaign_id));

-- --------------------------------------------------------------------------
-- NOTES — author + DM can see private, DM only sees secret,
--          shared notes (is_shared = true) visible to all members
-- --------------------------------------------------------------------------

-- SELECT: visibility + is_shared controls access
create policy "Notes visible by author, DM, visibility, and sharing"
  on public.notes for select
  to authenticated
  using (
    public.is_campaign_member(campaign_id)
    and (
      -- public notes: every member sees them
      visibility = 'public'
      -- shared notes: every member sees them regardless of visibility
      or is_shared = true
      -- private notes: author or DM
      or (visibility = 'private' and (
        author_id = auth.uid()
        or public.is_campaign_dm(campaign_id)
      ))
      -- secret notes: DM only
      or (visibility = 'secret' and public.is_campaign_dm(campaign_id))
    )
  );

-- INSERT: members can create notes in their campaign
create policy "Members can create notes"
  on public.notes for insert
  to authenticated
  with check (
    public.is_campaign_member(campaign_id)
    and (
      -- Players can only create notes they author
      author_id = auth.uid()
      -- DMs can create notes with any author
      or public.is_campaign_dm(campaign_id)
    )
  );

-- UPDATE: author or DM can edit
create policy "Author or DM can update notes"
  on public.notes for update
  to authenticated
  using (
    author_id = auth.uid()
    or public.is_campaign_dm(campaign_id)
  )
  with check (
    author_id = auth.uid()
    or public.is_campaign_dm(campaign_id)
  );

-- DELETE: author or DM can delete
create policy "Author or DM can delete notes"
  on public.notes for delete
  to authenticated
  using (
    author_id = auth.uid()
    or public.is_campaign_dm(campaign_id)
  );

-- ============================================================================
-- Done. Phase 2 schema is ready.
-- ============================================================================
