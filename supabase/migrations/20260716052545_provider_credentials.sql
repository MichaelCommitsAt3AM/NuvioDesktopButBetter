-- Phase 2: provider credentials (currently just Trakt OAuth tokens), synced so
-- a second device doesn't need to re-authorize.
--
-- Client contract (composeApp/src/commonMain/.../trakt/TraktCredentialSync.kt):
--   sync_pull_provider_credentials(p_profile_id) -> rows { provider, credential_json, updated_at }
--   sync_push_provider_credentials(p_profile_id, p_credentials jsonb[], p_origin_client_id) -> void
--     (p_credentials is an array of { provider, credential_json }; upserts each)
--   sync_delete_provider_credentials(p_profile_id, p_provider, p_origin_client_id) -> void
--
-- credential_json holds OAuth access/refresh tokens in plaintext, same as any
-- JWT/session token Supabase itself stores — protected by RLS + DB access
-- control (HTTPS in transit), not column-level encryption.

create table if not exists public.provider_credentials (
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id integer not null check (profile_id > 0),
  provider text not null,
  credential_json jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, profile_id, provider)
);

alter table public.provider_credentials enable row level security;

drop policy if exists "provider_credentials_select_own" on public.provider_credentials;
create policy "provider_credentials_select_own"
  on public.provider_credentials for select to authenticated
  using (user_id = auth.uid());

drop trigger if exists provider_credentials_set_updated_at on public.provider_credentials;
create trigger provider_credentials_set_updated_at
  before update on public.provider_credentials
  for each row execute function public.set_updated_at();

create or replace function public.sync_pull_provider_credentials(p_profile_id integer)
returns setof public.provider_credentials
language sql
security definer
set search_path = public
stable
as $$
  select *
  from public.provider_credentials
  where user_id = auth.uid() and profile_id = p_profile_id;
$$;

create or replace function public.sync_push_provider_credentials(
  p_profile_id integer,
  p_credentials jsonb,
  p_origin_client_id text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_provider text;
begin
  if p_credentials is null then
    return;
  end if;

  for v_item in select * from jsonb_array_elements(p_credentials)
  loop
    v_provider := coalesce(v_item ->> 'provider', '');
    if v_provider = '' then
      continue;
    end if;

    insert into public.provider_credentials (user_id, profile_id, provider, credential_json)
    values (auth.uid(), p_profile_id, v_provider, coalesce(v_item -> 'credential_json', '{}'::jsonb))
    on conflict (user_id, profile_id, provider) do update set
      credential_json = excluded.credential_json,
      updated_at = now();
  end loop;

  perform public.log_sync_invalidation(p_profile_id, 'provider_credentials', p_origin_client_id);
end;
$$;

create or replace function public.sync_delete_provider_credentials(
  p_profile_id integer,
  p_provider text,
  p_origin_client_id text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.provider_credentials
  where user_id = auth.uid() and profile_id = p_profile_id and provider = p_provider;

  perform public.log_sync_invalidation(p_profile_id, 'provider_credentials', p_origin_client_id);
end;
$$;

revoke all on function public.sync_pull_provider_credentials(integer) from public;
revoke all on function public.sync_push_provider_credentials(integer, jsonb, text) from public;
revoke all on function public.sync_delete_provider_credentials(integer, text, text) from public;

grant execute on function public.sync_pull_provider_credentials(integer) to authenticated;
grant execute on function public.sync_push_provider_credentials(integer, jsonb, text) to authenticated;
grant execute on function public.sync_delete_provider_credentials(integer, text, text) to authenticated;
