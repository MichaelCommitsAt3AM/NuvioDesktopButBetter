# Syncing the desktop rewrite with upstream

This is the operational runbook for future sessions. React/TypeScript + Tauri is
the permanent desktop frontend. Kotlin remains the authoritative backend and
native player. The rewrite remains incomplete: fix discovered implementation gaps
in the affected flows rather than treating compilation or inventories as parity.
Read `AGENTS.md` first. The first trial is recorded in
[UPSTREAM_SYNC_2026-10-18.md](UPSTREAM_SYNC_2026-10-18.md).

## 1. Establish the starting state

Work from the repository root. In PowerShell:

```powershell
git status --short --branch
git branch -vv
git remote -v
git fetch origin
git fetch upstream
Get-Content desktop-bridge/contract/upstream-baseline.json
```

Start with a clean worktree. Review and commit existing authorized changes first;
never discard someone else's work to make a sync easier. Determine which branch
actually contains the rewrite. During the first sync it was
`feature/react-tauri-desktop-rewrite`, while `origin/HEAD` pointed to legacy `Dev`.
Do not assume the remote default is the right integration base. Check whether
origin has newer rewrite commits and reconcile them before proceeding.

The tracked `upstream-baseline.json` records the last integrated upstream commit,
independently of the fork release version. Verify it is an ancestor of the rewrite
tip with `git merge-base --is-ancestor <previous-upstream-sha> <rewrite-branch>`.
For the first sync, before this file existed, `git merge-base HEAD upstream/Dev`
identified `d4bdf2588d46a4db7131e105efe6bd7576944a1b`; inspect merge history if there
is ambiguity. Do not use the old UI inventory's historical baseline as proof of
which upstream commit was integrated.

On Windows, if Git reports filename-too-long errors for internal checkpoint refs,
use repository-local `git config core.longpaths true`; do not delete checkpoint
refs or change unrelated global settings to make commits work.

## 2. Pin and review the upstream batch

```powershell
git rev-parse upstream/Dev
git log --first-parent --oneline <previous-upstream-sha>..<target-sha>
git diff --stat <previous-upstream-sha> <target-sha>
git diff --name-status <previous-upstream-sha> <target-sha>
```

Choose a release or exact commit and record its full SHA. Review that fixed range
throughout the sync, even if upstream moves. Prefer small release-sized batches;
urgent fixes can be integrated sooner. Use the commit list and file diff together:
mobile merges can introduce desktop-relevant backend changes under common sources.

Create a short-lived branch from the latest rewrite, using a separate worktree if
useful. Substitute real branch names and SHAs for placeholders:

```powershell
git switch <rewrite-branch>
git switch -c codex/sync-upstream-<release-or-date>
git merge --no-commit --no-ff <target-sha>
git diff --name-only --diff-filter=U
```

Normal merge ancestry is essential. Do not replace shared directories, import
only a snapshot of upstream files, or squash/rebase away the upstream merge.

## 3. Resolve conflicts and audit automatic merges

Review each conflict and combine both intended behaviors. Neither blanket ours
nor blanket theirs is an acceptable resolution. A whole-file choice is reasonable
only after reviewing the upstream delta and explaining why it is inapplicable.

| Area | Required treatment |
| --- | --- |
| Kotlin repositories/models/storage | Integrate upstream behavior in place; repair bridge adapters instead of duplicating business rules in React/Rust. |
| Compose presentation | Keep source as a reference. Port relevant interactions and states to React deliberately; identical visual design is not required. |
| Native player | Used by the rewrite. Audit Kotlin declarations, injected function types/call sites, JNI signatures, native implementations and resource lists together. |
| Profile/account lifecycle | Preserve fork kids/add-on policies and defaults while adding upstream repository initialization, profile resets and cleanup. |
| Reactive lifecycle | Compare upstream `MainAppContent` effects with bridge observers. New repositories need subscriptions and refresh/invalidation wiring, not just RPC methods. |
| Build/release | Preserve the fork Gradle hook, Tauri package matrix, private Java runtime, updater signing and MSI upgrade identity. Review upstream requirements individually. |
| Versions | Keep the fork's version/build code during the merge. Upstream may have a lower code. Do the normal separate version-bump commit later with `set-version.sh`; never hand-edit version values. |
| Supabase | Inventory new RPCs and service dependencies. Missing services require a forward migration or an explicit disabled/deferred capability; never silently invoke absent RPCs during ordinary profile sync. |
| Mobile targets | Retain upstream changes where appropriate; do not build or repair mobile targets from this desktop-only tree. |

