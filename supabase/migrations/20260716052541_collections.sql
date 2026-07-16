-- Phase 2: collections (user-made folders/lists) — a single opaque JSON blob
-- per profile; the server doesn't need to understand its internal structure.
--
-- Client contract (composeApp/src/commonMain/.../CollectionSyncService.kt):
--   sync_pull_collections(p_profile_id) -> rows { profile_id, collections_json, updated_at }
--   sync_push_collections(p_profile_id, p_collections_json jsonb, p_origin_client_id) -> void

create table if not exists public.collections (
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id integer not null check (profile_id > 0),
  collections_json jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, profile_id)
);

alter table public.collections enable row level security;

drop policy if exists "collections_select_own" on public.collections;
create policy "collections_select_own"
  on public.collections for select to authenticated
  using (user_id = auth.uid());

drop trigger if exists collections_set_updated_at on public.collections;
create trigger collections_set_updated_at
  before update on public.collections
  for each row execute function public.set_updated_at();

create or replace function public.sync_pull_collections(p_profile_id integer)
returns setof public.collections
language sql
security definer
set search_path = public
stable
as $$
  select *
  from public.collections
  where user_id = auth.uid() and profile_id = p_profile_id;
$$;

create or replace function public.sync_push_collections(
  p_profile_id integer,
  p_collections_json jsonb,
  p_origin_client_id text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.collections (user_id, profile_id, collections_json)
  values (auth.uid(), p_profile_id, coalesce(p_collections_json, '[]'::jsonb))
  on conflict (user_id, profile_id) do update set
    collections_json = excluded.collections_json,
    updated_at = now();

  perform public.log_sync_invalidation(p_profile_id, 'collections', p_origin_client_id);
end;
$$;

revoke all on function public.sync_pull_collections(integer) from public;
revoke all on function public.sync_push_collections(integer, jsonb, text) from public;

grant execute on function public.sync_pull_collections(integer) to authenticated;
grant execute on function public.sync_push_collections(integer, jsonb, text) to authenticated;
