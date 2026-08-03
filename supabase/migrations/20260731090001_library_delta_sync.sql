-- Adds incremental library synchronization while preserving the full-snapshot
-- RPC used by older clients.
--
-- Current client contract (composeApp/src/commonMain/.../SupabaseLibrarySyncAdapter.kt):
--   sync_get_library_delta_cursor(p_profile_id) -> bigint
--   sync_pull_library(p_profile_id, p_limit, p_offset) -> paged current rows
--   sync_pull_library_delta(p_profile_id, p_since_event_id, p_limit) -> event rows
--   sync_push_library_items(p_profile_id, p_items, p_origin_client_id) -> void
--   sync_delete_library_items(p_profile_id, p_keys, p_origin_client_id) -> void
--
-- Library identity is (content_id, content_type). The original fork migration
-- keyed only on content_id, which cannot represent a movie and series sharing
-- the same provider id and does not match the current client contract.

set lock_timeout = '5s';

alter table public.library_items
  drop constraint if exists library_items_pkey;

alter table public.library_items
  add constraint library_items_pkey
  primary key (user_id, profile_id, content_id, content_type);

reset lock_timeout;

create table if not exists public.library_items_events (
  event_id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id integer not null check (profile_id > 0),
  operation text not null check (operation in ('upsert', 'delete')),
  content_id text not null,
  content_type text not null default '',
  name text not null default '',
  poster text,
  poster_shape text not null default 'POSTER',
  background text,
  description text,
  release_info text,
  imdb_rating real,
  genres text[] not null default '{}',
  addon_base_url text,
  added_at bigint not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists library_items_events_cursor_idx
  on public.library_items_events (user_id, profile_id, event_id);

alter table public.library_items_events enable row level security;

drop policy if exists "library_items_events_select_own" on public.library_items_events;
create policy "library_items_events_select_own"
  on public.library_items_events for select to authenticated
  using (user_id = auth.uid());

-- Stable composite ordering is required for offset snapshot pagination.
create or replace function public.sync_pull_library(
  p_profile_id integer,
  p_limit integer,
  p_offset integer
)
returns setof public.library_items
language sql
security definer
set search_path = public
stable
as $$
  select *
  from public.library_items
  where user_id = auth.uid() and profile_id = p_profile_id
  order by content_id asc, content_type asc
  limit least(greatest(coalesce(p_limit, 500), 1), 1000)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

create or replace function public.sync_get_library_delta_cursor(p_profile_id integer)
returns bigint
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(max(event_id), 0)
  from public.library_items_events
  where user_id = auth.uid() and profile_id = p_profile_id;
$$;

create or replace function public.sync_pull_library_delta(
  p_profile_id integer,
  p_since_event_id bigint,
  p_limit integer
)
returns setof public.library_items_events
language sql
security definer
set search_path = public
stable
as $$
  select *
  from public.library_items_events
  where user_id = auth.uid()
    and profile_id = p_profile_id
    and event_id > greatest(coalesce(p_since_event_id, 0), 0)
  order by event_id asc
  limit least(greatest(coalesce(p_limit, 500), 1), 1000);
$$;

create or replace function public.sync_push_library_items(
  p_profile_id integer,
  p_items jsonb,
  p_origin_client_id text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_item jsonb;
  v_content_id text;
  v_content_type text;
  v_name text;
  v_poster text;
  v_poster_shape text;
  v_background text;
  v_description text;
  v_release_info text;
  v_imdb_rating real;
  v_genres text[];
  v_addon_base_url text;
  v_added_at bigint;
  v_applied boolean := false;
begin
  if v_user_id is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;

  if p_profile_id is null or p_profile_id <= 0 then
    raise exception 'Invalid profile id'
      using errcode = '22023';
  end if;

  if p_items is null then
    return;
  end if;

  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'Library items must be a JSON array'
      using errcode = '22023';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_content_id := btrim(coalesce(v_item ->> 'content_id', ''));
    v_content_type := btrim(coalesce(v_item ->> 'content_type', ''));
    if v_content_id = '' then
      continue;
    end if;

    v_name := coalesce(v_item ->> 'name', '');
    v_poster := v_item ->> 'poster';
    v_poster_shape := coalesce(v_item ->> 'poster_shape', 'POSTER');
    v_background := v_item ->> 'background';
    v_description := v_item ->> 'description';
    v_release_info := v_item ->> 'release_info';
    v_imdb_rating := nullif(v_item ->> 'imdb_rating', '')::real;
    v_genres := case
      when jsonb_typeof(v_item -> 'genres') = 'array' then coalesce(
        (
          select array_agg(value)
          from jsonb_array_elements_text(v_item -> 'genres') as value
        ),
        '{}'
      )
      else '{}'
    end;
    v_addon_base_url := v_item ->> 'addon_base_url';
    v_added_at := coalesce((v_item ->> 'added_at')::bigint, 0);

    insert into public.library_items (
      user_id, profile_id, content_id, content_type, name, poster, poster_shape,
      background, description, release_info, imdb_rating, genres, addon_base_url, added_at
    ) values (
      v_user_id, p_profile_id, v_content_id, v_content_type, v_name, v_poster, v_poster_shape,
      v_background, v_description, v_release_info, v_imdb_rating, v_genres,
      v_addon_base_url, v_added_at
    )
    on conflict (user_id, profile_id, content_id, content_type) do update set
      name = excluded.name,
      poster = excluded.poster,
      poster_shape = excluded.poster_shape,
      background = excluded.background,
      description = excluded.description,
      release_info = excluded.release_info,
      imdb_rating = excluded.imdb_rating,
      genres = excluded.genres,
      addon_base_url = excluded.addon_base_url,
      added_at = excluded.added_at,
      updated_at = now()
    where (
      library_items.name,
      library_items.poster,
      library_items.poster_shape,
      library_items.background,
      library_items.description,
      library_items.release_info,
      library_items.imdb_rating,
      library_items.genres,
      library_items.addon_base_url,
      library_items.added_at
    ) is distinct from (
      excluded.name,
      excluded.poster,
      excluded.poster_shape,
      excluded.background,
      excluded.description,
      excluded.release_info,
      excluded.imdb_rating,
      excluded.genres,
      excluded.addon_base_url,
      excluded.added_at
    );

    if found then
      insert into public.library_items_events (
        user_id, profile_id, operation, content_id, content_type, name, poster,
        poster_shape, background, description, release_info, imdb_rating, genres,
        addon_base_url, added_at
      )
      select
        user_id, profile_id, 'upsert', content_id, content_type, name, poster,
        poster_shape, background, description, release_info, imdb_rating, genres,
        addon_base_url, added_at
      from public.library_items
      where user_id = v_user_id
        and profile_id = p_profile_id
        and content_id = v_content_id
        and content_type = v_content_type;

      v_applied := true;
    end if;
  end loop;

  if v_applied then
    perform public.log_sync_invalidation(p_profile_id, 'library', p_origin_client_id);
  end if;
end;
$$;

create or replace function public.sync_delete_library_items(
  p_profile_id integer,
  p_keys jsonb,
  p_origin_client_id text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_key jsonb;
  v_content_id text;
  v_content_type text;
  v_event_count integer;
  v_deleted_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;

  if p_profile_id is null or p_profile_id <= 0 then
    raise exception 'Invalid profile id'
      using errcode = '22023';
  end if;

  if p_keys is null then
    return;
  end if;

  if jsonb_typeof(p_keys) <> 'array' then
    raise exception 'Library keys must be a JSON array'
      using errcode = '22023';
  end if;

  for v_key in select * from jsonb_array_elements(p_keys)
  loop
    v_content_id := btrim(coalesce(v_key ->> 'content_id', ''));
    v_content_type := btrim(coalesce(v_key ->> 'content_type', ''));
    if v_content_id = '' then
      continue;
    end if;

    with deleted as (
      delete from public.library_items
      where user_id = v_user_id
        and profile_id = p_profile_id
        and content_id = v_content_id
        and content_type = v_content_type
      returning *
    )
    insert into public.library_items_events (
      user_id, profile_id, operation, content_id, content_type, name, poster,
      poster_shape, background, description, release_info, imdb_rating, genres,
      addon_base_url, added_at
    )
    select
      user_id, profile_id, 'delete', content_id, content_type, name, poster,
      poster_shape, background, description, release_info, imdb_rating, genres,
      addon_base_url, added_at
    from deleted;

    get diagnostics v_event_count = row_count;
    v_deleted_count := v_deleted_count + v_event_count;
  end loop;

  if v_deleted_count > 0 then
    perform public.log_sync_invalidation(p_profile_id, 'library', p_origin_client_id);
  end if;
end;
$$;

-- Backward compatibility for clients that still send a complete snapshot.
-- Every applied difference is also recorded in the delta log so current clients
-- observe mutations made by an older installation.
create or replace function public.sync_push_library(
  p_profile_id integer,
  p_items jsonb,
  p_origin_client_id text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_item jsonb;
  v_content_id text;
  v_content_type text;
  v_name text;
  v_poster text;
  v_poster_shape text;
  v_background text;
  v_description text;
  v_release_info text;
  v_imdb_rating real;
  v_genres text[];
  v_addon_base_url text;
  v_added_at bigint;
  v_deleted_count integer := 0;
  v_applied boolean := false;
begin
  if v_user_id is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;

  if p_profile_id is null or p_profile_id <= 0 then
    raise exception 'Invalid profile id'
      using errcode = '22023';
  end if;

  if p_items is null then
    return;
  end if;

  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'Library items must be a JSON array'
      using errcode = '22023';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_content_id := btrim(coalesce(v_item ->> 'content_id', ''));
    v_content_type := btrim(coalesce(v_item ->> 'content_type', ''));
    if v_content_id = '' then
      continue;
    end if;

    v_name := coalesce(v_item ->> 'name', '');
    v_poster := v_item ->> 'poster';
    v_poster_shape := coalesce(v_item ->> 'poster_shape', 'POSTER');
    v_background := v_item ->> 'background';
    v_description := v_item ->> 'description';
    v_release_info := v_item ->> 'release_info';
    v_imdb_rating := nullif(v_item ->> 'imdb_rating', '')::real;
    v_genres := case
      when jsonb_typeof(v_item -> 'genres') = 'array' then coalesce(
        (
          select array_agg(value)
          from jsonb_array_elements_text(v_item -> 'genres') as value
        ),
        '{}'
      )
      else '{}'
    end;
    v_addon_base_url := v_item ->> 'addon_base_url';
    v_added_at := coalesce((v_item ->> 'added_at')::bigint, 0);

    insert into public.library_items (
      user_id, profile_id, content_id, content_type, name, poster, poster_shape,
      background, description, release_info, imdb_rating, genres, addon_base_url, added_at
    ) values (
      v_user_id, p_profile_id, v_content_id, v_content_type, v_name, v_poster, v_poster_shape,
      v_background, v_description, v_release_info, v_imdb_rating, v_genres,
      v_addon_base_url, v_added_at
    )
    on conflict (user_id, profile_id, content_id, content_type) do update set
      name = excluded.name,
      poster = excluded.poster,
      poster_shape = excluded.poster_shape,
      background = excluded.background,
      description = excluded.description,
      release_info = excluded.release_info,
      imdb_rating = excluded.imdb_rating,
      genres = excluded.genres,
      addon_base_url = excluded.addon_base_url,
      added_at = excluded.added_at,
      updated_at = now()
    where (
      library_items.name,
      library_items.poster,
      library_items.poster_shape,
      library_items.background,
      library_items.description,
      library_items.release_info,
      library_items.imdb_rating,
      library_items.genres,
      library_items.addon_base_url,
      library_items.added_at
    ) is distinct from (
      excluded.name,
      excluded.poster,
      excluded.poster_shape,
      excluded.background,
      excluded.description,
      excluded.release_info,
      excluded.imdb_rating,
      excluded.genres,
      excluded.addon_base_url,
      excluded.added_at
    );

    if found then
      insert into public.library_items_events (
        user_id, profile_id, operation, content_id, content_type, name, poster,
        poster_shape, background, description, release_info, imdb_rating, genres,
        addon_base_url, added_at
      )
      select
        user_id, profile_id, 'upsert', content_id, content_type, name, poster,
        poster_shape, background, description, release_info, imdb_rating, genres,
        addon_base_url, added_at
      from public.library_items
      where user_id = v_user_id
        and profile_id = p_profile_id
        and content_id = v_content_id
        and content_type = v_content_type;

      v_applied := true;
    end if;
  end loop;

  with deleted as (
    delete from public.library_items as library_item
    where library_item.user_id = v_user_id
      and library_item.profile_id = p_profile_id
      and not exists (
        select 1
        from jsonb_array_elements(p_items) as incoming(item)
        where btrim(coalesce(incoming.item ->> 'content_id', '')) = library_item.content_id
          and btrim(coalesce(incoming.item ->> 'content_type', '')) = library_item.content_type
      )
    returning library_item.*
  )
  insert into public.library_items_events (
    user_id, profile_id, operation, content_id, content_type, name, poster,
    poster_shape, background, description, release_info, imdb_rating, genres,
    addon_base_url, added_at
  )
  select
    user_id, profile_id, 'delete', content_id, content_type, name, poster,
    poster_shape, background, description, release_info, imdb_rating, genres,
    addon_base_url, added_at
  from deleted;

  get diagnostics v_deleted_count = row_count;

  if v_applied or v_deleted_count > 0 then
    perform public.log_sync_invalidation(p_profile_id, 'library', p_origin_client_id);
  end if;
end;
$$;

-- Profile-scoped event history must be removed with the rest of a profile.
create or replace function public.sync_delete_profile_data(
  p_profile_id integer,
  p_origin_client_id text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.watch_progress where user_id = auth.uid() and profile_id = p_profile_id;
  delete from public.watch_progress_events where user_id = auth.uid() and profile_id = p_profile_id;
  delete from public.watched_items where user_id = auth.uid() and profile_id = p_profile_id;
  delete from public.watched_items_events where user_id = auth.uid() and profile_id = p_profile_id;
  delete from public.library_items where user_id = auth.uid() and profile_id = p_profile_id;
  delete from public.library_items_events where user_id = auth.uid() and profile_id = p_profile_id;
  delete from public.collections where user_id = auth.uid() and profile_id = p_profile_id;
  delete from public.home_catalog_settings where user_id = auth.uid() and profile_id = p_profile_id;
  delete from public.profile_settings_blob where user_id = auth.uid() and profile_id = p_profile_id;
  delete from public.provider_credentials where user_id = auth.uid() and profile_id = p_profile_id;
  delete from public.addons where user_id = auth.uid() and profile_id = p_profile_id;
  delete from public.plugins where user_id = auth.uid() and profile_id = p_profile_id;
  delete from public.profiles where user_id = auth.uid() and profile_index = p_profile_id;

  perform public.log_sync_invalidation(p_profile_id, 'profiles', p_origin_client_id);
end;
$$;

revoke all on table public.library_items_events from anon;
revoke insert, update, delete on table public.library_items_events from authenticated;

revoke all on function public.sync_get_library_delta_cursor(integer) from public;
revoke all on function public.sync_pull_library_delta(integer, bigint, integer) from public;
revoke all on function public.sync_push_library_items(integer, jsonb, text) from public;
revoke all on function public.sync_delete_library_items(integer, jsonb, text) from public;
revoke all on function public.sync_pull_library(integer, integer, integer) from public;
revoke all on function public.sync_push_library(integer, jsonb, text) from public;
revoke all on function public.sync_delete_profile_data(integer, text) from public;

grant select on table public.library_items_events to authenticated;
grant execute on function public.sync_get_library_delta_cursor(integer) to authenticated;
grant execute on function public.sync_pull_library_delta(integer, bigint, integer) to authenticated;
grant execute on function public.sync_push_library_items(integer, jsonb, text) to authenticated;
grant execute on function public.sync_delete_library_items(integer, jsonb, text) to authenticated;
grant execute on function public.sync_pull_library(integer, integer, integer) to authenticated;
grant execute on function public.sync_push_library(integer, jsonb, text) to authenticated;
grant execute on function public.sync_delete_profile_data(integer, text) to authenticated;
