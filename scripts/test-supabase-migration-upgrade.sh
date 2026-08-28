#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DEVICE_MIGRATION="20260731090000_registered_devices.sql"
# Every migration dated at or after DEVICE_MIGRATION is held back so the initial
# baseline sits at its predecessor's schema, then replayed below. Most of them
# don't touch what this test exercises (library_items/registered_devices) — they
# are held back purely to keep the DB's last-applied-migration timestamp behind
# DEVICE_MIGRATION, since `migration up` refuses to insert older-dated files
# once a newer one is already applied.
#
# Derived rather than hardcoded so adding a migration doesn't silently break
# this job: filenames are zero-padded timestamps, so a lexicographic compare is
# chronological.
mapfile -t HELD_BACK_MIGRATIONS < <(
  cd "$REPO_ROOT/supabase/migrations" && \
    ls -1 -- *.sql | awk -v cutoff="$DEVICE_MIGRATION" '$0 >= cutoff'
)

if [[ ${#HELD_BACK_MIGRATIONS[@]} -eq 0 ]]; then
  echo "Expected at least one migration at or after $DEVICE_MIGRATION" >&2
  exit 1
fi
TEMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/nuvio-supabase-upgrade.XXXXXX")"
TEMP_SUPABASE="$TEMP_ROOT/supabase"
DATABASE_CONTAINER="supabase_db_NuvioDesktop"

cleanup() {
  if [[ -d "$TEMP_SUPABASE" ]]; then
    (
      cd "$TEMP_ROOT"
      supabase stop --no-backup >/dev/null 2>&1 || true
    )
  fi

  case "$TEMP_ROOT" in
    "${TMPDIR:-/tmp}"/nuvio-supabase-upgrade.*)
      rm -rf -- "$TEMP_ROOT"
      ;;
    *)
      echo "Refusing to remove unexpected temporary path: $TEMP_ROOT" >&2
      ;;
  esac
}
trap cleanup EXIT

command -v supabase >/dev/null 2>&1 || {
  echo "supabase CLI is required" >&2
  exit 1
}

command -v docker >/dev/null 2>&1 || {
  echo "docker is required" >&2
  exit 1
}

cp -R "$REPO_ROOT/supabase" "$TEMP_SUPABASE"
for migration in "${HELD_BACK_MIGRATIONS[@]}"; do
  rm -f -- "$TEMP_SUPABASE/migrations/$migration"
done

cd "$TEMP_ROOT"
supabase db start

docker exec -i "$DATABASE_CONTAINER" \
  psql -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL'
insert into auth.users (id, email, raw_user_meta_data)
values (
  '20000000-0000-0000-0000-000000000001',
  'legacy-library-user@example.invalid',
  '{}'
);

insert into public.library_items (
  user_id,
  profile_id,
  content_id,
  content_type,
  name,
  genres,
  added_at
) values (
  '20000000-0000-0000-0000-000000000001',
  1,
  'pre-migration-item',
  'movie',
  'Pre-migration Item',
  array['Drama'],
  10
);
SQL

for migration in "${HELD_BACK_MIGRATIONS[@]}"; do
  cp -- "$REPO_ROOT/supabase/migrations/$migration" "$TEMP_SUPABASE/migrations/"
done

supabase migration up --local

docker exec -i "$DATABASE_CONTAINER" \
  psql -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL'
do $$
begin
  if not exists (
    select 1
    from public.library_items
    where user_id = '20000000-0000-0000-0000-000000000001'
      and profile_id = 1
      and content_id = 'pre-migration-item'
      and content_type = 'movie'
  ) then
    raise exception 'The library delta migration lost an existing row';
  end if;
end
$$;

select set_config(
  'request.jwt.claim.sub',
  '20000000-0000-0000-0000-000000000001',
  false
);

do $$
begin
  if public.sync_get_library_delta_cursor(1) <> 0 then
    raise exception 'Existing rows must bootstrap from snapshot with cursor zero';
  end if;
end
$$;

select public.sync_push_library_items(
  1,
  jsonb_build_array(
    jsonb_build_object(
      'content_id', 'post-migration-item',
      'content_type', 'series',
      'name', 'Post-migration Item',
      'genres', jsonb_build_array('Comedy'),
      'added_at', 20
    )
  ),
  'upgrade-test'
);

do $$
begin
  if (
    select count(*)
    from public.library_items
    where user_id = '20000000-0000-0000-0000-000000000001'
      and profile_id = 1
  ) <> 2 then
    raise exception 'Incremental push did not preserve the legacy snapshot row';
  end if;

  if (
    select count(*)
    from public.library_items_events
    where user_id = '20000000-0000-0000-0000-000000000001'
      and profile_id = 1
  ) <> 1 then
    raise exception 'Only the post-migration mutation should have an event';
  end if;
end
$$;
SQL

supabase test db
