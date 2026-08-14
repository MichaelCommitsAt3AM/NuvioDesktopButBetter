-- Lets a secondary profile with uses_primary_addons=true share only a subset
-- of the primary profile's addons instead of all-or-nothing.
--
-- NULL means "share everything from primary" (today's behavior, and the
-- default for existing rows post-migration, so nothing changes for current
-- users of the toggle). A non-null jsonb array (including `[]`) means
-- "share only these manifest URLs, explicitly chosen by the user" --
-- distinguishing "never customized" (null) from "customized to share
-- nothing" ([]). Stored as jsonb (matching how p_addons/p_profiles bulk
-- payloads are already handled elsewhere in this file's RPCs) rather than
-- text[] to avoid plpgsql text[]<->jsonb casting friction.

alter table public.profiles
  add column if not exists primary_addons_allowlist jsonb;

-- Postgres won't let `create or replace function` change a function's
-- return columns (adding primary_addons_allowlist here) — must drop first.
drop function if exists public.sync_pull_profiles();

create or replace function public.sync_pull_profiles()
returns table (
  id uuid,
  user_id uuid,
  profile_index integer,
  name text,
  avatar_color_hex text,
  avatar_id text,
  avatar_url text,
  uses_primary_addons boolean,
  uses_primary_plugins boolean,
  primary_addons_allowlist jsonb,
  pin_enabled boolean,
  pin_locked_until timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    p.id, p.user_id, p.profile_index, p.name, p.avatar_color_hex, p.avatar_id, p.avatar_url,
    p.uses_primary_addons, p.uses_primary_plugins, p.primary_addons_allowlist,
    (p.pin_hash is not null) as pin_enabled,
    p.pin_locked_until, p.created_at, p.updated_at
  from public.profiles p
  where p.user_id = auth.uid()
  order by p.profile_index;
$$;

create or replace function public.sync_push_profiles(
  p_client_max_profiles integer,
  p_profiles jsonb,
  p_origin_client_id text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_profile_index integer;
  v_name text;
  v_avatar_color_hex text;
  v_uses_primary_addons boolean;
  v_uses_primary_plugins boolean;
  v_primary_addons_allowlist jsonb;
  v_avatar_id text;
  v_avatar_url text;
  v_incoming_count integer;
  v_existing_extra_count integer;
begin
  if p_profiles is null then
    return;
  end if;

  select count(*) into v_incoming_count from jsonb_array_elements(p_profiles);

  select count(*) into v_existing_extra_count
  from public.profiles
  where user_id = auth.uid()
    and profile_index not in (
      select coalesce((elem ->> 'profile_index')::integer, -1)
      from jsonb_array_elements(p_profiles) as elem
    );

  if (v_incoming_count + v_existing_extra_count) > greatest(p_client_max_profiles, 1) then
    raise exception 'Profile push exceeds max profiles (%)', p_client_max_profiles;
  end if;

  for v_item in select * from jsonb_array_elements(p_profiles)
  loop
    v_profile_index := (v_item ->> 'profile_index')::integer;
    if v_profile_index is null or v_profile_index < 1 or v_profile_index > 6 then
      continue;
    end if;
    v_name := coalesce(v_item ->> 'name', '');
    v_avatar_color_hex := coalesce(v_item ->> 'avatar_color_hex', '#1E88E5');
    v_uses_primary_addons := coalesce((v_item ->> 'uses_primary_addons')::boolean, false);
    v_uses_primary_plugins := coalesce((v_item ->> 'uses_primary_plugins')::boolean, false);
    -- Kept as jsonb (not cast to boolean/text) so null (share-all) and a
    -- jsonb array (including []) round-trip as-is. `->` yields SQL NULL when
    -- the key is absent (older client payload), which also degrades safely
    -- to "share all". Defensive: if a client ever sends something that isn't
    -- an array or null, treat it as unset rather than storing garbage.
    v_primary_addons_allowlist := v_item -> 'primary_addons_allowlist';
    if jsonb_typeof(v_primary_addons_allowlist) is distinct from 'array' then
      v_primary_addons_allowlist := null;
    end if;
    v_avatar_id := v_item ->> 'avatar_id';
    v_avatar_url := v_item ->> 'avatar_url';

    insert into public.profiles (
      user_id, profile_index, name, avatar_color_hex, avatar_id, avatar_url,
      uses_primary_addons, uses_primary_plugins, primary_addons_allowlist
    ) values (
      auth.uid(), v_profile_index, v_name, v_avatar_color_hex, v_avatar_id, v_avatar_url,
      v_uses_primary_addons, v_uses_primary_plugins, v_primary_addons_allowlist
    )
    on conflict (user_id, profile_index) do update set
      name = excluded.name,
      avatar_color_hex = excluded.avatar_color_hex,
      avatar_id = excluded.avatar_id,
      avatar_url = excluded.avatar_url,
      uses_primary_addons = excluded.uses_primary_addons,
      uses_primary_plugins = excluded.uses_primary_plugins,
      primary_addons_allowlist = excluded.primary_addons_allowlist,
      updated_at = now();
  end loop;

  perform public.log_sync_invalidation(1, 'profiles', p_origin_client_id);
end;
$$;
