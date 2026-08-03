-- Registers authenticated Nuvio installations for device/session visibility.
--
-- Client contract (composeApp/src/commonMain/.../DeviceSessionRegistration.kt):
--   register_current_device(
--     p_installation_id,
--     p_client_name,
--     p_client_version,
--     p_platform,
--     p_device_name
--   ) -> void
--
-- The installation id is generated and persisted by the client. It is scoped to
-- the authenticated user so the same physical installation can be registered
-- independently after an account switch without exposing either account.

create table if not exists public.registered_devices (
  user_id uuid not null references auth.users(id) on delete cascade,
  installation_id text not null check (
    char_length(installation_id) between 1 and 255
  ),
  client_name text not null default '',
  client_version text not null default '',
  platform text not null default '',
  device_name text not null default '',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (user_id, installation_id)
);

create index if not exists registered_devices_last_seen_idx
  on public.registered_devices (user_id, last_seen_at desc);

alter table public.registered_devices enable row level security;

drop policy if exists "registered_devices_select_own" on public.registered_devices;
create policy "registered_devices_select_own"
  on public.registered_devices for select to authenticated
  using (user_id = auth.uid());

create or replace function public.register_current_device(
  p_installation_id text,
  p_client_name text,
  p_client_version text,
  p_platform text,
  p_device_name text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_installation_id text := btrim(coalesce(p_installation_id, ''));
begin
  if v_user_id is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;

  if v_installation_id = '' or char_length(v_installation_id) > 255 then
    raise exception 'Invalid installation id'
      using errcode = '22023';
  end if;

  insert into public.registered_devices (
    user_id,
    installation_id,
    client_name,
    client_version,
    platform,
    device_name
  ) values (
    v_user_id,
    v_installation_id,
    left(btrim(coalesce(p_client_name, '')), 255),
    left(btrim(coalesce(p_client_version, '')), 128),
    left(btrim(coalesce(p_platform, '')), 255),
    left(btrim(coalesce(p_device_name, '')), 255)
  )
  on conflict (user_id, installation_id) do update set
    client_name = excluded.client_name,
    client_version = excluded.client_version,
    platform = excluded.platform,
    device_name = excluded.device_name,
    last_seen_at = now();
end;
$$;

revoke all on table public.registered_devices from anon;
revoke insert, update, delete on table public.registered_devices from authenticated;
revoke all on function public.register_current_device(text, text, text, text, text) from public;

grant select on table public.registered_devices to authenticated;
grant execute on function public.register_current_device(text, text, text, text, text) to authenticated;
