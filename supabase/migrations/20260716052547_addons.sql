-- Phase 2: installed addons.
--
-- Client contract (composeApp/src/commonMain/.../addons/AddonRepository.kt):
--   Pull is a DIRECT PostgREST table query (not an RPC):
--     .from("addons").select { eq("profile_id", p) ; order("sort_order") }
--   so, unlike every other feature so far, `addons` needs a real client-facing
--   SELECT RLS policy (not just defense-in-depth) — that policy IS the read path.
--   sync_push_addons(p_profile_id, p_addons jsonb, p_origin_client_id) -> void
--     (full-replace, same pattern as library)

create table if not exists public.addons (
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id integer not null check (profile_id > 0),
  url text not null,
  name text not null default '',
  enabled boolean not null default true,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, profile_id, url)
);

create index if not exists addons_sort_order_idx
  on public.addons (user_id, profile_id, sort_order);

alter table public.addons enable row level security;

drop policy if exists "addons_select_own" on public.addons;
create policy "addons_select_own"
  on public.addons for select to authenticated
  using (user_id = auth.uid());

drop trigger if exists addons_set_updated_at on public.addons;
create trigger addons_set_updated_at
  before update on public.addons
  for each row execute function public.set_updated_at();

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
begin
  if p_addons is null then
    return;
  end if;

  for v_item in select * from jsonb_array_elements(p_addons)
  loop
    v_url := coalesce(v_item ->> 'url', '');
    if v_url = '' then
      continue;
    end if;
    v_incoming_urls := array_append(v_incoming_urls, v_url);

    insert into public.addons (user_id, profile_id, url, name, enabled, sort_order)
    values (
      auth.uid(), p_profile_id, v_url,
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
  where user_id = auth.uid() and profile_id = p_profile_id
    and not (url = any (v_incoming_urls));

  perform public.log_sync_invalidation(p_profile_id, 'addons', p_origin_client_id);
end;
$$;

revoke all on function public.sync_push_addons(integer, jsonb, text) from public;
grant execute on function public.sync_push_addons(integer, jsonb, text) to authenticated;
