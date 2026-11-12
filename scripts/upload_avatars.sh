#!/usr/bin/env bash
# Uploads supabase/assets/avatars/*.png to the public "avatars" Storage bucket.
# Run after applying migration 20261112120000_seed_avatar_catalog.sql.
#
#   SUPABASE_URL=https://<project>.supabase.co SUPABASE_SERVICE_ROLE_KEY=... scripts/upload_avatars.sh
#
# The service-role key stays in your environment; never commit it. Existing objects are overwritten.
set -euo pipefail

: "${SUPABASE_URL:?set SUPABASE_URL}"
: "${SUPABASE_SERVICE_ROLE_KEY:?set SUPABASE_SERVICE_ROLE_KEY}"
dir="$(cd "$(dirname "$0")/.." && pwd)/supabase/assets/avatars"
base="${SUPABASE_URL%/}/storage/v1/object"

count=0
for file in "$dir"/*.png; do
  name="$(basename "$file")"
  curl --fail-with-body -sS -o /dev/null -X POST \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Content-Type: image/png" \
    -H "Cache-Control: public, max-age=31536000, immutable" \
    -H "x-upsert: true" \
    --data-binary "@$file" "$base/avatars/$name"
  count=$((count + 1))
done
echo "Uploaded $count avatars to $base/public/avatars/"
