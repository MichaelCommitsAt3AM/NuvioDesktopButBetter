# Nuvio self-hosted Supabase

The application backend is versioned in `supabase/migrations`. Client-visible
database changes must be delivered as new timestamped migrations; do not edit a
migration that may already have been applied to a self-hosted database.

## Local verification

Requirements:

- Supabase CLI
- A Docker-compatible runtime
- Python 3 for the static RPC contract check

Run the fast client/backend contract check:

```bash
python scripts/check_supabase_rpc_contracts.py
```

Rebuild a fresh local database and run the pgTAP suite:

```bash
supabase db reset
supabase test db
```

With the full local stack running, verify the actual PostgREST response shapes:

```bash
bash scripts/test-supabase-rpc-api.sh
```

Exercise the upgrade path from the pre-device/pre-library-delta schema with an
existing library row:

```bash
bash scripts/test-supabase-migration-upgrade.sh
```

The upgrade test works in a temporary copy of `supabase/` and removes its local
test stack on exit.

## Deploying to a self-hosted database

Always back up Postgres before deploying schema changes. Use a direct Postgres
connection string whose special characters are percent-encoded.

First compare the repository and database histories:

```bash
supabase migration list --db-url "$NUVIO_DATABASE_URL"
```

If the existing migrations were previously applied manually, reconcile the
`supabase_migrations.schema_migrations` history before continuing. A repair
changes migration history only; it does not apply SQL:

```bash
supabase migration repair \
  --db-url "$NUVIO_DATABASE_URL" \
  --status applied \
  <migration_timestamp>
```

Preview the pending migrations:

```bash
supabase db push --db-url "$NUVIO_DATABASE_URL" --dry-run
```

For the device-registration and library-delta rollout, the preview should show
only migrations that have not already been deployed, including:

- `20260731090000_registered_devices.sql`
- `20260731090001_library_delta_sync.sql`

Apply them:

```bash
supabase db push --db-url "$NUVIO_DATABASE_URL"
```

The library migration briefly replaces the `library_items` primary key and uses
a five-second lock timeout. Deploy during a low-traffic period. If the lock
cannot be acquired, the migration fails instead of waiting indefinitely.

## Post-deployment smoke checks

Using a non-production test account:

1. Sign in and confirm `register_current_device` succeeds.
2. Load the library and confirm the initial snapshot completes.
3. Add a movie or series and confirm another signed-in device receives it.
4. Delete it and confirm the deletion reaches the other device.
5. Confirm an older client can still call `sync_push_library`.

Do not prune `library_items_events`. Current clients persist their cursor and do
not yet have a cursor-expiration protocol that can force a new snapshot.

## Rollback

The preferred operational rollback is to roll back the application first. The
legacy `sync_push_library` RPC remains supported by the new schema.

Do not attempt to reverse the composite primary key on a live database after
movie/series duplicate IDs may have been stored. If a migration causes data
loss or schema corruption, restore the pre-deployment Postgres backup.
