-- ============================================================================
-- TOME — Missions, Objectives, Stages & Submissions
-- D&D Companion App · Supabase / PostgreSQL
-- ============================================================================
-- Depends on Phase 1 & 2: campaigns, characters, sessions, locations,
-- handle_updated_at(), is_campaign_member(), is_campaign_dm().
-- ============================================================================

-- ============================================================================
-- 1. MISSIONS — top-level quest/mission container
-- ============================================================================

create table public.missions (
  id                      uuid        primary key default gen_random_uuid(),
  campaign_id             uuid        not null references public.campaigns (id) on delete cascade,
  title                   text        not null,
  description             text,
  type                    text        not null default 'side'
                                      check (type in ('main', 'side', 'personal', 'faction', 'bounty')),
  status                  text        not null default 'available'
                                      check (status in ('available', 'active', 'completed', 'failed', 'abandoned')),
  priority                text        not null default 'medium'
                                      check (priority in ('critical', 'high', 'medium', 'low')),
  quest_giver_id          uuid        references public.characters (id) on delete set null,
  parent_mission_id       uuid        references public.missions (id) on delete set null,
  session_received_id     uuid        references public.sessions (id) on delete set null,
  session_completed_id    uuid        references public.sessions (id) on delete set null,
  reward_description      text,
  reward_xp               integer,
  reward_gold             numeric,
  visibility              text        not null default 'public'
                                      check (visibility in ('public', 'private', 'secret')),
  notes                   text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

comment on table public.missions is
  'Top-level quest/mission container. Supports sub-missions via parent_mission_id.';
comment on column public.missions.parent_mission_id is
  'Self-referential FK for sub-missions. NULL = top-level mission.';
comment on column public.missions.visibility is
  'public = all campaign members, private = DM only, secret = DM only.';

create index idx_missions_campaign_id     on public.missions (campaign_id);

create trigger missions_updated_at
  before update on public.missions
  for each row execute function public.handle_updated_at();

-- ============================================================================
-- 2. MISSION_STAGES — ordered phases within a mission
--    e.g. "Stage 1: Gather intel", "Stage 2: Infiltrate the keep"
-- ============================================================================

create table public.mission_stages (
  id            uuid        primary key default gen_random_uuid(),
  mission_id    uuid        not null references public.missions (id) on delete cascade,
  title         text        not null,
  description   text,
  sort_order    integer     not null,
  status        text        not null default 'locked'
                            check (status in ('locked', 'active', 'completed', 'failed', 'skipped')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.mission_stages is
  'Ordered phases within a mission. Completion % is derived from stage/objective status.';
comment on column public.mission_stages.sort_order is
  'Determines display order. Stages progress sequentially or in parallel.';
comment on column public.mission_stages.status is
  'locked = not yet available, active = in progress, completed/failed/skipped = terminal.';

create index idx_mission_stages_mission_id on public.mission_stages (mission_id);

create trigger mission_stages_updated_at
  before update on public.mission_stages
  for each row execute function public.handle_updated_at();

-- ============================================================================
-- 3. MISSION_OBJECTIVES — checklist items within a stage
--    e.g. "Find the informant", "Steal the key", "Escape undetected"
-- ============================================================================

create table public.mission_objectives (
  id            uuid        primary key default gen_random_uuid(),
  stage_id      uuid        not null references public.mission_stages (id) on delete cascade,
  description   text        not null,
  is_completed  boolean     not null default false,
  is_optional   boolean     not null default false,
  sort_order    integer     not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.mission_objectives is
  'Checklist items within a mission stage. Optional objectives do not block stage completion.';

create index idx_mission_objectives_stage_id on public.mission_objectives (stage_id);

create trigger mission_objectives_updated_at
  before update on public.mission_objectives
  for each row execute function public.handle_updated_at();

-- ============================================================================
-- 4. MISSION_SUBMISSIONS — player/DM submissions added over time
--    e.g. evidence found, reports filed, items delivered, notes appended
-- ============================================================================

create table public.mission_submissions (
  id            uuid        primary key default gen_random_uuid(),
  mission_id    uuid        not null references public.missions (id) on delete cascade,
  stage_id      uuid        references public.mission_stages (id) on delete set null,
  author_id     uuid        not null references public.profiles (id) on delete cascade,
  type          text        not null default 'note'
                            check (type in ('note', 'evidence', 'report', 'delivery', 'update')),
  title         text,
  content       text        not null,
  session_id    uuid        references public.sessions (id) on delete set null,
  visibility    text        not null default 'public'
                            check (visibility in ('public', 'private', 'secret')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.mission_submissions is
  'Time-stamped entries attached to a mission — evidence, reports, notes, deliveries.';
comment on column public.mission_submissions.stage_id is
  'Optional link to a specific stage. NULL = submission applies to the mission overall.';

create index idx_mission_submissions_mission_id on public.mission_submissions (mission_id);
create index idx_mission_submissions_stage_id   on public.mission_submissions (stage_id);

create trigger mission_submissions_updated_at
  before update on public.mission_submissions
  for each row execute function public.handle_updated_at();

-- ============================================================================
-- 5. COMPLETION % VIEW
--    Calculates completion percentage per mission from objectives.
--    Usage: SELECT * FROM public.mission_progress WHERE mission_id = '...';
-- ============================================================================

create or replace view public.mission_progress as
select
  m.id                as mission_id,
  m.campaign_id,
  m.title             as mission_title,
  m.status            as mission_status,
  count(o.id)         as total_objectives,
  count(o.id) filter (where o.is_completed)                          as completed_objectives,
  count(o.id) filter (where not o.is_optional)                       as required_objectives,
  count(o.id) filter (where o.is_completed and not o.is_optional)    as completed_required,
  case
    when count(o.id) filter (where not o.is_optional) = 0 then 100
    else round(
      100.0
      * count(o.id) filter (where o.is_completed and not o.is_optional)
      / count(o.id) filter (where not o.is_optional)
    )
  end                 as completion_pct
from public.missions m
left join public.mission_stages ms on ms.mission_id = m.id
left join public.mission_objectives o on o.stage_id = ms.id
group by m.id, m.campaign_id, m.title, m.status;

comment on view public.mission_progress is
  'Read-only view showing completion % per mission based on required objectives.';

-- ============================================================================
-- 6. ROW-LEVEL SECURITY
-- ============================================================================

alter table public.missions             enable row level security;
alter table public.mission_stages       enable row level security;
alter table public.mission_objectives   enable row level security;
alter table public.mission_submissions  enable row level security;

-- --------------------------------------------------------------------------
-- MISSIONS — visibility-based (private/secret = DM only)
-- --------------------------------------------------------------------------

create policy "Missions visible by campaign role and visibility"
  on public.missions for select
  to authenticated
  using (
    public.is_campaign_member(campaign_id)
    and (
      visibility = 'public'
      or (visibility = 'private' and public.is_campaign_dm(campaign_id))
      or (visibility = 'secret'  and public.is_campaign_dm(campaign_id))
    )
  );

create policy "DM can create missions"
  on public.missions for insert
  to authenticated
  with check (public.is_campaign_dm(campaign_id));

create policy "DM can update missions"
  on public.missions for update
  to authenticated
  using  (public.is_campaign_dm(campaign_id))
  with check (public.is_campaign_dm(campaign_id));

create policy "DM can delete missions"
  on public.missions for delete
  to authenticated
  using (public.is_campaign_dm(campaign_id));

-- --------------------------------------------------------------------------
-- MISSION_STAGES — access mirrors parent mission
-- --------------------------------------------------------------------------

create policy "Stages visible if mission is visible"
  on public.mission_stages for select
  to authenticated
  using (
    exists (
      select 1 from public.missions m
      where m.id = mission_id
        and public.is_campaign_member(m.campaign_id)
        and (
          m.visibility = 'public'
          or (m.visibility = 'private' and public.is_campaign_dm(m.campaign_id))
          or (m.visibility = 'secret'  and public.is_campaign_dm(m.campaign_id))
        )
    )
  );

create policy "DM can create stages"
  on public.mission_stages for insert
  to authenticated
  with check (
    exists (
      select 1 from public.missions m
      where m.id = mission_id
        and public.is_campaign_dm(m.campaign_id)
    )
  );

create policy "DM can update stages"
  on public.mission_stages for update
  to authenticated
  using (
    exists (
      select 1 from public.missions m
      where m.id = mission_id
        and public.is_campaign_dm(m.campaign_id)
    )
  )
  with check (
    exists (
      select 1 from public.missions m
      where m.id = mission_id
        and public.is_campaign_dm(m.campaign_id)
    )
  );

create policy "DM can delete stages"
  on public.mission_stages for delete
  to authenticated
  using (
    exists (
      select 1 from public.missions m
      where m.id = mission_id
        and public.is_campaign_dm(m.campaign_id)
    )
  );

-- --------------------------------------------------------------------------
-- MISSION_OBJECTIVES — access mirrors parent stage → parent mission
-- --------------------------------------------------------------------------

create policy "Objectives visible if parent stage is visible"
  on public.mission_objectives for select
  to authenticated
  using (
    exists (
      select 1 from public.mission_stages ms
      join public.missions m on m.id = ms.mission_id
      where ms.id = stage_id
        and public.is_campaign_member(m.campaign_id)
        and (
          m.visibility = 'public'
          or (m.visibility = 'private' and public.is_campaign_dm(m.campaign_id))
          or (m.visibility = 'secret'  and public.is_campaign_dm(m.campaign_id))
        )
    )
  );

create policy "DM can create objectives"
  on public.mission_objectives for insert
  to authenticated
  with check (
    exists (
      select 1 from public.mission_stages ms
      join public.missions m on m.id = ms.mission_id
      where ms.id = stage_id
        and public.is_campaign_dm(m.campaign_id)
    )
  );

create policy "DM can update objectives"
  on public.mission_objectives for update
  to authenticated
  using (
    exists (
      select 1 from public.mission_stages ms
      join public.missions m on m.id = ms.mission_id
      where ms.id = stage_id
        and public.is_campaign_dm(m.campaign_id)
    )
  )
  with check (
    exists (
      select 1 from public.mission_stages ms
      join public.missions m on m.id = ms.mission_id
      where ms.id = stage_id
        and public.is_campaign_dm(m.campaign_id)
    )
  );

create policy "DM can delete objectives"
  on public.mission_objectives for delete
  to authenticated
  using (
    exists (
      select 1 from public.mission_stages ms
      join public.missions m on m.id = ms.mission_id
      where ms.id = stage_id
        and public.is_campaign_dm(m.campaign_id)
    )
  );

-- --------------------------------------------------------------------------
-- MISSION_SUBMISSIONS — visibility-based, author-aware
-- --------------------------------------------------------------------------

create policy "Submissions visible by mission visibility and own visibility"
  on public.mission_submissions for select
  to authenticated
  using (
    exists (
      select 1 from public.missions m
      where m.id = mission_id
        and public.is_campaign_member(m.campaign_id)
        and (
          m.visibility = 'public'
          or public.is_campaign_dm(m.campaign_id)
        )
    )
    and (
      visibility = 'public'
      or (visibility = 'private' and (
        author_id = auth.uid()
        or exists (
          select 1 from public.missions m
          where m.id = mission_id
            and public.is_campaign_dm(m.campaign_id)
        )
      ))
      or (visibility = 'secret' and exists (
        select 1 from public.missions m
        where m.id = mission_id
          and public.is_campaign_dm(m.campaign_id)
      ))
    )
  );

-- Members can submit to visible missions
create policy "Members can create submissions"
  on public.mission_submissions for insert
  to authenticated
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from public.missions m
      where m.id = mission_id
        and public.is_campaign_member(m.campaign_id)
    )
  );

-- Author or DM can update
create policy "Author or DM can update submissions"
  on public.mission_submissions for update
  to authenticated
  using (
    author_id = auth.uid()
    or exists (
      select 1 from public.missions m
      where m.id = mission_id
        and public.is_campaign_dm(m.campaign_id)
    )
  )
  with check (
    author_id = auth.uid()
    or exists (
      select 1 from public.missions m
      where m.id = mission_id
        and public.is_campaign_dm(m.campaign_id)
    )
  );

-- Author or DM can delete
create policy "Author or DM can delete submissions"
  on public.mission_submissions for delete
  to authenticated
  using (
    author_id = auth.uid()
    or exists (
      select 1 from public.missions m
      where m.id = mission_id
        and public.is_campaign_dm(m.campaign_id)
    )
  );

-- ============================================================================
-- Done. Missions schema is ready.
-- ============================================================================
