-- Phase 1: avatar catalog (read-only reference data for profile avatars).
--
-- Client contract (composeApp/src/commonMain/.../AvatarRepository.kt):
--   get_avatar_catalog() -> rows { id, display_name, storage_path, category,
--                                   sort_order, is_active, bg_color }
--
-- This is non-sensitive, non-user-scoped reference data, so it's readable by
-- both anon and authenticated (no RLS user filter needed) and there's no
-- sync_invalidations / delta pattern here.
--
-- NOTE: this migration only creates the table shape. It ships empty — no seed
-- rows and no images are included. Populate `avatar_catalog` with rows (and
-- upload the corresponding images to a Storage bucket referenced by
-- `storage_path`) separately; until then, get_avatar_catalog() returns [] and
-- profile creation will show no avatar choices.

create table if not exists public.avatar_catalog (
  id text primary key,
  display_name text not null default '',
  storage_path text not null default '',
  category text not null default 'character',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  bg_color text
);

alter table public.avatar_catalog enable row level security;

drop policy if exists "avatar_catalog_select_all" on public.avatar_catalog;
create policy "avatar_catalog_select_all"
  on public.avatar_catalog for select
  to authenticated, anon
  using (true);

create or replace function public.get_avatar_catalog()
returns setof public.avatar_catalog
language sql
security definer
set search_path = public
stable
as $$
  select *
  from public.avatar_catalog
  where is_active = true
  order by category, sort_order;
$$;

revoke all on function public.get_avatar_catalog() from public;
grant execute on function public.get_avatar_catalog() to authenticated, anon;
