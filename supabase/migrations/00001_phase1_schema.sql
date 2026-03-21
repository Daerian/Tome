-- ============================================================================
-- TOME — Phase 1 Database Schema
-- D&D Companion App · Supabase / PostgreSQL
-- ============================================================================

-- ============================================================================
-- 0. HOUSEKEEPING
-- ============================================================================

-- Ensure the pgcrypto extension is available (gen_random_uuid)
create extension if not exists "pgcrypto";

-- ============================================================================
-- 1. HELPER: auto-update updated_at on every row modification
-- ============================================================================

create or replace function public.handle_updated_at()
returns trigger
language plpgsql
security definer
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================================
-- 2. PROFILES — extends auth.users
-- ============================================================================

create table public.profiles (
  id          uuid        primary key references auth.users (id) on delete cascade,
  username    text        unique,
  display_name text,
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.profiles is
  'Public profile data that extends the built-in auth.users table.';

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.handle_updated_at();

-- Auto-create a profile row when a new user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id)
  values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- 3. CAMPAIGNS — top-level container
-- ============================================================================

create table public.campaigns (
  id          uuid        primary key default gen_random_uuid(),
  owner_id    uuid        not null references public.profiles (id) on delete cascade,
  name        text        not null,
  description text,
  system      text        not null default '5e',   -- e.g. '5e', '3.5e', 'pf2e'
  image_url   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.campaigns is
  'A campaign is the top-level container that groups all game content.';

create trigger campaigns_updated_at
  before update on public.campaigns
  for each row execute function public.handle_updated_at();

-- ============================================================================
-- 4. CAMPAIGN_MEMBERS — multi-user access
-- ============================================================================

create table public.campaign_members (
  id          uuid        primary key default gen_random_uuid(),
  campaign_id uuid        not null references public.campaigns (id) on delete cascade,
  user_id     uuid        not null references public.profiles (id) on delete cascade,
  role        text        not null default 'player'
                          check (role in ('dm', 'player', 'spectator')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  unique (campaign_id, user_id)
);

comment on table public.campaign_members is
  'Junction table linking users to campaigns with a role (dm, player, spectator).';

create index idx_campaign_members_campaign_id on public.campaign_members (campaign_id);
create index idx_campaign_members_user_id     on public.campaign_members (user_id);

create trigger campaign_members_updated_at
  before update on public.campaign_members
  for each row execute function public.handle_updated_at();

-- ============================================================================
-- 5. CHARACTERS — unified PCs, NPCs, companions, deities
-- ============================================================================

create table public.characters (
  id            uuid        primary key default gen_random_uuid(),
  campaign_id   uuid        not null references public.campaigns (id) on delete cascade,
  owner_id      uuid        references public.profiles (id) on delete set null,
  type          text        not null default 'npc'
                            check (type in ('pc', 'npc', 'companion', 'deity')),
  name          text        not null,
  race          text,
  class         text,
  level         integer,
  alignment     text,
  status        text        not null default 'alive'
                            check (status in ('alive', 'dead', 'missing', 'retired')),
  description   text,
  backstory     text,
  notes         text,
  visibility    text        not null default 'public'
                            check (visibility in ('public', 'private', 'secret')),
  stats         jsonb       not null default '{}'::jsonb,
  portrait_url  text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.characters is
  'Unified character table for PCs, NPCs, companions, and deities.';
comment on column public.characters.owner_id is
  'The player who owns this character. NULL for DM-controlled NPCs / deities.';
comment on column public.characters.visibility is
  'public = all campaign members, private = DM + owner, secret = DM only.';
comment on column public.characters.stats is
  'Flexible JSONB blob for ability scores, HP, AC, etc. Schema varies by system.';

create index idx_characters_campaign_id on public.characters (campaign_id);
create index idx_characters_owner_id    on public.characters (owner_id);

create trigger characters_updated_at
  before update on public.characters
  for each row execute function public.handle_updated_at();

-- ============================================================================
-- 6. CONVERSATIONS — AI chat sessions
-- ============================================================================

create table public.conversations (
  id                uuid        primary key default gen_random_uuid(),
  campaign_id       uuid        not null references public.campaigns (id) on delete cascade,
  user_id           uuid        not null references public.profiles (id) on delete cascade,
  title             text,
  context_type      text,         -- e.g. 'character', 'campaign', 'session'
  context_entity_id uuid,         -- FK-less pointer to the related entity
  is_pinned         boolean       not null default false,
  created_at        timestamptz   not null default now(),
  updated_at        timestamptz   not null default now()
);

comment on table public.conversations is
  'An AI chat session scoped to a campaign and user.';
comment on column public.conversations.context_type is
  'The type of entity this conversation is about (e.g. character, campaign).';
comment on column public.conversations.context_entity_id is
  'Polymorphic FK — the UUID of the entity indicated by context_type.';

create index idx_conversations_campaign_id on public.conversations (campaign_id);
create index idx_conversations_user_id     on public.conversations (user_id);

create trigger conversations_updated_at
  before update on public.conversations
  for each row execute function public.handle_updated_at();

-- ============================================================================
-- 7. MESSAGES — chat history
-- ============================================================================

create table public.messages (
  id              uuid        primary key default gen_random_uuid(),
  conversation_id uuid        not null references public.conversations (id) on delete cascade,
  role            text        not null
                              check (role in ('user', 'assistant', 'system')),
  content         text        not null,
  token_count     integer,
  metadata        jsonb       not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.messages is
  'Individual messages inside a conversation, ordered by created_at.';

create index idx_messages_conversation_id on public.messages (conversation_id);

create trigger messages_updated_at
  before update on public.messages
  for each row execute function public.handle_updated_at();

-- ============================================================================
-- 8. ROW-LEVEL SECURITY
-- ============================================================================

-- Turn RLS on for every table
alter table public.profiles         enable row level security;
alter table public.campaigns        enable row level security;
alter table public.campaign_members enable row level security;
alter table public.characters       enable row level security;
alter table public.conversations    enable row level security;
alter table public.messages         enable row level security;

-- --------------------------------------------------------------------------
-- Helper: is the current user a member of this campaign?
-- --------------------------------------------------------------------------
create or replace function public.is_campaign_member(p_campaign_id uuid)
returns boolean
language sql
stable
security definer
as $$
  select exists (
    select 1 from public.campaign_members
    where campaign_id = p_campaign_id
      and user_id = auth.uid()
  );
$$;

-- --------------------------------------------------------------------------
-- Helper: is the current user the DM of this campaign?
-- --------------------------------------------------------------------------
create or replace function public.is_campaign_dm(p_campaign_id uuid)
returns boolean
language sql
stable
security definer
as $$
  select exists (
    select 1 from public.campaign_members
    where campaign_id = p_campaign_id
      and user_id = auth.uid()
      and role = 'dm'
  );
$$;

-- --------------------------------------------------------------------------
-- PROFILES
-- --------------------------------------------------------------------------

-- Anyone authenticated can read any profile (needed for display names, etc.)
create policy "Profiles are viewable by authenticated users"
  on public.profiles for select
  to authenticated
  using (true);

-- Users can only update their own profile
create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Insert is handled by the trigger, but allow users to insert their own row
-- in case the trigger hasn't fired yet (edge case)
create policy "Users can insert their own profile"
  on public.profiles for insert
  to authenticated
  with check (id = auth.uid());

-- --------------------------------------------------------------------------
-- CAMPAIGNS
-- --------------------------------------------------------------------------

-- Any campaign member can read the campaign
create policy "Campaign members can read campaigns"
  on public.campaigns for select
  to authenticated
  using (public.is_campaign_member(id));

-- Any authenticated user can create a campaign
create policy "Authenticated users can create campaigns"
  on public.campaigns for insert
  to authenticated
  with check (owner_id = auth.uid());

-- Only the campaign owner can update
create policy "Campaign owner can update"
  on public.campaigns for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- Only the campaign owner can delete
create policy "Campaign owner can delete"
  on public.campaigns for delete
  to authenticated
  using (owner_id = auth.uid());

-- --------------------------------------------------------------------------
-- CAMPAIGN_MEMBERS
-- --------------------------------------------------------------------------

-- Members can see who else is in their campaign
create policy "Members can view campaign members"
  on public.campaign_members for select
  to authenticated
  using (public.is_campaign_member(campaign_id));

-- Campaign owner (or DM) can add members
create policy "DM can insert campaign members"
  on public.campaign_members for insert
  to authenticated
  with check (public.is_campaign_dm(campaign_id));

-- DM can update member roles
create policy "DM can update campaign members"
  on public.campaign_members for update
  to authenticated
  using (public.is_campaign_dm(campaign_id))
  with check (public.is_campaign_dm(campaign_id));

-- DM can remove members; members can remove themselves
create policy "DM or self can delete campaign members"
  on public.campaign_members for delete
  to authenticated
  using (
    public.is_campaign_dm(campaign_id)
    or user_id = auth.uid()
  );

-- --------------------------------------------------------------------------
-- CHARACTERS — visibility-based access
-- --------------------------------------------------------------------------

-- SELECT: visibility controls who can see the character
--   public  → any campaign member
--   private → DM + owner
--   secret  → DM only
create policy "Characters visible by campaign role and visibility"
  on public.characters for select
  to authenticated
  using (
    public.is_campaign_member(campaign_id)
    and (
      -- public characters: every member sees them
      visibility = 'public'
      -- private characters: owner or DM
      or (visibility = 'private' and (
        owner_id = auth.uid()
        or public.is_campaign_dm(campaign_id)
      ))
      -- secret characters: DM only
      or (visibility = 'secret' and public.is_campaign_dm(campaign_id))
    )
  );

-- INSERT: members can create characters in their campaign
create policy "Members can create characters"
  on public.characters for insert
  to authenticated
  with check (
    public.is_campaign_member(campaign_id)
    and (
      -- Players can only create characters they own
      owner_id = auth.uid()
      -- DMs can create characters with any (or null) owner
      or public.is_campaign_dm(campaign_id)
    )
  );

-- UPDATE: owner or DM can edit
create policy "Owner or DM can update characters"
  on public.characters for update
  to authenticated
  using (
    owner_id = auth.uid()
    or public.is_campaign_dm(campaign_id)
  )
  with check (
    owner_id = auth.uid()
    or public.is_campaign_dm(campaign_id)
  );

-- DELETE: owner or DM can delete
create policy "Owner or DM can delete characters"
  on public.characters for delete
  to authenticated
  using (
    owner_id = auth.uid()
    or public.is_campaign_dm(campaign_id)
  );

-- --------------------------------------------------------------------------
-- CONVERSATIONS
-- --------------------------------------------------------------------------

-- Users see their own conversations; DM sees all in the campaign
create policy "Users see own conversations, DM sees all"
  on public.conversations for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.is_campaign_dm(campaign_id)
  );

-- Users can create conversations in campaigns they belong to
create policy "Members can create conversations"
  on public.conversations for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and public.is_campaign_member(campaign_id)
  );

-- Users can update their own conversations
create policy "Users can update own conversations"
  on public.conversations for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Users can delete their own conversations
create policy "Users can delete own conversations"
  on public.conversations for delete
  to authenticated
  using (user_id = auth.uid());

-- --------------------------------------------------------------------------
-- MESSAGES — access mirrors the parent conversation
-- --------------------------------------------------------------------------

-- If you can see the conversation, you can read its messages
create policy "Messages visible if conversation is visible"
  on public.messages for select
  to authenticated
  using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and (
          c.user_id = auth.uid()
          or public.is_campaign_dm(c.campaign_id)
        )
    )
  );

-- If you own the conversation, you can insert messages
create policy "Conversation owner can insert messages"
  on public.messages for insert
  to authenticated
  with check (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and c.user_id = auth.uid()
    )
  );

-- Users can update their own messages (e.g. edit content)
create policy "Conversation owner can update messages"
  on public.messages for update
  to authenticated
  using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and c.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and c.user_id = auth.uid()
    )
  );

-- Users can delete messages in their own conversations
create policy "Conversation owner can delete messages"
  on public.messages for delete
  to authenticated
  using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and c.user_id = auth.uid()
    )
  );

-- ============================================================================
-- Done. Phase 1 schema is ready.
-- ============================================================================
