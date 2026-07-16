-- Phase 2: profiles + PIN locks.
--
-- Client contract (composeApp/src/commonMain/.../ProfileRepository.kt):
--   sync_pull_profiles() -> rows (NEVER includes pin_hash; exposes pin_enabled instead)
--   sync_push_profiles(p_client_max_profiles, p_profiles jsonb, p_origin_client_id) -> void
--     (full-replace-by-row semantics: client always sends its complete profile list;
--      each row is upserted by profile_index, existing rows absent from the payload
--      are left untouched — deletion is a separate dedicated RPC)
--   verify_profile_pin(p_profile_id, p_pin) -> { unlocked, retry_after_seconds, message }
--   set_profile_pin(p_profile_id, p_pin, p_current_pin?) -> void
--   clear_profile_pin(p_profile_id, p_current_pin?) -> void
--   clear_profile_pin_with_account_password(p_account_password, p_profile_id) -> void
--   sync_pull_profile_locks() -> rows { profile_index, pin_enabled, pin_locked_until }
--
-- sync_delete_profile_data (also called from ProfileRepository) is defined in the
-- profile_data_deletion migration, after every other profile-scoped table exists,
-- since deleting a profile must cascade across all of them.
--
-- PIN security: PINs are never stored or compared in plaintext. `pin_hash` uses
-- pgcrypto's bcrypt (crypt()/gen_salt('bf')). After 5 wrong attempts the profile
-- locks for 5 minutes (not specified by the client; chosen here as a reasonable
-- default — adjust if the original Nuvio backend used different numbers).
-- `profiles` has RLS enabled with NO policies at all: unlike other tables, there
-- is deliberately no SELECT policy, because Supabase auto-exposes any table with
-- an RLS policy to the REST API, and a policy here would let a direct table query
-- leak pin_hash. All access goes through the SECURITY DEFINER RPCs below, which
-- bypass RLS as the function owner and never select pin_hash into a client-facing
-- result.

create table if not exists public.profiles (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_index integer not null check (profile_index between 1 and 6),
  name text not null default '',
  avatar_color_hex text not null default '#1E88E5',
  avatar_id text,
  avatar_url text,
  uses_primary_addons boolean not null default false,
  uses_primary_plugins boolean not null default false,
  pin_hash text,
  pin_failed_attempts integer not null default 0,
  pin_locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, profile_index)
);

