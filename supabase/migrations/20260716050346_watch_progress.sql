-- Phase 1: watch progress (continue watching / resume positions).
--
-- Client contract (composeApp/src/commonMain/.../SupabaseProgressSyncAdapter.kt):
--   sync_get_watch_progress_delta_cursor(p_profile_id) -> bigint
--   sync_pull_watch_progress(p_profile_id, p_since_last_watched?, p_limit?) -> rows
--   sync_pull_watch_progress_delta(p_profile_id, p_since_event_id, p_limit) -> rows
--   sync_push_watch_progress(p_profile_id, p_entries jsonb, p_origin_client_id) -> void
--   sync_delete_watch_progress(p_profile_id, p_keys jsonb, p_origin_client_id) -> void
--
-- `progress_key` is treated as an opaque logical-row identity by the client
-- (WatchProgressIdentity.kt): it's client-computed as `contentId_sSeE` or bare
-- `contentId` and sent as-is on push. The server just persists whatever key it
-- is given; it does not need to mint its own.

create table if not exists public.watch_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id integer not null check (profile_id > 0),
  progress_key text not null,
  content_id text not null,
  content_type text not null default '',
  video_id text not null,
  season integer,
  episode integer,
  position bigint not null default 0,
  duration bigint not null default 0,
  last_watched bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, profile_id, progress_key)
);

create index if not exists watch_progress_last_watched_idx
  on public.watch_progress (user_id, profile_id, last_watched desc);

alter table public.watch_progress enable row level security;

drop policy if exists "watch_progress_select_own" on public.watch_progress;
create policy "watch_progress_select_own"
  on public.watch_progress for select to authenticated
  using (user_id = auth.uid());

drop trigger if exists watch_progress_set_updated_at on public.watch_progress;
create trigger watch_progress_set_updated_at
  before update on public.watch_progress
  for each row execute function public.set_updated_at();

