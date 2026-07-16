-- Phase 1: watched history.
--
-- Client contract (composeApp/src/commonMain/.../SupabaseWatchedSyncAdapter.kt):
--   sync_get_watched_items_delta_cursor(p_profile_id) -> bigint
--   sync_pull_watched_items(p_profile_id, p_page, p_page_size) -> rows (paged; client
--     loops pages until a page returns fewer than p_page_size rows)
--   sync_pull_watched_items_delta(p_profile_id, p_since_event_id, p_limit) -> rows
--   sync_push_watched_items(p_profile_id, p_items jsonb, p_origin_client_id) -> void
--   sync_delete_watched_items(p_profile_id, p_keys jsonb, p_origin_client_id) -> void
--
-- Unlike watch_progress, the client has no opaque key concept here: identity is
-- the natural triple (content_id, season, episode), sent as-is on both push and
-- delete. season/episode are null for movies, so a composite PRIMARY KEY can't
-- use them directly (SQL NULLs are never equal, which would break upsert/delete
-- matching). `dedupe_key` is a generated column that encodes the same natural
-- key with nulls normalized to '', used as the real conflict/match target.

create table if not exists public.watched_items (
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id integer not null check (profile_id > 0),
  content_id text not null,
  content_type text not null default '',
  title text not null default '',
  season integer,
  episode integer,
  watched_at bigint not null default 0,
  dedupe_key text generated always as (
    content_id || ':' || coalesce(season::text, '') || ':' || coalesce(episode::text, '')
  ) stored,
  updated_at timestamptz not null default now(),
  primary key (user_id, profile_id, dedupe_key)
);

create index if not exists watched_items_watched_at_idx
  on public.watched_items (user_id, profile_id, watched_at desc);

alter table public.watched_items enable row level security;

drop policy if exists "watched_items_select_own" on public.watched_items;
create policy "watched_items_select_own"
  on public.watched_items for select to authenticated
  using (user_id = auth.uid());

drop trigger if exists watched_items_set_updated_at on public.watched_items;
create trigger watched_items_set_updated_at
  before update on public.watched_items
  for each row execute function public.set_updated_at();