alter table public.profiles enable row level security;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.sync_pull_profiles()
returns table (
  id uuid,
  user_id uuid,
  profile_index integer,
  name text,
  avatar_color_hex text,
  avatar_id text,
  avatar_url text,
  uses_primary_addons boolean,
  uses_primary_plugins boolean,
  pin_enabled boolean,
  pin_locked_until timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    p.id, p.user_id, p.profile_index, p.name, p.avatar_color_hex, p.avatar_id, p.avatar_url,
    p.uses_primary_addons, p.uses_primary_plugins,
    (p.pin_hash is not null) as pin_enabled,
    p.pin_locked_until, p.created_at, p.updated_at
  from public.profiles p
  where p.user_id = auth.uid()
  order by p.profile_index;
$$;

create or replace function public.sync_push_profiles(
  p_client_max_profiles integer,
  p_profiles jsonb,
  p_origin_client_id text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_profile_index integer;
  v_name text;
  v_avatar_color_hex text;
  v_uses_primary_addons boolean;
  v_uses_primary_plugins boolean;
  v_avatar_id text;
  v_avatar_url text;
  v_incoming_count integer;
  v_existing_extra_count integer;
begin
  if p_profiles is null then
    return;
  end if;

  select count(*) into v_incoming_count from jsonb_array_elements(p_profiles);

  select count(*) into v_existing_extra_count
  from public.profiles
  where user_id = auth.uid()
    and profile_index not in (
      select coalesce((elem ->> 'profile_index')::integer, -1)
      from jsonb_array_elements(p_profiles) as elem
    );

  if (v_incoming_count + v_existing_extra_count) > greatest(p_client_max_profiles, 1) then
    raise exception 'Profile push exceeds max profiles (%)', p_client_max_profiles;
  end if;

  for v_item in select * from jsonb_array_elements(p_profiles)
  loop
    v_profile_index := (v_item ->> 'profile_index')::integer;
    if v_profile_index is null or v_profile_index < 1 or v_profile_index > 6 then
      continue;
    end if;
    v_name := coalesce(v_item ->> 'name', '');
    v_avatar_color_hex := coalesce(v_item ->> 'avatar_color_hex', '#1E88E5');
    v_uses_primary_addons := coalesce((v_item ->> 'uses_primary_addons')::boolean, false);
    v_uses_primary_plugins := coalesce((v_item ->> 'uses_primary_plugins')::boolean, false);
    v_avatar_id := v_item ->> 'avatar_id';
    v_avatar_url := v_item ->> 'avatar_url';

    insert into public.profiles (
      user_id, profile_index, name, avatar_color_hex, avatar_id, avatar_url,
      uses_primary_addons, uses_primary_plugins
    ) values (
      auth.uid(), v_profile_index, v_name, v_avatar_color_hex, v_avatar_id, v_avatar_url,
      v_uses_primary_addons, v_uses_primary_plugins
    )
    on conflict (user_id, profile_index) do update set
      name = excluded.name,
      avatar_color_hex = excluded.avatar_color_hex,
      avatar_id = excluded.avatar_id,
      avatar_url = excluded.avatar_url,
      uses_primary_addons = excluded.uses_primary_addons,
      uses_primary_plugins = excluded.uses_primary_plugins,
      updated_at = now();
  end loop;

  perform public.log_sync_invalidation(1, 'profiles', p_origin_client_id);
end;
$$;

create or replace function public.verify_profile_pin(p_profile_id integer, p_pin text)
returns table (unlocked boolean, retry_after_seconds integer, message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.profiles%rowtype;
  v_now timestamptz := now();
  v_attempts integer;
  v_locked_until timestamptz;
begin
  select * into v_row from public.profiles
  where user_id = auth.uid() and profile_index = p_profile_id
  for update;

  if not found then
    return query select false, 0, 'Profile not found';
    return;
  end if;

  if v_row.pin_hash is null then
    return query select true, 0, null::text;
    return;
  end if;

  if v_row.pin_locked_until is not null and v_row.pin_locked_until > v_now then
    return query select false, ceil(extract(epoch from (v_row.pin_locked_until - v_now)))::integer, 'Too many attempts. Try again later.';
    return;
  end if;

  if v_row.pin_hash = crypt(p_pin, v_row.pin_hash) then
    update public.profiles set pin_failed_attempts = 0, pin_locked_until = null
    where user_id = auth.uid() and profile_index = p_profile_id;
    return query select true, 0, null::text;
    return;
  end if;

  v_attempts := v_row.pin_failed_attempts + 1;
  v_locked_until := null;
  if v_attempts >= 5 then
    v_locked_until := v_now + interval '5 minutes';
    v_attempts := 0;
  end if;

  update public.profiles
    set pin_failed_attempts = v_attempts, pin_locked_until = v_locked_until
    where user_id = auth.uid() and profile_index = p_profile_id;

  if v_locked_until is not null then
    return query select false, ceil(extract(epoch from (v_locked_until - v_now)))::integer, 'Too many attempts. Try again later.';
  else
    return query select false, 0, 'Incorrect PIN.';
  end if;
end;
$$;

create or replace function public.set_profile_pin(
  p_profile_id integer,
  p_pin text,
  p_current_pin text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.profiles%rowtype;
begin
  select * into v_row from public.profiles
  where user_id = auth.uid() and profile_index = p_profile_id
  for update;

  if not found then
    raise exception 'Profile not found';
  end if;

  if v_row.pin_hash is not null then
    if p_current_pin is null or v_row.pin_hash <> crypt(p_current_pin, v_row.pin_hash) then
      raise exception 'Current PIN is incorrect';
    end if;
  end if;

  update public.profiles
    set pin_hash = crypt(p_pin, gen_salt('bf')),
        pin_failed_attempts = 0,
        pin_locked_until = null
    where user_id = auth.uid() and profile_index = p_profile_id;
end;
$$;

create or replace function public.clear_profile_pin(
  p_profile_id integer,
  p_current_pin text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.profiles%rowtype;
begin
  select * into v_row from public.profiles
  where user_id = auth.uid() and profile_index = p_profile_id
  for update;

  if not found then
    raise exception 'Profile not found';
  end if;

  if v_row.pin_hash is not null then
    if p_current_pin is null or v_row.pin_hash <> crypt(p_current_pin, v_row.pin_hash) then
      raise exception 'Current PIN is incorrect';
    end if;
  end if;

  update public.profiles
    set pin_hash = null, pin_failed_attempts = 0, pin_locked_until = null
    where user_id = auth.uid() and profile_index = p_profile_id;
end;
$$;

-- Reauthenticates against the account's Supabase Auth password (bcrypt hash
-- stored by GoTrue in auth.users.encrypted_password) rather than the PIN, so a
-- user who forgot their PIN can still clear it.
create or replace function public.clear_profile_pin_with_account_password(
  p_account_password text,
  p_profile_id integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_encrypted_password text;
begin
  select encrypted_password into v_encrypted_password
  from auth.users
  where id = auth.uid();

  if v_encrypted_password is null or v_encrypted_password <> crypt(p_account_password, v_encrypted_password) then
    raise exception 'Account password is incorrect';
  end if;

  update public.profiles
    set pin_hash = null, pin_failed_attempts = 0, pin_locked_until = null
    where user_id = auth.uid() and profile_index = p_profile_id;

  if not found then
    raise exception 'Profile not found';
  end if;
end;
$$;

create or replace function public.sync_pull_profile_locks()
returns table (profile_index integer, pin_enabled boolean, pin_locked_until timestamptz)
language sql
security definer
set search_path = public
stable
as $$
  select profile_index, (pin_hash is not null) as pin_enabled, pin_locked_until
  from public.profiles
  where user_id = auth.uid()
  order by profile_index;
$$;

revoke all on function public.sync_pull_profiles() from public;
revoke all on function public.sync_push_profiles(integer, jsonb, text) from public;
revoke all on function public.verify_profile_pin(integer, text) from public;
revoke all on function public.set_profile_pin(integer, text, text) from public;
revoke all on function public.clear_profile_pin(integer, text) from public;
revoke all on function public.clear_profile_pin_with_account_password(text, integer) from public;
revoke all on function public.sync_pull_profile_locks() from public;

grant execute on function public.sync_pull_profiles() to authenticated;
grant execute on function public.sync_push_profiles(integer, jsonb, text) to authenticated;
grant execute on function public.verify_profile_pin(integer, text) to authenticated;
grant execute on function public.set_profile_pin(integer, text, text) to authenticated;
grant execute on function public.clear_profile_pin(integer, text) to authenticated;
grant execute on function public.clear_profile_pin_with_account_password(text, integer) to authenticated;
grant execute on function public.sync_pull_profile_locks() to authenticated;
