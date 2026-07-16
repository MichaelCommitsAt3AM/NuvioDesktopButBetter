-- Phase 2: per-profile app settings blob (theme, player, stream badges, debrid,
-- tmdb, mdblist, meta screen, continue-watching prefs, trakt settings, etc.) —
-- one opaque JSON blob per (profile, platform), same pattern as home catalog
-- settings. The server never needs to understand the JSON's internal shape.
--
-- Client contract (composeApp/src/commonMain/.../core/sync/ProfileSettingsSync.kt):
--   sync_pull_profile_settings_blob(p_profile_id, p_platform) -> rows { profile_id, settings_json, updated_at }
--   sync_push_profile_settings_blob(p_profile_id, p_platform, p_settings_json, p_origin_client_id) -> void

create table if not exists public.profile_settings_blob (
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id integer not null check (profile_id > 0),
  platform text not null,
  settings_json jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, profile_id, platform)
);

alter table public.profile_settings_blob enable row level security;

drop policy if exists "profile_settings_blob_select_own" on public.profile_settings_blob;
create policy "profile_settings_blob_select_own"
  on public.profile_settings_blob for select to authenticated
  using (user_id = auth.uid());

drop trigger if exists profile_settings_blob_set_updated_at on public.profile_settings_blob;
create trigger profile_settings_blob_set_updated_at
  before update on public.profile_settings_blob
  for each row execute function public.set_updated_at();

create or replace function public.sync_pull_profile_settings_blob(
  p_profile_id integer,
  p_platform text
)
returns setof public.profile_settings_blob
language sql
security definer
set search_path = public
stable
as $$
  select *
  from public.profile_settings_blob
  where user_id = auth.uid() and profile_id = p_profile_id and platform = p_platform;
$$;

create or replace function public.sync_push_profile_settings_blob(
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
  insert into public.profile_settings_blob (user_id, profile_id, platform, settings_json)
  values (auth.uid(), p_profile_id, p_platform, coalesce(p_settings_json, '{}'::jsonb))
  on conflict (user_id, profile_id, platform) do update set
    settings_json = excluded.settings_json,
    updated_at = now();

  perform public.log_sync_invalidation(p_profile_id, 'profile_settings', p_origin_client_id);
end;
$$;

revoke all on function public.sync_pull_profile_settings_blob(integer, text) from public;
revoke all on function public.sync_push_profile_settings_blob(integer, text, jsonb, text) from public;

grant execute on function public.sync_pull_profile_settings_blob(integer, text) to authenticated;
grant execute on function public.sync_push_profile_settings_blob(integer, text, jsonb, text) to authenticated;