create table if not exists public.watched_items_events (
  event_id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id integer not null check (profile_id > 0),
  operation text not null check (operation in ('upsert', 'delete')),
  content_id text not null default '',
  content_type text not null default '',
  title text not null default '',
  season integer,
  episode integer,
  watched_at bigint not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists watched_items_events_cursor_idx
  on public.watched_items_events (user_id, profile_id, event_id);

alter table public.watched_items_events enable row level security;

drop policy if exists "watched_items_events_select_own" on public.watched_items_events;
create policy "watched_items_events_select_own"
  on public.watched_items_events for select to authenticated
  using (user_id = auth.uid());

create or replace function public.sync_get_watched_items_delta_cursor(p_profile_id integer)
returns bigint
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(max(event_id), 0)
  from public.watched_items_events
  where user_id = auth.uid() and profile_id = p_profile_id;
$$;

-- sync_pull_watched_items: paged full pull, ordered by the stable dedupe_key so
-- concurrent inserts during pagination can't cause skipped/duplicated rows.
create or replace function public.sync_pull_watched_items(
  p_profile_id integer,
  p_page integer,
  p_page_size integer
)
returns setof public.watched_items
language sql
security definer
set search_path = public
stable
as $$
  select *
  from public.watched_items
  where user_id = auth.uid()
    and profile_id = p_profile_id
  order by dedupe_key asc
  limit p_page_size
  offset greatest(p_page - 1, 0) * p_page_size;
$$;

create or replace function public.sync_pull_watched_items_delta(
  p_profile_id integer,
  p_since_event_id bigint,
  p_limit integer
)
returns setof public.watched_items_events
language sql
security definer
set search_path = public
stable
as $$
  select *
  from public.watched_items_events
  where user_id = auth.uid()
    and profile_id = p_profile_id
    and event_id > p_since_event_id
  order by event_id asc
  limit p_limit;
$$;

create or replace function public.sync_push_watched_items(
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
  v_item jsonb;
  v_content_id text;
  v_content_type text;
  v_title text;
  v_season integer;
  v_episode integer;
  v_watched_at bigint;
  v_existing_watched_at bigint;
  v_dedupe_key text;
  v_applied boolean := false;
begin
  if p_items is null then
    return;
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_content_id := coalesce(v_item ->> 'content_id', '');
    v_content_type := coalesce(v_item ->> 'content_type', '');
    v_title := coalesce(v_item ->> 'title', '');
    v_season := nullif(v_item ->> 'season', '')::integer;
    v_episode := nullif(v_item ->> 'episode', '')::integer;
    v_watched_at := coalesce((v_item ->> 'watched_at')::bigint, 0);

    if v_content_id = '' then
      continue;
    end if;

    v_dedupe_key := v_content_id || ':' || coalesce(v_season::text, '') || ':' || coalesce(v_episode::text, '');

    select watched_at into v_existing_watched_at
    from public.watched_items
    where user_id = auth.uid() and profile_id = p_profile_id and dedupe_key = v_dedupe_key
    for update;

    if v_existing_watched_at is not null and v_existing_watched_at > v_watched_at then
      continue;
    end if;

    insert into public.watched_items (
      user_id, profile_id, content_id, content_type, title, season, episode, watched_at
    ) values (
      auth.uid(), p_profile_id, v_content_id, v_content_type, v_title, v_season, v_episode, v_watched_at
    )
    on conflict (user_id, profile_id, dedupe_key) do update set
      content_type = excluded.content_type,
      title = excluded.title,
      watched_at = excluded.watched_at,
      updated_at = now();

    insert into public.watched_items_events (
      user_id, profile_id, operation, content_id, content_type, title, season, episode, watched_at
    ) values (
      auth.uid(), p_profile_id, 'upsert', v_content_id, v_content_type, v_title, v_season, v_episode, v_watched_at
    );

    v_applied := true;
  end loop;

  if v_applied then
    perform public.log_sync_invalidation(p_profile_id, 'watched_items', p_origin_client_id);
  end if;
end;
$$;

create or replace function public.sync_delete_watched_items(
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
  v_key jsonb;
  v_content_id text;
  v_season integer;
  v_episode integer;
  v_dedupe_key text;
  v_deleted_count integer := 0;
begin
  if p_keys is null then
    return;
  end if;

  for v_key in select * from jsonb_array_elements(p_keys)
  loop
    v_content_id := coalesce(v_key ->> 'content_id', '');
    v_season := nullif(v_key ->> 'season', '')::integer;
    v_episode := nullif(v_key ->> 'episode', '')::integer;
    if v_content_id = '' then
      continue;
    end if;
    v_dedupe_key := v_content_id || ':' || coalesce(v_season::text, '') || ':' || coalesce(v_episode::text, '');

    delete from public.watched_items
    where user_id = auth.uid() and profile_id = p_profile_id and dedupe_key = v_dedupe_key;

    if found then
      v_deleted_count := v_deleted_count + 1;
      insert into public.watched_items_events (
        user_id, profile_id, operation, content_id, season, episode
      ) values (
        auth.uid(), p_profile_id, 'delete', v_content_id, v_season, v_episode
      );
    end if;
  end loop;

  if v_deleted_count > 0 then
    perform public.log_sync_invalidation(p_profile_id, 'watched_items', p_origin_client_id);
  end if;
end;
$$;

revoke all on function public.sync_get_watched_items_delta_cursor(integer) from public;
revoke all on function public.sync_pull_watched_items(integer, integer, integer) from public;
revoke all on function public.sync_pull_watched_items_delta(integer, bigint, integer) from public;
revoke all on function public.sync_push_watched_items(integer, jsonb, text) from public;
revoke all on function public.sync_delete_watched_items(integer, jsonb, text) from public;

grant execute on function public.sync_get_watched_items_delta_cursor(integer) to authenticated;
grant execute on function public.sync_pull_watched_items(integer, integer, integer) to authenticated;
grant execute on function public.sync_pull_watched_items_delta(integer, bigint, integer) to authenticated;
grant execute on function public.sync_push_watched_items(integer, jsonb, text) to authenticated;
grant execute on function public.sync_delete_watched_items(integer, jsonb, text) to authenticated;
