# Upstream sync trial — 2026-10-18

## Identity and scope

- Rewrite development branch: `feature/react-tauri-desktop-rewrite`.
- Integration branch: `codex/sync-upstream-0.1.31-2026-10-18`.
- Rewrite starting commit: `5a4e7071902b29ce6ea370ef4f2872a3bb70d4b2`.
- Previous integrated upstream: `d4bdf2588d46a4db7131e105efe6bd7576944a1b`.
- Pinned upstream target: `e808a584e937d3ce148f5e023180586bc3545002` (`0.1.31-alpha`).
- Upstream merge checkpoint: `e823d4498c647f1fec7edbb4dd1569e642d48e17`.
- Scope: 378 upstream files, roughly 34,430 insertions / 929 deletions against the previous upstream baseline; 18 files had merge conflicts. Numbers describe the upstream delta, not the size of our React adaptations.
- Fork release properties remain `0.1.27.7` / build code `40`. This is an integration, not a release bump. No production schema deployment, release tag or release publication is part of this operation.

## Decisions and frontend mapping

| Upstream area | Decision and evidence |
| --- | --- |
| Native playback buffering/reconnect, Windows HDR/render fallback/shader caching and integrated-GPU defaults | Implemented in native/shared player. Preserve fork language/subtitle-off startup hints, cross-DPI WebView2 profiles, presentation script/resources, sizing and PiP fixes. Both native presentation tests passed on Windows. |
| Player buffer bar, panel bounds/header controls, stream information, next-episode timing and source/episode list stability | Imported into the native player used by React/Tauri, so these do not need duplicate React player implementations. Retained fork episode selection and presentation acknowledgement. |
| Desktop hold-to-speed | Imported backend/native controls; added bridge snapshot/setters and React Playback settings. Mobile-only advanced buffering/AutoSync controls remain outside desktop UI. |
| Jellyfin/Emby servers, mixed libraries, catalog/discover/search, native metadata and server watch state | Imported Kotlin providers/repositories; added React server settings and bridge commands/events/initial snapshots. Home lifecycle includes server revision changes and matcher warmup. Existing catalog/discover/details adapters reuse upstream repositories. Native playback resolves server targets before attaching the player. Real server credentials and playback are pending user/provider acceptance. |
| Media-server cloud sync | Deferred. Neither RPC is deployed on this fork. `mediaServerSync` defaults false and gates the background sync path, keeping local connections usable without profile-sync failures. No migration is fabricated or deployed. |
| Watch-party creation/join/invites, preview, host playback, avatars and native panels | Kotlin/native/reference sources imported. Official fork capability stays false because the `watch_party_*` RPCs/realtime backend are absent. React party page/invite wiring is deferred with that backend. TV login stays disabled for its existing missing-backend reason. |
| MDBList dynamic/liked/external lists and sorting | Imported upstream Kotlin decoder/projection/library/sorter; React settings expose list visibility and library receives available/effective sort options and backend-ordered items/sections. Bridge observes remote provider ordering. A follow-up fixes React flattening that order, adds individual-list selection and preserves provider section order in shelves. Real-account external service acceptance is pending. |
| TorBox large cloud libraries, continue-watching restoration, custom-poster resolution/deferred metadata and native cache limits | Kotlin changes imported. Existing React snapshots consume repository outputs; preserve this fork's explicit bounded image/cache policy rather than replacing it with upstream's simpler fixed budget. |
| YouTube-only addon streams | Imported resolver; rewrite playback now resolves `ytId` before external/native playback. Existing upstream YouTube resolver/parser tests pass; actual provider video acceptance is separate. |
| Custom poster bridge parity | Fixed ID extraction for IMDb/TMDB tokens, explicit library IMDb IDs, portrait-only pattern handling and original-artwork fallback. The original URL now crosses the typed bridge so failed custom artwork can recover instead of shimmering indefinitely. |
| Desktop scrollbar/Compose spacing, dialogs and hero layout | Original source retained as reference. React has its own scrolling/layout and existing matching hero treatment; no blanket visual copying. Native panels still receive upstream changes because they are runtime UI. |
| Localization | Regenerated React locales from the merged canonical XML, including new Croatian resources. |
| P2P engine/dependencies | Imported 0.1.5 JAR/native binaries and dependency updates; desktop compilation and P2P tests pass. |
| Packaging and credentials | Preserve the fork Tauri workflow, Java bundling, updater signatures and monotonic MSI code. Upstream Compose-package MDBList-key requirement and legacy DEB launcher patch do not replace Tauri packaging; MDBList account controls still depend on configured credentials. |
| Android/iOS/AutoSync | Shared/mobile lineage retained. Mobile targets were not built or repaired; desktop common tests still cover imported pure logic. |

