begin;
select plan(1);
do $$
declare
  owner_id uuid := 'b6817730-a241-481a-98d1-4a7a1f428950';
  other_id uuid := 'b6817730-a241-481a-98d1-4a7a1f428951';
  result jsonb;
begin
  insert into auth.users(id) values(owner_id),(other_id);
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  insert into public.profiles(user_id,profile_index,name) values(owner_id,1,'Parent'),(owner_id,2,'Kids'),(other_id,2,'Other');
  result := public.sync_set_kids_profile(2,true,'PG','http://127.0.0.1:7879',repeat('a',43),null);
  assert (result->>'unlocked')::boolean, 'Kids setup succeeds without a parent PIN';
  assert (select pin_hash is null from public.profiles where user_id=owner_id and profile_index=1), 'No PIN is created implicitly';
  assert exists(select 1 from public.sync_pull_profiles() where profile_index=2 and kids_enabled and kids_max_rating='PG'), 'Policy syncs through profile pull';
  assert not (select kids_enabled from public.profiles where user_id=other_id and profile_index=2), 'Other account untouched';
  perform public.sync_push_profiles(6,'[{"profile_index":2,"name":"Renamed"}]');
  assert (select kids_enabled from public.profiles where user_id=owner_id and profile_index=2), 'Older cosmetic pushes preserve policy';
  perform public.set_profile_pin(1,'0123');
  perform public.clear_profile_pin(1,'0123');
  assert (select kids_enabled from public.profiles where user_id=owner_id and profile_index=2), 'Optional parent PIN can be removed without disabling kids policy';
  begin
    update public.profiles set addon_sync_profile_id=1 where user_id=owner_id and profile_index=2;
    raise exception 'Expected independent add-on enforcement';
  exception when raise_exception then
    if sqlerrm <> 'Kids profiles must manage add-ons independently' then raise; end if;
  end;
  result := public.sync_set_kids_profile(2,false,'PG',null,null,null);
  assert (result->>'unlocked')::boolean, 'Account can disable without a PIN';
  assert not (select kids_enabled from public.profiles where user_id=owner_id and profile_index=2), 'Policy disabled';
  perform set_config('request.jwt.claim.sub','',true);
  begin
    perform public.sync_set_kids_profile(2,true,'G','https://kids.example',repeat('a',43),null);
    raise exception 'Expected authentication requirement';
  exception when raise_exception then
    if sqlerrm <> 'Authentication required' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub',other_id::text,true);
  begin
    perform public.sync_set_kids_profile(1,true,'G','https://kids.example',repeat('a',43),null);
    raise exception 'Expected secondary-profile requirement';
  exception when raise_exception then
    if sqlerrm <> 'Invalid kids profile' then raise; end if;
  end;
  begin
    perform public.sync_set_kids_profile(3,true,'G','https://kids.example',repeat('a',43),null);
    raise exception 'Expected profile ownership check';
  exception when raise_exception then
    if sqlerrm <> 'Profile not found' then raise; end if;
  end;
  assert not exists(select 1 from pg_proc p,lateral aclexplode(p.proacl) a where p.oid='public.sync_set_kids_profile(integer,boolean,text,text,text,text,text)'::regprocedure and a.grantee=0 and a.privilege_type='EXECUTE'), 'Public execution denied';
end; $$;
select pass('Kids profile setup without mandatory PIN, persistence, account isolation and independent add-ons');
select * from finish();
rollback;
