-- Phase 0: shared conventions used by every sync_* feature migration that follows.
--
-- Pattern used throughout this project's sync backend:
--   * one "current state" table per feature (upserted, primary source for a full pull)
--   * one append-only "_events" table per feature (delta log; deletes need tombstones
--     because a deleted row simply disappears from the current-state table)
--   * a shared `sync_invalidations` table that every push/delete RPC writes a row to,
--     which Realtime broadcasts so other devices know which "surface" to re-pull.
--     Each device tags its own writes with `origin_client_id` so it can ignore its
--     own echo (see RealtimeSyncInvalidationService.kt / SyncClientIdentity.kt).
--
-- All sync_* RPCs are SECURITY DEFINER with `search_path` locked to `public`, derive
-- the acting user from `auth.uid()` (never a client-supplied user id), and are granted
-- to `authenticated` only. Data tables have RLS enabled with SELECT-only policies for
-- defense in depth; writes happen exclusively through the RPCs.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.sync_invalidations (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id integer not null check (profile_id > 0),
  surface text not null,
  origin_client_id text,
  created_at timestamptz not null default now()
);

create index if not exists sync_invalidations_user_created_idx
  on public.sync_invalidations (user_id, created_at desc);

alter table public.sync_invalidations enable row level security;

drop policy if exists "sync_invalidations_select_own" on public.sync_invalidations;
create policy "sync_invalidations_select_own"
  on public.sync_invalidations
  for select
  to authenticated
  using (user_id = auth.uid());

-- Register the table with Realtime so postgres_changes INSERT notifications work
-- once a client subscribes. Harmless while no client is subscribed (Phase 1).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'sync_invalidations'
  ) then
    alter publication supabase_realtime add table public.sync_invalidations;
  end if;
end $$;

-- Internal helper called by every sync_push_*/sync_delete_* RPC. Not exposed to
-- clients directly (no EXECUTE grant to authenticated/anon).
create or replace function public.log_sync_invalidation(
  p_profile_id integer,
  p_surface text,
  p_origin_client_id text
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.sync_invalidations (user_id, profile_id, surface, origin_client_id)
  values (auth.uid(), p_profile_id, p_surface, p_origin_client_id);
$$;

revoke all on function public.log_sync_invalidation(integer, text, text) from public;