## What the trial taught us

1. A clean automatic merge can still break injected/native signatures: compilation caught a 12-argument native create type paired with a 9-argument default lambda. Audit all JNI/type/call sites and rebuild the DLL.
2. Upstream features can assume hosted backend RPCs absent here. Inventory service dependencies and capability gates before ordinary auth/profile-sync paths start invoking them. The contract checker needed named `function =` and watch-party wrapper recognition.
3. Upstream lifecycle effects are part of backend integration. Server settings alone did not invalidate Home; bridge observers and lifecycle signatures needed the new server revision.
4. Windows tests caught real resource-handle leaks: `FileURLConnection` metadata access and cached `JarURLConnection` handles kept source resources open. Use filesystem attributes for file URLs, disable URL caching during extraction, and close private JarFiles.
5. Linux command-generation tests run on the Windows JVM too. Compare host-resolved `File.absolutePath` values rather than assuming `/tmp` stays POSIX; do not skip the tests.
6. The database workflow's push filter covered `Dev` only, despite development occurring on the rewrite branch. Include sync/rewrite branches and bridge paths, and verify the actual candidate run exists.
7. Marketing version is not a source baseline. Preserve fork build code during merges; track the integrated upstream SHA separately. The old inventory used a hard-coded historical fork SHA; it now reads `upstream-baseline.json`.
8. Native PowerShell command failures do not necessarily stop the shell. Check individual exit codes/log results; successful commands later in a batch can hide an earlier failure.
9. New documentation can silently be ignored by the existing `docs/*` rule. Explicit sync-guide/report exceptions were added and verified with Git status.
10. Audit native DOM cache transitions. Production-renderer tests reproduced episode/source lists staying empty after identical results returned; clear comparison caches when rendering an empty state.
11. Repeated generation intermittently failed opening unchanged files on Windows. Contract/validator generators now compare content before writing; the subsequent production build passed.
12. React can silently discard correct Kotlin output: the library filtered globally ordered items instead of using per-section keys, and poster resolution skipped ID extraction/original-image fallback. Added adapter/DOM/projection regressions and fixed the actual flows.
13. Repository-local `core.longpaths=true` addresses Windows internal checkpoint-ref path length errors; leave app metadata refs intact.
14. Do not let generated inventory updates imply user acceptance. Native Windows regression coverage is evidence for that path; it does not establish macOS/Linux/provider/visual acceptance.

## Local validation

- `:composeApp:stageBridgeRuntime :composeApp:desktopTest`: passed after fixes; 1712 tests, zero failures/errors, one skip. Includes both real Windows cross-DPI player presentation tests, service gates and server-to-Home refresh regression.
- `npm test -- --maxWorkers=1`: 368 tests across 64 files passed, including connection credential clearing, explicit removal and stale-profile error handling. Follow-up native panel tests also cover populated → empty → identical results and unchanged-node stability.
- `npm run build`: TypeScript and Vite production build passed. Existing chunk-size/dynamic-import warnings remain non-fatal.
- `npm run contract:check`: passed.
- `cargo fmt --check`, `cargo test --locked`: passed; nine Rust tests.
- `cargo build --locked --features custom-protocol`: passed; embedded debug shell built.
- `python scripts/test_check_supabase_rpc_contracts.py`: three passed.
- `python scripts/check_supabase_rpc_contracts.py`: passed (42 non-deferred client RPCs, 50 migration functions).
- Release/Windows launcher Node tests: ten passed, one explicit host/toolchain skip; none failed.
- Generated locale/contract/inventory checks and final source diff checks: verified before final integration.

## CI and promotion

Initial candidate `02aece4f` passed all three database jobs in [run 39110983025](https://github.com/MichaelCommitsAt3AM/NuvioDesktopButBetter/actions/runs/39110983025). Candidate `2b8a47ae` also passed all database jobs in [run 39111315867](https://github.com/MichaelCommitsAt3AM/NuvioDesktopButBetter/actions/runs/39111315867). The first all-platform build [39110974347](https://github.com/MichaelCommitsAt3AM/NuvioDesktopButBetter/actions/runs/39110974347) is superseded by the native-panel follow-up; final candidate CI evidence will be recorded before promotion. The local host has Supabase CLI but no Docker command, so fresh/upgrade database tests run in GitHub Actions. Build-only artifacts validate packaging; they do not publish a release.

## Acceptance limits

No real Jellyfin/Emby/MDBList credentials were used. macOS/Linux runtime playback, visual acceptance and installed migration/update journeys were not exercised locally. Watch parties/server cloud sync remain intentionally unavailable and are tracked in `KNOWN_ISSUES.md`. The dedicated [runbook](UPSTREAM_SYNC.md) is the entry point for the next sync.
