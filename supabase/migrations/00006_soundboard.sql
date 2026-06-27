-- ============================================================================
-- TOME — Soundboard (Phase 2)
-- D&D Companion App · Supabase / PostgreSQL
-- ============================================================================
-- Depends on Phase 1-5: campaigns, sessions, profiles,
-- handle_updated_at(), is_campaign_member(), is_campaign_dm().
-- ============================================================================

-- ============================================================================
-- 1. SOUNDBOARD_TRACKS — catalog cache and future custom/uploaded tracks
-- ============================================================================

create table public.soundboard_tracks (
  id               uuid        primary key default gen_random_uuid(),
  source           text        not null,
  external_id      text        not null,
  title            text        not null,
  url              text        not null default '',
  track_type       text        not null default '',
  tags             text[]      not null default '{}',
  genres           text[]      not null default '{}',
  flavor           text        not null default '',
  image_url        text        not null default '',
  duration_seconds int,
  campaign_id      uuid        references public.campaigns (id) on delete cascade,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.soundboard_tracks is
  'Ambient music track catalog. Global tracks (campaign_id IS NULL) mirror the '
  'Tabletop Audio feed and are managed by the backend service role. '
  'Campaign-scoped tracks (campaign_id IS NOT NULL) are DM-uploaded custom tracks.';

comment on column public.soundboard_tracks.source is
  'Origin of the track: ''tabletop_audio'' for the public catalog, ''upload'' for DM uploads (Phase 4).';

comment on column public.soundboard_tracks.external_id is
  'ID within the source system (e.g. the Tabletop Audio numeric key).';

comment on column public.soundboard_tracks.campaign_id is
  'NULL for global catalog tracks; set to a campaign UUID for DM-uploaded tracks.';

-- Global tracks: unique on (source, external_id) when campaign_id IS NULL.
-- Campaign tracks: unique on (source, external_id, campaign_id) when campaign_id IS NOT NULL.
create unique index ux_soundboard_tracks_global
  on public.soundboard_tracks (source, external_id)
  where campaign_id is null;

create unique index ux_soundboard_tracks_campaign
  on public.soundboard_tracks (source, external_id, campaign_id)
  where campaign_id is not null;

create index idx_soundboard_tracks_campaign_id on public.soundboard_tracks (campaign_id);
create index idx_soundboard_tracks_source      on public.soundboard_tracks (source);

create trigger soundboard_tracks_updated_at
  before update on public.soundboard_tracks
  for each row execute function public.handle_updated_at();

-- ============================================================================
-- 2. SESSION_SOUNDBOARD_EVENTS — play telemetry and session retrospect log
-- ============================================================================

create table public.session_soundboard_events (
  id                  uuid        primary key default gen_random_uuid(),
  session_id          uuid        not null references public.sessions (id) on delete cascade,
  track_id            uuid        not null references public.soundboard_tracks (id) on delete cascade,
  started_at          timestamptz not null default now(),
  ended_at            timestamptz,
  started_by_user_id  uuid        not null references public.profiles (id) on delete cascade
);

comment on table public.session_soundboard_events is
  'Append-only log of soundboard track plays during sessions. '
  'Enables retrospective "what was playing when" lookups and is the anchor '
  'for future synchronized player playback (Phase 6).';

comment on column public.session_soundboard_events.ended_at is
  'NULL while the track is still playing; set when the DM stops or switches.';

create index idx_soundboard_events_session_id on public.session_soundboard_events (session_id);
create index idx_soundboard_events_track_id   on public.session_soundboard_events (track_id);

-- ============================================================================
-- 3. ROW-LEVEL SECURITY
-- ============================================================================

alter table public.soundboard_tracks         enable row level security;
alter table public.session_soundboard_events enable row level security;

-- --------------------------------------------------------------------------
-- SOUNDBOARD_TRACKS
-- --------------------------------------------------------------------------

-- Global tracks (campaign_id IS NULL) are readable by any authenticated user.
-- Campaign-scoped tracks are readable only by campaign members.
create policy "Soundboard tracks readable by members or globally"
  on public.soundboard_tracks for select
  to authenticated
  using (
    campaign_id is null
    or public.is_campaign_member(campaign_id)
  );

-- Service role (SUPABASE_SECRET_KEY) bypasses RLS and handles global catalog syncs.
-- Authenticated DMs may insert campaign-scoped tracks (Phase 4 uploads).
create policy "DMs can insert campaign-scoped tracks"
  on public.soundboard_tracks for insert
  to authenticated
  with check (
    campaign_id is not null
    and public.is_campaign_dm(campaign_id)
  );

create policy "DMs can update campaign-scoped tracks"
  on public.soundboard_tracks for update
  to authenticated
  using  (campaign_id is not null and public.is_campaign_dm(campaign_id))
  with check (campaign_id is not null and public.is_campaign_dm(campaign_id));

create policy "DMs can delete campaign-scoped tracks"
  on public.soundboard_tracks for delete
  to authenticated
  using (campaign_id is not null and public.is_campaign_dm(campaign_id));

-- --------------------------------------------------------------------------
-- SESSION_SOUNDBOARD_EVENTS
-- --------------------------------------------------------------------------

-- Campaign members can see what tracks were played in their sessions.
create policy "Campaign members can view soundboard events"
  on public.session_soundboard_events for select
  to authenticated
  using (
    exists (
      select 1
      from public.sessions s
      join public.campaign_members cm on cm.campaign_id = s.campaign_id
      where s.id = session_soundboard_events.session_id
        and cm.user_id = auth.uid()
    )
  );

-- Only the DM can record that a track started playing.
create policy "DMs can insert soundboard events"
  on public.session_soundboard_events for insert
  to authenticated
  with check (
    started_by_user_id = auth.uid()
    and exists (
      select 1
      from public.sessions s
      join public.campaign_members cm on cm.campaign_id = s.campaign_id
      where s.id = session_soundboard_events.session_id
        and cm.user_id = auth.uid()
        and cm.role = 'dm'
    )
  );

-- DM can close out an event by setting ended_at.
create policy "DMs can update soundboard events"
  on public.session_soundboard_events for update
  to authenticated
  using (
    exists (
      select 1
      from public.sessions s
      join public.campaign_members cm on cm.campaign_id = s.campaign_id
      where s.id = session_soundboard_events.session_id
        and cm.user_id = auth.uid()
        and cm.role = 'dm'
    )
  );

-- ============================================================================
-- Done. Soundboard tables are ready.
-- ============================================================================