Audit automatic merges as carefully as conflicts. The first sync merged a native
constructor call without a conflict but left its default lambda with too few
parameters. Preserve fork-specific Windows cross-DPI WebView2 profiles, initial
presentation acknowledgement, sizing/PiP behavior, subtitle-off intent, cache
budgets and bounded image workers when upstream edits the same code.

For each meaningful change, record **implemented**, **already covered**,
**reference/mobile-only**, or **deferred** in the batch report. Explain dependencies
for deferred work and add understood remaining bugs to `KNOWN_ISSUES.md`.

Commit the resolved upstream merge before the bridge/React adaptation commits.
The merge checkpoint can be temporarily incomplete; it must not be promoted to
the rewrite development branch until subsequent fixes and required checks pass.

## 4. Adapt the bridge and React frontend

Use `desktop-bridge/contract/schema.json` as the protocol boundary. Expose explicit
snapshot fields and commands, add runtime dispatch/events and initial snapshots,
and map the new behavior into React. Keep credentials/tokens and sensitive stream
URLs out of snapshots. Route new methods through the existing kids authorization
and media-verification boundaries. Check profile changes, stale requests, loading,
empty/error states, defaults, navigation and native playback.

Review UI changes before accepting a new inventory. Update
`desktop-bridge/contract/upstream-baseline.json` with full previous/target SHAs,
rewrite base, merge commit and the batch report path. Then run:

```powershell
node scripts/desktop-ui/sync-methods.mjs
node scripts/desktop-ui/generate-contract.mjs
node scripts/desktop-ui/generate-locales.mjs
node scripts/desktop-ui/inventory-parity.mjs
node scripts/desktop-ui/generate-contract.mjs --check
node scripts/desktop-ui/generate-locales.mjs --check
node scripts/desktop-ui/inventory-parity.mjs --check
```

Repeated generation exposed intermittent Windows write-sharing errors on unchanged
outputs. Contract/validator generators now skip identical content; keep generation
steps sequential and inspect their own exits if this recurs.

`sync-methods.mjs` updates method/topic enums and the Rust allowlist; it does not
prove that request/response shapes or feature wiring are complete. Review generated
diffs. The UI inventory hashes original source; regeneration acknowledges review,
not parity acceptance. Source hashing normalizes CRLF to LF, so a Windows
checkout and a Linux/macOS checkout produce the same checkpoint. Do not refresh
it solely to silence a failing check.

## 5. Validate locally

Use configured local credentials without printing them. The Windows machine needs
JDK/native build tools, Node/npm, Rust, WebView2 and Git LFS. Check LFS availability
when engine/native binaries change. Keep full logs outside the checkout (for
example under `$env:TEMP`) and inspect exit codes, not merely the existence of a log.
PowerShell can continue to the next command after a native executable fails;
use `if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }` where sequencing matters.

On Windows, give Python text reads and writes an explicit `encoding="utf-8"`;
the default code page can corrupt translated labels and punctuation. Verify full
resolved files against both original revisions, including code after each conflict
block, before treating a merge checkpoint as a build candidate.

```powershell
python scripts/test_check_supabase_rpc_contracts.py
python scripts/check_supabase_rpc_contracts.py
.\gradlew.bat :composeApp:stageBridgeRuntime :composeApp:desktopTest --no-configuration-cache --console=plain
Push-Location desktop-ui
npm ci
npm test -- --maxWorkers=1
npm run contract:check
npm run build
Push-Location src-tauri
cargo fmt --check
cargo test --locked
cargo build --locked --features custom-protocol
Pop-Location
Pop-Location
node --test scripts/desktop-ui/release.test.mjs scripts/desktop-ui/windows-launcher.test.mjs
git diff --check
```

Run each check separately, or explicitly stop on a nonzero exit code. Install npm
dependencies when needed, especially after lockfile changes. On macOS/Linux use
`./gradlew` and the corresponding native toolchain. Packaging tests can report an
explicit host-specific skip; record it rather than treating it as exercised.

If the suite fails, inspect Gradle XML test reports. Distinguish a production
regression from a host-dependent assertion and fix the cause. In the first sync,
Windows exposed real JAR/file handle leaks in `DesktopCache`; Linux installer unit
tests also assumed `/tmp` remained an absolute POSIX path on Windows. Neither was
addressed by disabling the tests. Close any running development app that prevents
rebuilding its executable, without terminating unrelated user processes.

