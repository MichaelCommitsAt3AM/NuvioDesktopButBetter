-- Kids setup uses the signed-in account; ordinary profile PINs remain optional.
-- Keep p_guardian_pin in the signature for older clients; it is intentionally unused.
create or replace function public.guard_kids_profile() returns trigger language plpgsql set search_path=public as $$
begin
  if new.kids_enabled and (new.addon_sync_profile_id is not null or exists(select 1 from public.profiles where user_id=new.user_id and addon_sync_profile_id=new.profile_index)) then
    raise exception 'Kids profiles must manage add-ons independently';
  end if;
  if new.addon_sync_profile_id is not null and exists(select 1 from public.profiles where user_id=new.user_id and profile_index=new.addon_sync_profile_id and kids_enabled) then
    raise exception 'Cannot link add-ons to a kids profile';
  end if;
  return new;
end; $$;

create or replace function public.sync_set_kids_profile(
  p_profile_id integer, p_enabled boolean, p_max_rating text,
  p_service_url text, p_config_id text, p_guardian_pin text, p_origin_client_id text default null
) returns jsonb language plpgsql security definer set search_path=public,extensions as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_profile_id is null or p_profile_id not between 2 and 6 or p_max_rating is null or p_max_rating not in ('G','PG','PG-13') then raise exception 'Invalid kids profile'; end if;
  if not exists(select 1 from public.profiles where user_id=auth.uid() and profile_index=p_profile_id) then raise exception 'Profile not found'; end if;
  if p_enabled and (p_service_url is null or p_config_id is null or p_config_id !~ '^[A-Za-z0-9_-]{43}$') then raise exception 'Missing KidsScreen configuration'; end if;
  update public.profiles set kids_enabled=p_enabled,kids_max_rating=p_max_rating,
    kids_service_url=case when p_enabled then p_service_url else null end,
    kids_config_id=case when p_enabled then p_config_id else null end,updated_at=now()
    where user_id=auth.uid() and profile_index=p_profile_id;
  perform public.log_sync_invalidation(1,'profiles',p_origin_client_id);
  return jsonb_build_object('unlocked',true);
end; $$;
revoke all on function public.sync_set_kids_profile(integer,boolean,text,text,text,text,text) from public;
grant execute on function public.sync_set_kids_profile(integer,boolean,text,text,text,text,text) to authenticated;
