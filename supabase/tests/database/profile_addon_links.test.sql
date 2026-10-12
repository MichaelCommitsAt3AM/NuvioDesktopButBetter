begin;
select plan(1);
-- Exercise the same RPCs old Kotlin clients use, plus the explicit link RPC.
do $$
declare
  v_user uuid := 'b6817730-a241-481a-98d1-4a7a1f428920';
  v_other uuid := 'b6817730-a241-481a-98d1-4a7a1f428921';
  v_rows jsonb;
begin
  insert into auth.users(id) values(v_user), (v_other);
  perform set_config('request.jwt.claim.sub', v_user::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  insert into public.profiles(user_id, profile_index, name)
    values(v_user,1,'Main'),(v_user,2,'Family'),(v_user,3,'Kids'),(v_user,4,'Separate'),(v_other,5,'Other account');
  perform public.sync_push_addons(1,'[{"url":"https://one/manifest.json","name":"One","enabled":false,"sort_order":2}]');
  perform public.sync_push_addons(2,'[{"url":"https://old/manifest.json"}]');
  v_rows := public.sync_set_profile_addon_link(2,1);
  assert jsonb_array_length(v_rows) = 1, 'Returns authoritative initial snapshot';
  assert exists(select 1 from public.addons where user_id=v_user and profile_id=2 and name='One' and not enabled and sort_order=2), 'Initial replacement copies settings';
  assert not exists(select 1 from public.addons where user_id=v_user and profile_id=2 and url='https://old/manifest.json'), 'Does not merge old list';
  perform public.sync_set_profile_addon_link(3,2);
  perform public.sync_push_addons(3,'[{"url":"https://two/manifest.json","name":"Two","sort_order":0}]');
  assert (select count(*) from public.addons where user_id=v_user and url='https://two/manifest.json')=3, 'Changes from follower reach all members';
  assert not exists(select 1 from public.addons where user_id=v_user and url='https://one/manifest.json'), 'Removed addon disappears from every member';
  assert not exists(select 1 from public.addons where user_id=v_user and profile_id=4), 'Unrelated profile unchanged';
  perform public.sync_push_addons(1,'[]');
  assert not exists(select 1 from public.addons where user_id=v_user), 'Empty source list propagates';
  begin
    perform public.sync_set_profile_addon_link(2,3);
    raise exception 'Expected intermediate ancestor cycle rejection';
  exception when raise_exception then
    if sqlerrm <> 'A profile cannot link to itself or its descendants' then raise; end if;
  end;
  begin
    perform public.sync_set_profile_addon_link(4,5);
    raise exception 'Expected cross-account source rejection';
  exception when raise_exception then
    if sqlerrm <> 'Source profile does not exist' then raise; end if;
  end;
  perform public.sync_set_profile_addon_link(2,null);
  perform public.sync_push_addons(1,'[{"url":"https://main/manifest.json"}]');
  assert not exists(select 1 from public.addons where user_id=v_user and profile_id=2), 'Unlink isolates future edits';
  perform public.sync_push_addons(2,'[{"url":"https://family/manifest.json"}]');
  assert exists(select 1 from public.addons where user_id=v_user and profile_id=3 and url='https://family/manifest.json'), 'Unlinked branch keeps its followers';
  delete from public.profiles where user_id=v_user and profile_index=2;
  assert (select addon_sync_profile_id is null from public.profiles where user_id=v_user and profile_index=3), 'Deleting source detaches follower';
  assert exists(select 1 from public.addons where user_id=v_user and profile_id=3 and url='https://family/manifest.json'), 'Deleting source preserves follower list';
  insert into public.profiles(user_id,profile_index,name) values(v_user,2,'Replacement');
  perform public.sync_push_addons(2,'[{"url":"https://replacement/manifest.json"}]');
  assert not exists(select 1 from public.addons where user_id=v_user and profile_id=3 and url='https://replacement/manifest.json'), 'Reused slot does not resurrect link';
  assert not exists(select 1 from public.addons where user_id=v_other), 'No cross-account writes';
end;
$$;
select pass('profile addon linking, two-way updates, unlink, deletion, and account isolation');
select * from finish();
rollback;
