-- Repair PIN hashing without moving pgcrypto or weakening the RPC search_path.
-- Keep signatures compatible with the Kotlin build; broadcasts refresh other devices.
do $migration$
declare v_crypto_schema text;
begin
  select n.nspname into v_crypto_schema from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pgcrypto';
  if v_crypto_schema is null then raise exception 'pgcrypto is required for profile PINs'; end if;
  execute replace($definition$create or replace function public.verify_profile_pin(p_profile_id integer, p_pin text)
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

  if p_pin is null or p_pin !~ '^[0-9]{4}$' then
    return query select false, 0, 'Enter a four digit PIN.';
    return;
  end if;

  if v_row.pin_hash = __CRYPTO__.crypt(p_pin, v_row.pin_hash) then
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

$definition$, '__CRYPTO__', quote_ident(v_crypto_schema));
  execute replace($definition$create or replace function public.set_profile_pin(
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

  if v_row.pin_locked_until > now() then
    raise exception 'Too many attempts. Try again later.';
  end if;

  if v_row.pin_hash is not null then
    if p_current_pin is null or v_row.pin_hash <> __CRYPTO__.crypt(p_current_pin, v_row.pin_hash) then
      raise exception 'Current PIN is incorrect';
    end if;
  end if;

  if p_pin is null or p_pin !~ '^[0-9]{4}$' then
    raise exception 'Enter a four digit PIN.';
  end if;

  update public.profiles
    set pin_hash = __CRYPTO__.crypt(p_pin, __CRYPTO__.gen_salt('bf')),
        pin_failed_attempts = 0,
        pin_locked_until = null
    where user_id = auth.uid() and profile_index = p_profile_id;
  perform public.log_sync_invalidation(1, 'profiles', null);
end;
$$;

$definition$, '__CRYPTO__', quote_ident(v_crypto_schema));
  execute replace($definition$create or replace function public.clear_profile_pin(
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

  if v_row.pin_locked_until > now() then
    raise exception 'Too many attempts. Try again later.';
  end if;

  if v_row.pin_hash is not null then
    if p_current_pin is null or v_row.pin_hash <> __CRYPTO__.crypt(p_current_pin, v_row.pin_hash) then
      raise exception 'Current PIN is incorrect';
    end if;
  end if;

  update public.profiles
    set pin_hash = null, pin_failed_attempts = 0, pin_locked_until = null
    where user_id = auth.uid() and profile_index = p_profile_id;
  perform public.log_sync_invalidation(1, 'profiles', null);
end;
$$;

-- Reauthenticates against the account's Supabase Auth password (bcrypt hash
-- stored by GoTrue in auth.users.encrypted_password) rather than the PIN, so a
-- user who forgot their PIN can still clear it.
$definition$, '__CRYPTO__', quote_ident(v_crypto_schema));
  execute replace($definition$create or replace function public.clear_profile_pin_with_account_password(
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

  if nullif(p_account_password, '') is null or nullif(v_encrypted_password, '') is null or v_encrypted_password <> __CRYPTO__.crypt(p_account_password, v_encrypted_password) then
    raise exception 'Account password is incorrect';
  end if;

  update public.profiles
    set pin_hash = null, pin_failed_attempts = 0, pin_locked_until = null
    where user_id = auth.uid() and profile_index = p_profile_id;

  if not found then
    raise exception 'Profile not found';
  end if;
  perform public.log_sync_invalidation(1, 'profiles', null);
end;
$$;

$definition$, '__CRYPTO__', quote_ident(v_crypto_schema));
end;
$migration$;

revoke all on function public.verify_profile_pin(integer, text) from public;
revoke all on function public.set_profile_pin(integer, text, text) from public;
revoke all on function public.clear_profile_pin(integer, text) from public;
revoke all on function public.clear_profile_pin_with_account_password(text, integer) from public;
grant execute on function public.verify_profile_pin(integer, text) to authenticated;
grant execute on function public.set_profile_pin(integer, text, text) to authenticated;
grant execute on function public.clear_profile_pin(integer, text) to authenticated;
grant execute on function public.clear_profile_pin_with_account_password(text, integer) to authenticated;
