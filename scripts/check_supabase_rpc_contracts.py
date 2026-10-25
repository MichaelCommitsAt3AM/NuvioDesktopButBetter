#!/usr/bin/env python3
"""Fail when a literal Kotlin Supabase RPC has no migration definition."""

from __future__ import annotations

import re
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
KOTLIN_ROOT = REPO_ROOT / "composeApp" / "src"
MIGRATIONS_ROOT = REPO_ROOT / "supabase" / "migrations"

RPC_CALL = re.compile(r'\brpc\s*\(\s*(?:function\s*=\s*)?"([^"]+)"')
PARTY_CALL = re.compile(r'\bcall(?:WithProfile)?\s*\(\s*"(watch_party_[^"]+)"')

# RPCs that belong to an upstream feature this fork's Supabase backend does not host.
# The client code is kept (to minimise merge friction on upstream syncs) but the feature is
# gated off by ServerCapabilities (TV login, watch parties and media-server cloud sync).
# Re-home these into a migration and drop them from this set if that backend is ever built.
UPSTREAM_ONLY_RPCS = {
    "start_device_login_session",
    "poll_tv_login_session",
    # Watch parties and media-server cloud sync are gated by ServerCapabilities;
    # this fork does not deploy these services. Local server connections still work.
    "sync_pull_media_servers",
    "sync_push_media_servers",
    "watch_party_create", "watch_party_join", "watch_party_preview",
    "watch_party_heartbeat", "watch_party_update", "watch_party_leave",
    "watch_party_end", "watch_party_set_host_only", "watch_party_remove_member",
    "watch_party_clock", "watch_party_enabled",
    "watch_party_link_profile", "watch_party_send_message", "watch_party_list_messages",
}
SQL_FUNCTION = re.compile(
    r"""\bcreate\s+(?:or\s+replace\s+)?function\s+public\.([a-zA-Z_][a-zA-Z0-9_]*)""",
    re.IGNORECASE,
)


def collect_matches(root: Path, pattern: str, regex: re.Pattern[str]) -> set[str]:
    matches: set[str] = set()
    for path in root.rglob(pattern):
        if "build" in path.parts:
            continue
        matches.update(regex.findall(path.read_text(encoding="utf-8")))
    return matches


def main() -> int:
    rpc_calls = (collect_matches(KOTLIN_ROOT, "*.kt", RPC_CALL)
                 | collect_matches(REPO_ROOT / "desktop-bridge" / "src" / "main", "*.kt", RPC_CALL)
                 | collect_matches(KOTLIN_ROOT, "PartyApi.kt", PARTY_CALL)) - UPSTREAM_ONLY_RPCS
    sql_functions = collect_matches(MIGRATIONS_ROOT, "*.sql", SQL_FUNCTION)
    missing = sorted(rpc_calls - sql_functions)

    if missing:
        print("Supabase RPCs without migration definitions:", file=sys.stderr)
        for name in missing:
            print(f"  - {name}", file=sys.stderr)
        return 1

    print(
        f"Supabase RPC contract check passed: "
        f"{len(rpc_calls)} client RPCs, {len(sql_functions)} migration functions."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
