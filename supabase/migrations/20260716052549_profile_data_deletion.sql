-- Phase 2: sync_delete_profile_data — deletes a profile AND every row scoped
-- to it across all features. profile_id/profile_index are plain integers with
-- no FK relationships between feature tables (each table is independently
-- scoped by (user_id, profile_id)), so nothing cascades automatically; this
-- must be listed explicitly and kept in sync if a future feature adds another
-- profile-scoped table. Placed last so every referenced table already exists.
--
-- Client contract (composeApp/src/commonMain/.../ProfileRepository.kt):
--   sync_delete_profile_data(p_profile_id, p_origin_client_id) -> void

create or replace function public.sync_delete_profile_data(
  p_profile_id integer,
  p_origin_client_id text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.watch_progress where user_id = auth.uid() and profile_id = p_profile_id;
  delete from public.watch_progress_events where user_id = auth.uid() and profile_id = p_profile_id;
  delete from public.watched_items where user_id = auth.uid() and profile_id = p_profile_id;
  delete from public.watched_items_events where user_id = auth.uid() and profile_id = p_profile_id;
  delete from public.library_items where user_id = auth.uid() and profile_id = p_profile_id;
  delete from public.collections where user_id = auth.uid() and profile_id = p_profile_id;
  delete from public.home_catalog_settings where user_id = auth.uid() and profile_id = p_profile_id;
  delete from public.profile_settings_blob where user_id = auth.uid() and profile_id = p_profile_id;
  delete from public.provider_credentials where user_id = auth.uid() and profile_id = p_profile_id;
  delete from public.addons where user_id = auth.uid() and profile_id = p_profile_id;
  delete from public.plugins where user_id = auth.uid() and profile_id = p_profile_id;
  delete from public.profiles where user_id = auth.uid() and profile_index = p_profile_id;

  perform public.log_sync_invalidation(p_profile_id, 'profiles', p_origin_client_id);
end;
$$;

revoke all on function public.sync_delete_profile_data(integer, text) from public;
grant execute on function public.sync_delete_profile_data(integer, text) to authenticated;
