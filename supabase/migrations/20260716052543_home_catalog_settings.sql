-- Phase 2: home screen catalog layout/settings.
--
-- Keyed by (user_id, profile_id, platform): the client historically wrote
-- per-platform rows ("mobile", "tv") and now writes a single shared
-- "home_catalog_shared" platform, merging across rows client-side by picking
-- the newest (see HomeCatalogSettingsSyncService.fetchBestRemotePayload). The
-- server just stores/returns whatever platform rows exist — no merge logic
-- needed here.
--
-- Client contract (composeApp/src/commonMain/.../HomeCatalogSettingsSyncService.kt):
--   sync_pull_home_catalog_settings(p_profile_id, p_platform) -> rows { profile_id, settings_json, updated_at }
--   sync_push_home_catalog_settings(p_profile_id, p_platform, p_settings_json, p_origin_client_id) -> void

create table if not exists public.home_catalog_settings (
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id integer not null check (profile_id > 0),
  platform text not null,
  settings_json jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, profile_id, platform)
);

alter table public.home_catalog_settings enable row level security;

drop policy if exists "home_catalog_settings_select_own" on public.home_catalog_settings;
create policy "home_catalog_settings_select_own"
  on public.home_catalog_settings for select to authenticated
  using (user_id = auth.uid());

drop trigger if exists home_catalog_settings_set_updated_at on public.home_catalog_settings;
create trigger home_catalog_settings_set_updated_at
  before update on public.home_catalog_settings
  for each row execute function public.set_updated_at();

create or replace function public.sync_pull_home_catalog_settings(
  p_profile_id integer,
  p_platform text
)
returns setof public.home_catalog_settings
language sql
security definer
set search_path = public
stable
as $$
  select *
  from public.home_catalog_settings
  where user_id = auth.uid() and profile_id = p_profile_id and platform = p_platform;
$$;

create or replace function public.sync_push_home_catalog_settings(
  p_profile_id integer,
  p_platform text,
  p_settings_json jsonb,
  p_origin_client_id text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.home_catalog_settings (user_id, profile_id, platform, settings_json)
  values (auth.uid(), p_profile_id, p_platform, coalesce(p_settings_json, '{}'::jsonb))
  on conflict (user_id, profile_id, platform) do update set
    settings_json = excluded.settings_json,
    updated_at = now();

  perform public.log_sync_invalidation(p_profile_id, 'home_catalog_settings', p_origin_client_id);
end;
$$;

revoke all on function public.sync_pull_home_catalog_settings(integer, text) from public;
revoke all on function public.sync_push_home_catalog_settings(integer, text, jsonb, text) from public;

grant execute on function public.sync_pull_home_catalog_settings(integer, text) to authenticated;
grant execute on function public.sync_push_home_catalog_settings(integer, text, jsonb, text) to authenticated;