create table if not exists public.watch_progress_events (
  event_id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id integer not null check (profile_id > 0),
  operation text not null check (operation in ('upsert', 'delete')),
  progress_key text not null,
  content_id text not null default '',
  content_type text not null default '',
  video_id text not null default '',
  season integer,
  episode integer,
  position bigint not null default 0,
  duration bigint not null default 0,
  last_watched bigint not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists watch_progress_events_cursor_idx
  on public.watch_progress_events (user_id, profile_id, event_id);

alter table public.watch_progress_events enable row level security;

drop policy if exists "watch_progress_events_select_own" on public.watch_progress_events;
create policy "watch_progress_events_select_own"
  on public.watch_progress_events for select to authenticated
  using (user_id = auth.uid());

-- sync_get_watch_progress_delta_cursor: high-water mark to resume deltas from
-- after taking a full snapshot.
create or replace function public.sync_get_watch_progress_delta_cursor(p_profile_id integer)
returns bigint
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(max(event_id), 0)
  from public.watch_progress_events
  where user_id = auth.uid() and profile_id = p_profile_id;
$$;

-- sync_pull_watch_progress: full/snapshot pull of current state.
create or replace function public.sync_pull_watch_progress(
  p_profile_id integer,
  p_since_last_watched bigint default null,
  p_limit integer default null
)
returns setof public.watch_progress
language sql
security definer
set search_path = public
stable
as $$
  select *
  from public.watch_progress
  where user_id = auth.uid()
    and profile_id = p_profile_id
    and (p_since_last_watched is null or last_watched > p_since_last_watched)
  order by last_watched desc
  limit p_limit;
$$;

-- sync_pull_watch_progress_delta: incremental events since a cursor.
create or replace function public.sync_pull_watch_progress_delta(
  p_profile_id integer,
  p_since_event_id bigint,
  p_limit integer
)
returns setof public.watch_progress_events
language sql
security definer
set search_path = public
stable
as $$
  select *
  from public.watch_progress_events
  where user_id = auth.uid()
    and profile_id = p_profile_id
    and event_id > p_since_event_id
  order by event_id asc
  limit p_limit;
$$;

-- sync_push_watch_progress: upsert with server-side last-write-wins guard so a
-- slow/stale device can't clobber a fresher push from another device.
create or replace function public.sync_push_watch_progress(
  p_profile_id integer,
  p_entries jsonb,
  p_origin_client_id text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry jsonb;
  v_progress_key text;
  v_content_id text;
  v_content_type text;
  v_video_id text;
  v_season integer;
  v_episode integer;
  v_position bigint;
  v_duration bigint;
  v_last_watched bigint;
  v_existing_last_watched bigint;
  v_applied boolean := false;
begin
  if p_entries is null then
    return;
  end if;

  for v_entry in select * from jsonb_array_elements(p_entries)
  loop
    v_content_id := coalesce(v_entry ->> 'content_id', '');
    v_content_type := coalesce(v_entry ->> 'content_type', '');
    v_video_id := coalesce(v_entry ->> 'video_id', '');
    v_season := nullif(v_entry ->> 'season', '')::integer;
    v_episode := nullif(v_entry ->> 'episode', '')::integer;
    v_position := coalesce((v_entry ->> 'position')::bigint, 0);
    v_duration := coalesce((v_entry ->> 'duration')::bigint, 0);
    v_last_watched := coalesce((v_entry ->> 'last_watched')::bigint, 0);
    v_progress_key := nullif(v_entry ->> 'progress_key', '');
    if v_progress_key is null then
      v_progress_key := case
        when v_season is not null and v_episode is not null
          then v_content_id || '_s' || v_season || 'e' || v_episode
        else v_content_id
      end;
    end if;

    if v_content_id = '' or v_video_id = '' then
      continue;
    end if;

    select last_watched into v_existing_last_watched
    from public.watch_progress
    where user_id = auth.uid() and profile_id = p_profile_id and progress_key = v_progress_key
    for update;

    if v_existing_last_watched is not null and v_existing_last_watched > v_last_watched then
      continue;
    end if;

    insert into public.watch_progress (
      user_id, profile_id, progress_key, content_id, content_type, video_id,
      season, episode, position, duration, last_watched
    ) values (
      auth.uid(), p_profile_id, v_progress_key, v_content_id, v_content_type, v_video_id,
      v_season, v_episode, v_position, v_duration, v_last_watched
    )
    on conflict (user_id, profile_id, progress_key) do update set
      content_id = excluded.content_id,
      content_type = excluded.content_type,
      video_id = excluded.video_id,
      season = excluded.season,
      episode = excluded.episode,
      position = excluded.position,
      duration = excluded.duration,
      last_watched = excluded.last_watched,
      updated_at = now();

    insert into public.watch_progress_events (
      user_id, profile_id, operation, progress_key, content_id, content_type, video_id,
      season, episode, position, duration, last_watched
    ) values (
      auth.uid(), p_profile_id, 'upsert', v_progress_key, v_content_id, v_content_type, v_video_id,
      v_season, v_episode, v_position, v_duration, v_last_watched
    );

    v_applied := true;
  end loop;

  if v_applied then
    perform public.log_sync_invalidation(p_profile_id, 'watch_progress', p_origin_client_id);
  end if;
end;
$$;

-- sync_delete_watch_progress: remove by progress_key, logging tombstone events.
create or replace function public.sync_delete_watch_progress(
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
  v_key text;
  v_deleted_count integer := 0;
begin
  if p_keys is null then
    return;
  end if;

  for v_key in select jsonb_array_elements_text(p_keys)
  loop
    delete from public.watch_progress
    where user_id = auth.uid() and profile_id = p_profile_id and progress_key = v_key;

    if found then
      v_deleted_count := v_deleted_count + 1;
      insert into public.watch_progress_events (
        user_id, profile_id, operation, progress_key
      ) values (
        auth.uid(), p_profile_id, 'delete', v_key
      );
    end if;
  end loop;

  if v_deleted_count > 0 then
    perform public.log_sync_invalidation(p_profile_id, 'watch_progress', p_origin_client_id);
  end if;
end;
$$;

revoke all on function public.sync_get_watch_progress_delta_cursor(integer) from public;
revoke all on function public.sync_pull_watch_progress(integer, bigint, integer) from public;
revoke all on function public.sync_pull_watch_progress_delta(integer, bigint, integer) from public;
revoke all on function public.sync_push_watch_progress(integer, jsonb, text) from public;
revoke all on function public.sync_delete_watch_progress(integer, jsonb, text) from public;

grant execute on function public.sync_get_watch_progress_delta_cursor(integer) to authenticated;
grant execute on function public.sync_pull_watch_progress(integer, bigint, integer) to authenticated;
grant execute on function public.sync_pull_watch_progress_delta(integer, bigint, integer) to authenticated;
grant execute on function public.sync_push_watch_progress(integer, jsonb, text) to authenticated;
grant execute on function public.sync_delete_watch_progress(integer, jsonb, text) to authenticated;