Use the actual embedded rewrite for affected user journeys. Rebuild the native DLL
when JNI or native code changes; `stageBridgeRuntime` and the Windows desktop-test
hook arrange this. `WindowsPlayerPresentationTest` exercises real JNI/mpv/WebView2
with a temporary silent WAV and a host window under a different DPI context.
Exercise populated → loading/empty → identical results transitions in native
HTML panels too. The first trial found stale episode/source comparison caches
that prevented the same items from reappearing after a reload; DOM regressions
now execute the production renderers from the Vitest suite.
Automated checks do not replace real provider sign-in, a multi-user watch party,
macOS/Linux playback, installed upgrade or visual acceptance; state what was and
was not exercised.

## 6. Validate CI on the exact candidate

Finish the affected-flow parity review and local checks before dispatching the
expensive all-platform matrix. Cancel superseded build-only runs when code fixes
require a new candidate; do not mistake earlier artifacts for final-candidate
evidence. Documentation-only evidence updates after successful validation need
not repeat builds when the tested application/workflow tree is unchanged.

Commit adaptation changes and push the integration branch to **origin**, never
upstream. Use `--repo MichaelCommitsAt3AM/NuvioDesktopButBetter` with `gh` commands
because two GitHub remotes exist. Confirm the database workflow actually triggers
for this branch and includes bridge paths. The first trial found a `Dev`-only push
filter; sync/rewrite branches are now included.

```powershell
git push -u origin <sync-branch>
gh run list --repo MichaelCommitsAt3AM/NuvioDesktopButBetter --branch <sync-branch>
gh workflow run desktop-release.yml --repo MichaelCommitsAt3AM/NuvioDesktopButBetter --ref <sync-branch> -f mode=build-only -f target=all
```

Wait for RPC contract/fresh-database/upgrade-database checks and relevant rewrite
package jobs on the exact candidate. Use CI for database checks if a local
Docker-compatible runtime is unavailable. Build-only is for validation; do not
dispatch draft/publish, create a release tag, deploy migrations or upload local
installers as a shortcut. Inspect failures, repair the code/workflow and rerun.

## 7. Record evidence and integrate

Create a batch report under `docs/` with full previous/target/rewrite SHAs, merge
commit, upstream release, conflict decisions, frontend mappings, deferred changes,
commands/results, platform limits and CI run links. Update `FORK_CHANGES.md`, the
README for user-visible behavior, `KNOWN_ISSUES.md` for outstanding understood
issues, and this runbook for new reusable findings.

Ensure the runbook and batch report are actually tracked: this repository ignores
`docs/*` except explicit exceptions. `!docs/UPSTREAM_SYNC*.md` keeps this guide and
its reports visible; use `git check-ignore -v <path>` if a new file is missing from
status.

Check for newer rewrite development changes. Merge those into the sync branch and
repeat affected checks when necessary. Promote the validated batch with a normal
merge or fast-forward that preserves the upstream merge commit:

```powershell
git switch <rewrite-branch>
git merge --ff-only <sync-branch>
git merge-base --is-ancestor <target-sha> HEAD
git status --short --branch
```

If fast-forward is unavailable, reconcile deliberately and retain the tested
ancestry. Do not force-push shared history. Keep incomplete or failed validation
on the sync branch and report the remaining gates clearly. Branch/default-branch
promotion and release publication are separate operations. Follow the existing
separate version-bump and CI-only release process when a release is requested.

## 8. Launch the local debug rewrite when requested

After checks pass, the embedded debug build from step 5 can be opened directly;
it does not need a Vite server or the legacy Compose entry point:

```powershell
$debugExe = (Resolve-Path 'desktop-ui/src-tauri/target/debug/nuvio-desktop-shell.exe').Path
Start-Process -FilePath $debugExe -WorkingDirectory (Split-Path $debugExe) -WindowStyle Normal
```

Check for an existing Nuvio frontend first so two apps do not compete for shared
Kotlin storage/services. If one must be replaced, close the known frontend
gracefully; do not kill unrelated Java processes. Confirm the new shell process
stays alive and its diagnostic log records a **new** ready handshake. The preview
identifier is `com.nuvio.media.desktop.preview`; the shell writes
`logs/bridge-diagnostics.log` under its Tauri app-data directory. Inspect only the
needed diagnostic markers and do not print credentials or raw source URLs.
Launching successfully is not user acceptance: leave the app open for testing and
record the actual tested journeys separately.

Verify that Home actually displays a featured title and catalog shelves after
startup and profile selection. A healthy handshake and sign-in can coexist with
an empty loading screen. Check privacy-safe Home event/snapshot diagnostics
(epoch, revision, loading and counts), and distinguish Kotlin catalog loading
from React delivery/reconciliation. Test missed-event recovery and the Retry
state; React rechecks empty/loading Home every five seconds and bounds that wait
at sixty seconds. Never mark a restart-only recovery as a proven root-cause fix.
