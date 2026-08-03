begin;

select plan(41);

select has_table(
  'public',
  'registered_devices',
  'registered_devices table exists'
);

select has_table(
  'public',
  'library_items_events',
  'library_items_events table exists'
);

select has_function(
  'public',
  'register_current_device',
  array['text', 'text', 'text', 'text', 'text'],
  'register_current_device has the client-visible signature'
);

select has_function(
  'public',
  'sync_get_library_delta_cursor',
  array['integer'],
  'library cursor RPC exists'
);

select has_function(
  'public',
  'sync_pull_library_delta',
  array['integer', 'bigint', 'integer'],
  'library delta pull RPC exists'
);

select has_function(
  'public',
  'sync_push_library_items',
  array['integer', 'jsonb', 'text'],
  'incremental library push RPC exists'
);

select has_function(
  'public',
  'sync_delete_library_items',
  array['integer', 'jsonb', 'text'],
  'incremental library delete RPC exists'
);

select has_function(
  'public',
  'sync_push_library',
  array['integer', 'jsonb', 'text'],
  'legacy full-snapshot library RPC remains available'
);

select col_is_pk(
  'public',
  'library_items',
  array['user_id', 'profile_id', 'content_id', 'content_type'],
  'library identity includes content type'
);

select is(
  has_function_privilege(
    'anon',
    'public.register_current_device(text,text,text,text,text)',
    'EXECUTE'
  ),
  false,
  'anonymous clients cannot register devices'
);

select is(
  has_function_privilege(
    'authenticated',
    'public.register_current_device(text,text,text,text,text)',
    'EXECUTE'
  ),
  true,
  'authenticated clients can register devices'
);

select is(
  has_function_privilege(
    'anon',
    'public.sync_get_library_delta_cursor(integer)',
    'EXECUTE'
  ),
  false,
  'anonymous clients cannot read library cursors'
);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('10000000-0000-0000-0000-000000000001', 'library-user-1@example.invalid', '{}'),
  ('10000000-0000-0000-0000-000000000002', 'library-user-2@example.invalid', '{}');

select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000001',
  true
);

select is(
  public.sync_get_library_delta_cursor(1),
  0::bigint,
  'a migrated profile begins with cursor zero and needs no event backfill'
);

select lives_ok(
  $$
    select public.register_current_device(
      'installation-1',
      'Nuvio Desktop',
      '1.0.0',
      'Windows 11',
      'Living Room PC'
    )
  $$,
  'a signed-in user can register a device'
);

select lives_ok(
  $$
    select public.register_current_device(
      'installation-1',
      'Nuvio Desktop',
      '1.1.0',
      'Windows 11',
      'Living Room PC'
    )
  $$,
  're-registering the same installation updates it'
);

select is(
  (
    select count(*)
    from public.registered_devices
    where user_id = '10000000-0000-0000-0000-000000000001'
      and installation_id = 'installation-1'
  ),
  1::bigint,
  'device registration is an upsert'
);

select is(
  (
    select client_version
    from public.registered_devices
    where user_id = '10000000-0000-0000-0000-000000000001'
      and installation_id = 'installation-1'
  ),
  '1.1.0',
  'device metadata is refreshed'
);

select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000002',
  true
);

select lives_ok(
  $$
    select public.register_current_device(
      'installation-2',
      'Nuvio Mobile',
      '2.0.0',
      'Android 16',
      'Phone'
    )
  $$,
  'a second user can register an independent device'
);

select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000001',
  true
);

set local role authenticated;

select is(
  (select count(*) from public.registered_devices),
  1::bigint,
  'registered_devices RLS exposes only the current user'
);

reset role;

select lives_ok(
  $$
    select public.sync_push_library_items(
      1,
      jsonb_build_array(
        jsonb_build_object(
          'content_id', 'shared-id',
          'content_type', 'movie',
          'name', 'Shared Movie',
          'genres', jsonb_build_array('Drama'),
          'added_at', 100
        ),
        jsonb_build_object(
          'content_id', 'shared-id',
          'content_type', 'series',
          'name', 'Shared Series',
          'genres', jsonb_build_array('Drama'),
          'added_at', 101
        )
      ),
      'test-client'
    )
  $$,
  'incremental push accepts two content types with the same id'
);

select is(
  (
    select count(*)
    from public.library_items
    where user_id = '10000000-0000-0000-0000-000000000001'
      and profile_id = 1
  ),
  2::bigint,
  'composite library identity preserves both rows'
);

select is(
  (
    select count(*)
    from public.library_items_events
    where user_id = '10000000-0000-0000-0000-000000000001'
      and profile_id = 1
  ),
  2::bigint,
  'each applied incremental upsert appends an event'
);

select ok(
  public.sync_get_library_delta_cursor(1) > 0,
  'cursor advances after applied mutations'
);

select ok(
  exists (
    select 1
    from public.sync_invalidations
    where user_id = '10000000-0000-0000-0000-000000000001'
      and profile_id = 1
      and surface = 'library'
      and origin_client_id = 'test-client'
  ),
  'incremental push records its origin client id'
);

select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000002',
  true
);

select lives_ok(
  $$
    select public.sync_push_library_items(
      1,
      jsonb_build_array(
        jsonb_build_object(
          'content_id', 'other-user-item',
          'content_type', 'movie',
          'name', 'Other User Item',
          'genres', jsonb_build_array(),
          'added_at', 200
        )
      ),
      'other-client'
    )
  $$,
  'another user can maintain an isolated library'
);

