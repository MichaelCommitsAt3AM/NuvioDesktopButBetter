-- Phase 2: installed plugin repositories (full-build flavor only; see
-- composeApp/src/fullCommonMain/.../plugins/PluginRepository.kt). Same shape
-- and access pattern as addons: direct table SELECT for pull, RPC for push.
--
--   Pull: .from("plugins").select { eq("profile_id", p) ; order("sort_order") }
--   sync_push_plugins(p_profile_id, p_plugins jsonb, p_origin_client_id?) -> void
--     (full-replace, same pattern as addons/library. Note: the current client
--      call site doesn't pass p_origin_client_id, so it defaults to null.)

create table if not exists public.plugins (
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id integer not null check (profile_id > 0),
  url text not null,
  name text not null default '',
  enabled boolean not null default true,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, profile_id, url)
);

create index if not exists plugins_sort_order_idx
  on public.plugins (user_id, profile_id, sort_order);

alter table public.plugins enable row level security;

drop policy if exists "plugins_select_own" on public.plugins;
create policy "plugins_select_own"
  on public.plugins for select to authenticated
  using (user_id = auth.uid());

drop trigger if exists plugins_set_updated_at on public.plugins;
create trigger plugins_set_updated_at
  before update on public.plugins
  for each row execute function public.set_updated_at();

create or replace function public.sync_push_plugins(
  p_profile_id integer,
  p_plugins jsonb,
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
  if p_plugins is null then
    return;
  end if;

  for v_item in select * from jsonb_array_elements(p_plugins)
  loop
    v_url := coalesce(v_item ->> 'url', '');
    if v_url = '' then
      continue;
    end if;
    v_incoming_urls := array_append(v_incoming_urls, v_url);

    insert into public.plugins (user_id, profile_id, url, name, enabled, sort_order)
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

  delete from public.plugins
  where user_id = auth.uid() and profile_id = p_profile_id
    and not (url = any (v_incoming_urls));

  perform public.log_sync_invalidation(p_profile_id, 'plugins', p_origin_client_id);
end;
$$;

revoke all on function public.sync_push_plugins(integer, jsonb, text) from public;
grant execute on function public.sync_push_plugins(integer, jsonb, text) to authenticated;
