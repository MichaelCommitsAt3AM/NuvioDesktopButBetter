-- Membership access, membership overview, and supporter cosmetic catalogs.
--
-- Added when syncing upstream 0.1.21, which introduced client code calling four
-- RPCs that had no definition in this fork's schema. Without them every call
-- fails with PGRST202 and the supporter features silently fall back to cached
-- (empty) state.
--
-- Client contracts:
--   get_my_member_access()
--     -> setof (tier text, entitlements text[])
--     composeApp/src/commonMain/.../membership/MemberAccessRemoteDataSource.kt
--   get_my_membership_overview()
--     -> setof (wide row, see below)
--     composeApp/src/commonMain/.../membership/MembershipOverviewRemoteDataSource.kt
--   get_member_profile_avatar_catalog()
--     -> setof (id, display_name, storage_path, category, sort_order, bg_color, asset_version)
--     composeApp/src/commonMain/.../profiles/AvatarRepository.kt
--   get_member_profile_background_catalog()
--     -> setof (id, display_name, storage_path, portrait_storage_path, asset_version)
--     composeApp/src/commonMain/.../membership/ProfileBackgroundRepository.kt
--
-- All four return zero rows for a non-member; the client treats an empty result
-- as "no access" / "empty catalog", so that is the correct unprivileged answer.
--
-- This fork has no billing-provider integration. Membership is granted directly
-- in public.member_grants (service-role/dashboard only), so the subscription
-- half of the overview always reports "no subscription" and the grant half
-- carries the real state.

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

create table if not exists public.member_grants (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tier text not null default 'SUPPORTER' check (tier in ('SUPPORTER', 'SUPPORTER_PLUS')),
  is_lifetime boolean not null default false,
  expires_at timestamptz,
  kind text not null default 'manual',
  source text not null default 'fork',
  granted_at timestamptz not null default now()
);

comment on table public.member_grants is
  'Manually issued supporter grants. Rows are managed with the service role; clients only read their own via the RPCs below.';

alter table public.member_grants enable row level security;

drop policy if exists "member_grants_select_own" on public.member_grants;
create policy "member_grants_select_own"
  on public.member_grants for select to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Cosmetic catalogs
-- ---------------------------------------------------------------------------

create table if not exists public.member_profile_avatars (
  id text primary key,
  display_name text not null,
  storage_path text not null,
  category text not null default 'general',
  sort_order integer not null default 0,
  bg_color text,
  asset_version integer not null default 1,
  is_active boolean not null default true
);

comment on table public.member_profile_avatars is
  'Supporter-only avatar catalog. storage_path points into the "membership-profile-avatars" storage bucket.';

create table if not exists public.member_profile_backgrounds (
  id text primary key,
  display_name text not null,
  storage_path text not null,
  portrait_storage_path text,
  asset_version integer not null default 1,
  sort_order integer not null default 0,
  is_active boolean not null default true
);

comment on table public.member_profile_backgrounds is
  'Supporter-only profile background catalog. storage_path points into the "membership-profile-backgrounds" storage bucket.';

alter table public.member_profile_avatars enable row level security;
alter table public.member_profile_backgrounds enable row level security;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Resolves the caller's effective tier, or null when they have no live grant.
create or replace function public.current_member_tier()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select g.tier
  from public.member_grants g
  where g.user_id = auth.uid()
    and (g.is_lifetime or g.expires_at is null or g.expires_at > now())
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

create or replace function public.get_my_member_access()
returns table (
  tier text,
  entitlements text[]
)
language sql
stable
security definer
set search_path = public
as $$
  select
    t.tier,
    case
      when t.tier = 'SUPPORTER_PLUS' then array[
        'GOLD_THEME',
        'JADE_THEME',
        'ROSE_GOLD_THEME',
        'ARCTIC_BLUE_THEME',
        'GRAPHITE_THEME',
        'PROFILE_BACKGROUNDS',
        'PROFILE_AVATARS'
      ]
      else array[
        'PROFILE_BACKGROUNDS',
        'PROFILE_AVATARS'
      ]
    end as entitlements
  from (select public.current_member_tier() as tier) t
  where t.tier is not null;
$$;

create or replace function public.get_my_membership_overview()
returns table (
  status text,
  tier text,
  verified_at timestamptz,
  supporter_since timestamptz,
  provider_connected boolean,
  has_subscription boolean,
  subscription_access_active boolean,
  subscription_status text,
  provider text,
  membership_level text,
  current_period_end timestamptz,
  cancels_at_period_end boolean,
  monthly_amount_cents integer,
  currency_code text,
  has_active_grant boolean,
  grant_is_lifetime boolean,
  grant_expires_at timestamptz,
  grant_kind text,
  grant_tier text,
  grant_source text,
  has_lifetime_grant boolean,
  lifetime_grant_tier text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    case when g.user_id is null then 'inactive' else 'active' end as status,
    g.tier,
    g.granted_at as verified_at,
    g.granted_at as supporter_since,
    false as provider_connected,
    -- No billing provider on this fork; membership comes from grants only.
    false as has_subscription,
    false as subscription_access_active,
    null::text as subscription_status,
    null::text as provider,
    g.tier as membership_level,
    null::timestamptz as current_period_end,
    false as cancels_at_period_end,
    null::integer as monthly_amount_cents,
    null::text as currency_code,
    true as has_active_grant,
    g.is_lifetime as grant_is_lifetime,
    g.expires_at as grant_expires_at,
    g.kind as grant_kind,
    g.tier as grant_tier,
    g.source as grant_source,
    g.is_lifetime as has_lifetime_grant,
    case when g.is_lifetime then g.tier else null end as lifetime_grant_tier
  from public.member_grants g
  where g.user_id = auth.uid()
    and (g.is_lifetime or g.expires_at is null or g.expires_at > now());
$$;

create or replace function public.get_member_profile_avatar_catalog()
returns table (
  id text,
  display_name text,
  storage_path text,
  category text,
  sort_order integer,
  bg_color text,
  asset_version integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    a.id,
    a.display_name,
    a.storage_path,
    a.category,
    a.sort_order,
    a.bg_color,
    a.asset_version
  from public.member_profile_avatars a
  where a.is_active
    and public.current_member_tier() is not null
  order by a.category, a.sort_order, a.id;
$$;

create or replace function public.get_member_profile_background_catalog()
returns table (
  id text,
  display_name text,
  storage_path text,
  portrait_storage_path text,
  asset_version integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    b.id,
    b.display_name,
    b.storage_path,
    b.portrait_storage_path,
    b.asset_version
  from public.member_profile_backgrounds b
  where b.is_active
    and public.current_member_tier() is not null
  order by b.sort_order, b.id;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke all on table public.member_grants from anon, authenticated;
revoke all on table public.member_profile_avatars from anon, authenticated;
revoke all on table public.member_profile_backgrounds from anon, authenticated;

grant select on table public.member_grants to authenticated;

revoke all on function public.current_member_tier() from public;
revoke all on function public.get_my_member_access() from public;
revoke all on function public.get_my_membership_overview() from public;
revoke all on function public.get_member_profile_avatar_catalog() from public;
revoke all on function public.get_member_profile_background_catalog() from public;

grant execute on function public.get_my_member_access() to authenticated;
grant execute on function public.get_my_membership_overview() to authenticated;
grant execute on function public.get_member_profile_avatar_catalog() to authenticated;
grant execute on function public.get_member_profile_background_catalog() to authenticated;
