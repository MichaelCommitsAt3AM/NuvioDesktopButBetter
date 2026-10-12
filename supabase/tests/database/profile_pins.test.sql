begin;
select plan(1);
do $$
declare
  v_user uuid := 'b6817730-a241-481a-98d1-4a7a1f428930';
  v_other uuid := 'b6817730-a241-481a-98d1-4a7a1f428931';
  v_schema text;
  v_password text;
  v_result record;
begin
  select n.nspname into v_schema from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='pgcrypto';
  execute format('select %I.crypt($1, %I.gen_salt(''bf''))', v_schema, v_schema) into v_password using 'account-password';
  insert into auth.users(id, encrypted_password) values(v_user, v_password), (v_other, v_password);
  insert into public.profiles(user_id, profile_index, name) values(v_user,1,'Main'),(v_other,2,'Other');
  perform set_config('request.jwt.claim.sub', v_user::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub',v_user,'role','authenticated')::text, true);
  begin
    perform public.set_profile_pin(1,'123');
    raise exception 'Expected invalid PIN rejection';
  exception when raise_exception then
    if sqlerrm <> 'Enter a four digit PIN.' then raise; end if;
  end;
  perform public.set_profile_pin(1,'0123');
  assert (select pin_hash is not null and pin_hash <> '0123' from public.profiles where user_id=v_user and profile_index=1), 'PIN is hashed';
  select * into v_result from public.verify_profile_pin(1,'0123');
  assert v_result.unlocked, 'Leading zero PIN works';
  for i in 1..5 loop
    select * into v_result from public.verify_profile_pin(1,'9999');
    assert not v_result.unlocked, 'Incorrect PIN rejected';
  end loop;
  assert v_result.retry_after_seconds=300, 'Five failures lock for five minutes';
  select * into v_result from public.verify_profile_pin(1,'0123');
  assert not v_result.unlocked and v_result.retry_after_seconds>0, 'Correct PIN cannot bypass lockout';
  begin
    perform public.clear_profile_pin(1,'0123');
    raise exception 'Expected lockout rejection';
  exception when raise_exception then
    if sqlerrm <> 'Too many attempts. Try again later.' then raise; end if;
  end;
  update public.profiles set pin_locked_until=now()-interval '1 second' where user_id=v_user;
  select * into v_result from public.verify_profile_pin(1,'0123');
  assert v_result.unlocked, 'Lockout expires';
  begin
    perform public.set_profile_pin(1,'4567','9999');
    raise exception 'Expected current PIN rejection';
  exception when raise_exception then
    if sqlerrm <> 'Current PIN is incorrect' then raise; end if;
  end;
  begin
    perform public.clear_profile_pin(1,'9999');
    raise exception 'Expected removal rejection';
  exception when raise_exception then
    if sqlerrm <> 'Current PIN is incorrect' then raise; end if;
  end;
  perform public.set_profile_pin(1,'4567','0123');
  select * into v_result from public.verify_profile_pin(1,'0123');
  assert not v_result.unlocked, 'Old PIN stops working';
  select * into v_result from public.verify_profile_pin(1,'4567');
  assert v_result.unlocked, 'Changed PIN works';
  perform public.clear_profile_pin(1,'4567');
  assert (select pin_hash is null and pin_failed_attempts=0 and pin_locked_until is null from public.profiles where user_id=v_user), 'Removal resets lock state';
  perform public.set_profile_pin(1,'0123');
  begin
    perform public.clear_profile_pin_with_account_password('wrong',1);
    raise exception 'Expected password rejection';
  exception when raise_exception then
    if sqlerrm <> 'Account password is incorrect' then raise; end if;
  end;
  assert (select pin_hash is not null from public.profiles where user_id=v_user), 'Wrong password does not clear PIN';
  update public.profiles set pin_locked_until=now()+interval '5 minutes' where user_id=v_user;
  perform public.clear_profile_pin_with_account_password('account-password',1);
  assert (select pin_hash is null and pin_locked_until is null from public.profiles where user_id=v_user), 'Password recovery works during lockout';
  select * into v_result from public.verify_profile_pin(2,'0123');
  assert not v_result.unlocked and v_result.message='Profile not found', 'Other accounts are isolated';
  begin
    perform public.set_profile_pin(2,'0123');
    raise exception 'Expected cross-account rejection';
  exception when raise_exception then
    if sqlerrm <> 'Profile not found' then raise; end if;
  end;
  assert has_function_privilege('authenticated','public.verify_profile_pin(integer,text)','execute'), 'Signed-in access retained';
  assert not exists(select 1 from pg_proc p, lateral aclexplode(p.proacl) a where p.oid='public.verify_profile_pin(integer,text)'::regprocedure and a.grantee=0 and a.privilege_type='EXECUTE'), 'Public execution denied';
end;
$$;
select pass('PIN setup, change, removal, verification, lockout, recovery and account isolation');
select * from finish();
rollback;
