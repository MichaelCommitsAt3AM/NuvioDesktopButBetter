#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$(mktemp "${TMPDIR:-/tmp}/nuvio-supabase-api.XXXXXX")"

cleanup() {
  rm -f -- "$ENV_FILE"
}
trap cleanup EXIT

command -v supabase >/dev/null 2>&1 || {
  echo "supabase CLI is required" >&2
  exit 1
}

command -v python3 >/dev/null 2>&1 || {
  echo "python3 is required" >&2
  exit 1
}

ready=false
for _ in $(seq 1 30); do
  if supabase status -o env >"$ENV_FILE" 2>/dev/null; then
    ready=true
    break
  fi
  sleep 2
done

if [[ "$ready" != true ]]; then
  echo "Local Supabase did not become healthy within 60 seconds" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

cd "$REPO_ROOT"
python3 scripts/test_supabase_rpc_api.py