select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000001',
  true
);

set local role authenticated;

select is(
  (select count(*) from public.library_items_events),
  2::bigint,
  'library event RLS hides another user events'
);

reset role;

create temporary table test_library_cursor (
  cursor_value bigint not null
) on commit drop;

insert into test_library_cursor (cursor_value)
values (public.sync_get_library_delta_cursor(1));

select lives_ok(
  $$
    select public.sync_push_library_items(
      1,
      jsonb_build_array(
        jsonb_build_object(
          'content_id', 'shared-id',
          'content_type', 'movie',
          'name', 'Shared Movie',
          'genres', jsonb_build_array('Drama'),
          'added_at', 100
        ),
        jsonb_build_object(
          'content_id', 'shared-id',
          'content_type', 'series',
          'name', 'Shared Series',
          'genres', jsonb_build_array('Drama'),
          'added_at', 101
        )
      ),
      'test-client'
    )
  $$,
  'replaying an identical incremental push succeeds'
);

select is(
  public.sync_get_library_delta_cursor(1),
  (select cursor_value from test_library_cursor),
  'an identical upsert does not create redundant events'
);

select is(
  (
    select count(*)
    from public.sync_pull_library_delta(1, 0, 500)
  ),
  2::bigint,
  'delta pull returns the complete ordered event set'
);

select lives_ok(
  $$
    select public.sync_delete_library_items(
      1,
      jsonb_build_array(
        jsonb_build_object(
          'content_id', 'shared-id',
          'content_type', 'series'
        )
      ),
      'test-client'
    )
  $$,
  'incremental delete removes a composite library key'
);

select is(
  (
    select count(*)
    from public.library_items
    where user_id = '10000000-0000-0000-0000-000000000001'
      and profile_id = 1
  ),
  1::bigint,
  'incremental delete removes only the requested content type'
);

select is(
  (
    select operation
    from public.library_items_events
    where user_id = '10000000-0000-0000-0000-000000000001'
      and profile_id = 1
    order by event_id desc
    limit 1
  ),
  'delete',
  'incremental delete appends a tombstone'
);

truncate table test_library_cursor;
insert into test_library_cursor (cursor_value)
values (public.sync_get_library_delta_cursor(1));

select lives_ok(
  $$
    select public.sync_delete_library_items(
      1,
      jsonb_build_array(
        jsonb_build_object(
          'content_id', 'missing',
          'content_type', 'movie'
        )
      ),
      'test-client'
    )
  $$,
  'deleting an absent key is harmless'
);

select is(
  public.sync_get_library_delta_cursor(1),
  (select cursor_value from test_library_cursor),
  'deleting an absent key does not append an event'
);

select lives_ok(
  $$
    select public.sync_push_library(
      1,
      jsonb_build_array(
        jsonb_build_object(
          'content_id', 'legacy-item',
          'content_type', 'movie',
          'name', 'Legacy Item',
          'genres', jsonb_build_array('Comedy'),
          'added_at', 300
        )
      ),
      'legacy-client'
    )
  $$,
  'legacy full-snapshot push remains callable'
);

select is(
  (
    select string_agg(content_id || ':' || content_type, ',' order by content_id, content_type)
    from public.library_items
    where user_id = '10000000-0000-0000-0000-000000000001'
      and profile_id = 1
  ),
  'legacy-item:movie',
  'legacy full-snapshot push retains replacement semantics'
);

select ok(
  exists (
    select 1
    from public.library_items_events
    where user_id = '10000000-0000-0000-0000-000000000001'
      and profile_id = 1
      and operation = 'upsert'
      and content_id = 'legacy-item'
  )
  and exists (
    select 1
    from public.library_items_events
    where user_id = '10000000-0000-0000-0000-000000000001'
      and profile_id = 1
      and operation = 'delete'
      and content_id = 'shared-id'
      and content_type = 'movie'
  ),
  'legacy writes are represented in current-client delta history'
);

select lives_ok(
  $$ select public.sync_delete_profile_data(1, 'test-client') $$,
  'profile deletion remains callable after adding event history'
);

select is(
  (
    select count(*)
    from public.library_items
    where user_id = '10000000-0000-0000-0000-000000000001'
      and profile_id = 1
  ) + (
    select count(*)
    from public.library_items_events
    where user_id = '10000000-0000-0000-0000-000000000001'
      and profile_id = 1
  ),
  0::bigint,
  'profile deletion removes library state and event history'
);

insert into public.library_items_events (
  user_id,
  profile_id,
  operation,
  content_id,
  content_type
)
select
  '10000000-0000-0000-0000-000000000001',
  2,
  'upsert',
  'bulk-' || value,
  'movie'
from generate_series(1, 501) as value;

select is(
  (
    select count(*)
    from public.sync_pull_library_delta(2, 0, 500)
  ),
  500::bigint,
  'library delta pull enforces the requested page size'
);

select is(
  (
    with first_page as (
      select event_id
      from public.sync_pull_library_delta(2, 0, 500)
    )
    select count(*)
    from public.sync_pull_library_delta(
      2,
      (select max(event_id) from first_page),
      500
    )
  ),
  1::bigint,
  'the next cursor page returns the remaining event'
);

select * from finish();
rollback;
