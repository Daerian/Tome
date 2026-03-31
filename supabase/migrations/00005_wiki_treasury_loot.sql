-- ============================================================================
-- TOME — Treasury Items & Session Loot
-- D&D Companion App · Supabase / PostgreSQL
-- ============================================================================
-- Depends on Phase 1-3: campaigns, characters, sessions, profiles,
-- handle_updated_at(), is_campaign_member(), is_campaign_dm().
-- ============================================================================

-- ============================================================================
-- 1. TREASURY_ITEMS — campaign-wide important magic items
-- ============================================================================

create table public.treasury_items (
  id              uuid        primary key default gen_random_uuid(),
  campaign_id     uuid        not null references public.campaigns (id) on delete cascade,
  name            text        not null,
  description     text,
  rarity          text        not null default 'common'
                              check (rarity in ('common', 'uncommon', 'rare', 'very_rare', 'legendary', 'artifact')),
  item_type       text        not null default 'wondrous'
                              check (item_type in (
                                'weapon', 'armor', 'shield', 'ring', 'rod', 'staff',
                                'wand', 'potion', 'scroll', 'wondrous', 'other'
                              )),
  requires_attunement boolean not null default false,
  attuned_to_id   uuid        references public.characters (id) on delete set null,
  held_by_id      uuid        references public.characters (id) on delete set null,
  properties      text,
  source_session_id uuid      references public.sessions (id) on delete set null,
  is_cursed       boolean     not null default false,
  notes           text,
  added_by        uuid        not null references public.profiles (id) on delete cascade,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.treasury_items is
  'Campaign-wide inventory of important magic items tracked by DM and players.';
comment on column public.treasury_items.attuned_to_id is
  'Character currently attuned to this item. NULL if not attuned.';
comment on column public.treasury_items.held_by_id is
  'Character currently holding/carrying this item.';

create index idx_treasury_items_campaign_id on public.treasury_items (campaign_id);

create trigger treasury_items_updated_at
  before update on public.treasury_items
  for each row execute function public.handle_updated_at();

-- ============================================================================
-- 2. SESSION_LOOT — per-session loot log entries
-- ============================================================================

create table public.session_loot (
  id              uuid        primary key default gen_random_uuid(),
  campaign_id     uuid        not null references public.campaigns (id) on delete cascade,
  session_id      uuid        not null references public.sessions (id) on delete cascade,
  name            text        not null,
  quantity        integer     not null default 1,
  category        text        not null default 'item'
                              check (category in ('gold', 'item', 'gem', 'art', 'magic_item', 'other')),
  value_gp        numeric,
  description     text,
  logged_by       uuid        not null references public.profiles (id) on delete cascade,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.session_loot is
  'Per-session loot log. Players and DMs can record loot picked up during each session.';

create index idx_session_loot_campaign_id on public.session_loot (campaign_id);
create index idx_session_loot_session_id  on public.session_loot (session_id);

create trigger session_loot_updated_at
  before update on public.session_loot
  for each row execute function public.handle_updated_at();

-- ============================================================================
-- 3. ROW-LEVEL SECURITY
-- ============================================================================

alter table public.treasury_items enable row level security;
alter table public.session_loot   enable row level security;

-- --------------------------------------------------------------------------
-- TREASURY_ITEMS — all campaign members can view and add
-- --------------------------------------------------------------------------

create policy "Treasury items visible to campaign members"
  on public.treasury_items for select
  to authenticated
  using (public.is_campaign_member(campaign_id));

create policy "Campaign members can add treasury items"
  on public.treasury_items for insert
  to authenticated
  with check (
    added_by = auth.uid()
    and public.is_campaign_member(campaign_id)
  );

create policy "DM or author can update treasury items"
  on public.treasury_items for update
  to authenticated
  using (
    added_by = auth.uid()
    or public.is_campaign_dm(campaign_id)
  )
  with check (
    added_by = auth.uid()
    or public.is_campaign_dm(campaign_id)
  );

create policy "DM or author can delete treasury items"
  on public.treasury_items for delete
  to authenticated
  using (
    added_by = auth.uid()
    or public.is_campaign_dm(campaign_id)
  );

-- --------------------------------------------------------------------------
-- SESSION_LOOT — all campaign members can view and add
-- --------------------------------------------------------------------------

create policy "Session loot visible to campaign members"
  on public.session_loot for select
  to authenticated
  using (public.is_campaign_member(campaign_id));

create policy "Campaign members can log session loot"
  on public.session_loot for insert
  to authenticated
  with check (
    logged_by = auth.uid()
    and public.is_campaign_member(campaign_id)
  );

create policy "DM or author can update session loot"
  on public.session_loot for update
  to authenticated
  using (
    logged_by = auth.uid()
    or public.is_campaign_dm(campaign_id)
  )
  with check (
    logged_by = auth.uid()
    or public.is_campaign_dm(campaign_id)
  );

create policy "DM or author can delete session loot"
  on public.session_loot for delete
  to authenticated
  using (
    logged_by = auth.uid()
    or public.is_campaign_dm(campaign_id)
  );

-- ============================================================================
-- Done. Treasury and session loot tables are ready.
-- ============================================================================
