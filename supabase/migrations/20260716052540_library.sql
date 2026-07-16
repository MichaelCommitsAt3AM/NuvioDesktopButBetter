-- Phase 2: library (saved shows/movies).
--
-- Client contract (composeApp/src/commonMain/.../LibraryRepository.kt):
--   sync_pull_library(p_profile_id, p_limit, p_offset) -> paged rows
--   sync_push_library(p_profile_id, p_items jsonb, p_origin_client_id) -> void
--     (full-replace: the client always sends its complete current library
--      snapshot, so the RPC upserts everything present and deletes anything
--      absent — including wiping the table if the snapshot is genuinely empty,
--      which matches "user removed their last saved item")

create table if not exists public.library_items (
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id integer not null check (profile_id > 0),
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
  updated_at timestamptz not null default now(),
  primary key (user_id, profile_id, content_id)
);

create index if not exists library_items_added_at_idx
  on public.library_items (user_id, profile_id, added_at desc);

alter table public.library_items enable row level security;

drop policy if exists "library_items_select_own" on public.library_items;
create policy "library_items_select_own"
  on public.library_items for select to authenticated
  using (user_id = auth.uid());

drop trigger if exists library_items_set_updated_at on public.library_items;
create trigger library_items_set_updated_at
  before update on public.library_items
  for each row execute function public.set_updated_at();

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
  order by content_id asc
  limit p_limit offset p_offset;
$$;

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
  v_item jsonb;
  v_incoming_ids text[] := '{}';
  v_content_id text;
begin
  if p_items is null then
    return;
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_content_id := coalesce(v_item ->> 'content_id', '');
    if v_content_id = '' then
      continue;
    end if;
    v_incoming_ids := array_append(v_incoming_ids, v_content_id);

    insert into public.library_items (
      user_id, profile_id, content_id, content_type, name, poster, poster_shape,
      background, description, release_info, imdb_rating, genres, addon_base_url, added_at
    ) values (
      auth.uid(), p_profile_id, v_content_id,
      coalesce(v_item ->> 'content_type', ''),
      coalesce(v_item ->> 'name', ''),
      v_item ->> 'poster',
      coalesce(v_item ->> 'poster_shape', 'POSTER'),
      v_item ->> 'background',
      v_item ->> 'description',
      v_item ->> 'release_info',
      nullif(v_item ->> 'imdb_rating', '')::real,
      coalesce(
        (select array_agg(x) from jsonb_array_elements_text(coalesce(v_item -> 'genres', '[]'::jsonb)) as x),
        '{}'
      ),
      v_item ->> 'addon_base_url',
      coalesce((v_item ->> 'added_at')::bigint, 0)
    )
    on conflict (user_id, profile_id, content_id) do update set
      content_type = excluded.content_type,
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
      updated_at = now();
  end loop;

  delete from public.library_items
  where user_id = auth.uid() and profile_id = p_profile_id
    and not (content_id = any (v_incoming_ids));

  perform public.log_sync_invalidation(p_profile_id, 'library', p_origin_client_id);
end;
$$;

revoke all on function public.sync_pull_library(integer, integer, integer) from public;
revoke all on function public.sync_push_library(integer, jsonb, text) from public;

grant execute on function public.sync_pull_library(integer, integer, integer) to authenticated;
grant execute on function public.sync_push_library(integer, jsonb, text) to authenticated;
