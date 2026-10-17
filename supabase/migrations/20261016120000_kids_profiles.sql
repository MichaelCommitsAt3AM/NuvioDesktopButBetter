-- Kids policy is separate from cosmetic pushes so older clients preserve it.
-- pgcrypto is installed in public on fresh databases and extensions on hosted Supabase.
alter function public.verify_profile_pin(integer,text) set search_path=public,extensions;
alter function public.set_profile_pin(integer,text,text) set search_path=public,extensions;
alter function public.clear_profile_pin(integer,text) set search_path=public,extensions;
alter function public.clear_profile_pin_with_account_password(text,integer) set search_path=public,extensions;
alter table public.profiles
  add column kids_enabled boolean not null default false,
  add column kids_max_rating text not null default 'G' check (kids_max_rating in ('G','PG','PG-13')),
  add column kids_service_url text,
  add column kids_config_id text;
alter table public.profiles add constraint kids_policy_complete check (
  not kids_enabled or (profile_index <> 1 and kids_service_url is not null and kids_config_id ~ '^[A-Za-z0-9_-]{43}$')
);

-- A protected primary profile must remain available while kids profiles exist.
create function public.guard_kids_profile() returns trigger language plpgsql set search_path=public as $$
begin
  if old.profile_index = 1 and new.pin_hash is null and exists(select 1 from public.profiles where user_id=new.user_id and kids_enabled) then
    raise exception 'Keep a parent PIN while kids profiles exist';
  end if;
  if new.kids_enabled and (new.addon_sync_profile_id is not null or exists(select 1 from public.profiles where user_id=new.user_id and addon_sync_profile_id=new.profile_index)) then
    raise exception 'Kids profiles must manage add-ons independently';
  end if;
  if new.addon_sync_profile_id is not null and exists(select 1 from public.profiles where user_id=new.user_id and profile_index=new.addon_sync_profile_id and kids_enabled) then
    raise exception 'Cannot link add-ons to a kids profile';
  end if;
  return new;
end; $$;
create trigger guard_kids_profile before update on public.profiles for each row execute function public.guard_kids_profile();

create function public.sync_set_kids_profile(
  p_profile_id integer, p_enabled boolean, p_max_rating text,
  p_service_url text, p_config_id text, p_guardian_pin text, p_origin_client_id text default null
) returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare guardian public.profiles%rowtype; attempts integer; locked timestamptz;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into guardian from public.profiles where user_id=auth.uid() and profile_index=1 for update;
  if guardian.pin_hash is null then return jsonb_build_object('unlocked',false,'message','Set a PIN on the main profile first'); end if;
  if guardian.pin_locked_until > now() then return jsonb_build_object('unlocked',false,'message','Parent PIN is temporarily locked'); end if;
  if p_guardian_pin is null or p_guardian_pin !~ '^[0-9]{4}$' or guardian.pin_hash <> crypt(p_guardian_pin,guardian.pin_hash) then
    attempts := guardian.pin_failed_attempts+1;
    locked := case when attempts >=5 then now()+interval '5 minutes' else null end;
    update public.profiles set pin_failed_attempts=case when attempts>=5 then 0 else attempts end,pin_locked_until=locked where id=guardian.id;
    return jsonb_build_object('unlocked',false,'message','Incorrect parent PIN');
  end if;
  update public.profiles set pin_failed_attempts=0,pin_locked_until=null where id=guardian.id;
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

drop function public.sync_pull_profiles();
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
  primary_addons_allowlist jsonb,
  addon_sync_profile_id integer,
  kids_enabled boolean,
  kids_max_rating text,
  kids_service_url text,
  kids_config_id text,
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
    p.uses_primary_addons, p.uses_primary_plugins, p.primary_addons_allowlist, p.addon_sync_profile_id,
    p.kids_enabled, p.kids_max_rating, p.kids_service_url, p.kids_config_id,
    (p.pin_hash is not null) as pin_enabled,
    p.pin_locked_until, p.created_at, p.updated_at
  from public.profiles p
  where p.user_id = auth.uid()
  order by p.profile_index;
$$;


revoke all on function public.sync_pull_profiles() from public;
grant execute on function public.sync_pull_profiles() to authenticated;
