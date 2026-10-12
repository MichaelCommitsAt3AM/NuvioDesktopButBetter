-- Add-on sharing is explicit and separate from profile cosmetics pushes, so older
-- clients cannot accidentally break links. Each member retains readable addon rows.
alter table public.profiles add column addon_sync_profile_id integer;
alter table public.profiles add constraint profiles_addon_link_valid
  check (addon_sync_profile_id between 1 and 6 and addon_sync_profile_id <> profile_index);

create function public.profile_addon_group_root(p_user_id uuid, p_profile_id integer)
returns integer language plpgsql stable set search_path = public as $$
declare v_current integer := p_profile_id; v_source integer; v_seen integer[] := '{}';
begin
  loop
    if v_current = any(v_seen) then raise exception 'Cyclic add-on profile link'; end if;
    v_seen := array_append(v_seen, v_current);
    select addon_sync_profile_id into v_source from public.profiles
      where user_id = p_user_id and profile_index = v_current;
    if v_source is null then return v_current; end if;
    if not exists(select 1 from public.profiles where user_id = p_user_id and profile_index = v_source)
      then return v_current; end if;
    v_current := v_source;
  end loop;
end;
$$;
revoke all on function public.profile_addon_group_root(uuid, integer) from public;

create or replace function public.sync_push_addons(
  p_profile_id integer,
  p_addons jsonb,
  p_origin_client_id text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_incoming_urls text[] := '{}';
  v_url text;
  v_member integer;
  v_root integer;
begin
  if p_addons is null then
    return;
  end if;

  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_profile_id is null or p_profile_id < 1 or p_profile_id > 6 then raise exception 'Invalid profile'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 193));
  v_root := public.profile_addon_group_root(auth.uid(), p_profile_id);
  for v_member in
    select p.profile_index from public.profiles p
    where p.user_id = auth.uid() and public.profile_addon_group_root(auth.uid(), p.profile_index) = v_root
    union select p_profile_id
  loop
  v_incoming_urls := '{}';
  for v_item in select * from jsonb_array_elements(p_addons)
  loop
    v_url := coalesce(v_item ->> 'url', '');
    if v_url = '' then
      continue;
    end if;
    v_incoming_urls := array_append(v_incoming_urls, v_url);

    insert into public.addons (user_id, profile_id, url, name, enabled, sort_order)
    values (
      auth.uid(), v_member, v_url,
      coalesce(v_item ->> 'name', ''),
      coalesce((v_item ->> 'enabled')::boolean, true),
      coalesce((v_item ->> 'sort_order')::integer, 0)
    )
    on conflict (user_id, profile_id, url) do update set
      name = excluded.name,
      enabled = excluded.enabled,
      sort_order = excluded.sort_order,
      updated_at = now();
  end loop;

  delete from public.addons
  where user_id = auth.uid() and profile_id = v_member
    and not (url = any (v_incoming_urls));

  perform public.log_sync_invalidation(v_member, 'addons', p_origin_client_id);
  end loop;
end;
$$;

revoke all on function public.sync_push_addons(integer, jsonb, text) from public;
grant execute on function public.sync_push_addons(integer, jsonb, text) to authenticated;

create function public.sync_profile_addon_links_available()
returns boolean language sql stable set search_path = public as $$ select true $$;
revoke all on function public.sync_profile_addon_links_available() from public;
grant execute on function public.sync_profile_addon_links_available() to authenticated;

create function public.sync_set_profile_addon_link(
  p_profile_id integer, p_source_profile_id integer, p_origin_client_id text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_snapshot jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 193));
  if not exists(select 1 from public.profiles where user_id = auth.uid() and profile_index = p_profile_id)
    then raise exception 'Target profile does not exist'; end if;
  if p_source_profile_id is not null then
    if not exists(select 1 from public.profiles where user_id = auth.uid() and profile_index = p_source_profile_id)
      then raise exception 'Source profile does not exist'; end if;
    if exists (
      with recursive ancestors as (
        select p.profile_index, p.addon_sync_profile_id from public.profiles p
          where p.user_id = auth.uid() and p.profile_index = p_source_profile_id
        union
        select p.profile_index, p.addon_sync_profile_id from public.profiles p
          join ancestors a on p.profile_index = a.addon_sync_profile_id where p.user_id = auth.uid()
      ) select 1 from ancestors where profile_index = p_profile_id
    )
      then raise exception 'A profile cannot link to itself or its descendants'; end if;
    select coalesce(jsonb_agg(jsonb_build_object('url', a.url, 'name', a.name,
      'enabled', a.enabled, 'sort_order', a.sort_order) order by a.sort_order, a.url), '[]'::jsonb)
      into v_snapshot from public.addons a where a.user_id = auth.uid() and a.profile_id = p_source_profile_id;
  end if;
  update public.profiles set addon_sync_profile_id = p_source_profile_id,
    uses_primary_addons = false, primary_addons_allowlist = null, updated_at = now()
    where user_id = auth.uid() and profile_index = p_profile_id;
  if p_source_profile_id is not null then
    perform public.sync_push_addons(p_profile_id, v_snapshot, p_origin_client_id);
  end if;
  perform public.log_sync_invalidation(1, 'profiles', p_origin_client_id);
  return coalesce(v_snapshot, '[]'::jsonb);
end;
$$;
revoke all on function public.sync_set_profile_addon_link(integer, integer, text) from public;
grant execute on function public.sync_set_profile_addon_link(integer, integer, text) to authenticated;

-- Detach followers before a source slot is deleted/reused. Their addon rows survive.
create function public.detach_deleted_profile_addon_links()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(old.user_id::text, 193));
  update public.profiles set addon_sync_profile_id = null, updated_at = now()
    where user_id = old.user_id and addon_sync_profile_id = old.profile_index;
  perform public.log_sync_invalidation(1, 'profiles', null);
  return old;
end;
$$;
revoke all on function public.detach_deleted_profile_addon_links() from public;
create trigger profiles_detach_addon_links before delete on public.profiles
for each row execute function public.detach_deleted_profile_addon_links();

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
  addon_sync_profile_id integer,
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
    p.uses_primary_addons, p.uses_primary_plugins, p.primary_addons_allowlist, p.addon_sync_profile_id,
    (p.pin_hash is not null) as pin_enabled,
    p.pin_locked_until, p.created_at, p.updated_at
  from public.profiles p
  where p.user_id = auth.uid()
  order by p.profile_index;
$$;


revoke all on function public.sync_pull_profiles() from public;
grant execute on function public.sync_pull_profiles() to authenticated;
