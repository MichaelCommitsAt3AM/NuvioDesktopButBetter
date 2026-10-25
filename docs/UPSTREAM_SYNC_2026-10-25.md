# Upstream sync — 2026-10-25

## Pinned history

- Previous upstream: `e808a584e937d3ce148f5e023180586bc3545002` (`0.1.31-alpha`).
- Target: `5e18596aa919a6a4e7b6cdee7f90dfaabbf71b00`, upstream Dev after `0.1.32-alpha` (`da6910dbca048b34c1ba7205fba8a4e6c01dc65e`). Includes engine 0.1.6, subsequent mobile integration, and desktop animated artwork. The user requested a current upstream sync, so the exact fetched Dev tip was pinned, including these post-release changes.
- Rewrite base: `e18f41ecffdd924cc13fbd33ca04b1a3c61bb96f` on `feature/react-tauri-desktop-rewrite`; two local commits ahead of origin, no incoming rewrite commits.
- Integration branch: `codex/sync-upstream-0.1.32-2026-10-25`.
- Normal upstream merge: `ef88e7028d38d1c995ef06e9b014d368c6089b39`. Follow-up corrections/adaptations are separate commits. The checkpoint alone is not an integration candidate.
- Desktop version/build retained at `0.1.31.4` / `44`. No release bump, tag, published release, or deployed migration.

## Reviewed behavior and disposition

| Upstream change | Decision and rewrite mapping |
| --- | --- |
| Preferred audio languages sent to mpv; untagged track-title language matching | **Implemented** in the shared track selection and native controller/JNI on Windows, macOS and Linux. Retained the fork's ISO-639 aliases and original-language fallbacks. Manual audio actions still travel through Kotlin. |
| Current video/audio badges | **Implemented** in native controls, shared media-info matching and string-property JNI. The automatic merge computed badges without passing them into native state; corrected. React Streams settings now expose the opt-in and a validated imported badge-set choice. Default stays off. |
| Episode binge filename/hash matching | **Implemented** in Kotlin stream selection and native source changes/next-episode playback. Keeps the selected release across episodes without moving selection rules into React. |
| Debrid facts reuse, regex/filter compilation caches | **Implemented**, combined with the fork's automatic ranking, matching-title preference and limits. Formatting consumes the same facts used in filtering. |
| Stream badge match/presentation caching and player rules | **Implemented** in Kotlin; existing React stream presentation retains size/logo/layout controls and adds player settings. |
| Trakt complete hidden/history pagination, failure preservation | **Implemented** in Kotlin. Existing provider/library/Continue Watching adapters reuse it. Trakt sign-in remains deliberately hidden by fork policy; no new exposed credential flow. |
| Catalog custom posters for Library/Collections | **Implemented** in Kotlin catalog repository, used directly by the bridge. Existing poster resolver and original-art fallback retained. |
| Home catalog runtime/status and safe primitive parsing | **Implemented** in Kotlin parser and canonical optional Media fields; existing schema consumers remain compatible. |
| Home hero details, metadata and optional MDBList ratings | **Implemented** with a cancellable bridge subscription to hero/profile/TMDB/MDBList inputs, Kotlin enrichment and native preference ownership. React shows runtime/status/age/language/rating metadata while retaining its initial featured title. MDBList Home ratings default off; overall IMDb visibility respected. No keys/tokens or playback URLs enter the snapshot. |
| Library localized Simkl section titles | **Implemented** in the React section filter and shelves using the generated translations and stable section type. |
| Desktop SVG embedded/external images | **Implemented** in the shared desktop loader ahead of generic SVG decoding; retained fork component registration, layout-sized raster decode and bounded fetch/decode pools/cache budgets. |
| Desktop animated GIF/WebP artwork | **Implemented** in Compose/native image callers and decoder with bounded input/dimensions and exception-safe native cleanup. React poster/fallback/hero artwork supports Always/On hover/Off through the same persisted Kotlin setting. Browser stills use an allocation-capped canvas; native animation concurrency/offscreen limits retained. |
| Esc/mouse Back prioritizes dialogs | **Implemented** in Compose navigation and React. Native fullscreen Escape remains available; open dialogs/menus consume Back before route navigation. Text editing retains its existing key handling. |
| Middle-click autoscroll and precise wheel | **Reference-only** Compose input adapters retained. React uses Chromium's native scrolling; no second synthetic scrolling engine added. |
| Hero/detail ratings styling, shelf/padding changes | **Implemented** for metadata content in React; Compose visual/source changes retained as **reference-only**, including mobile vertical-bar insets. React keeps its own appearance/layout. |
| Watch-party chat, linked profiles, companion, native chat controls | **Deferred** with existing backend dependency: this fork does not host watch-party RPCs/realtime. Capability stays false. RPC inventory recognizes the new wrapper call style and explicitly exempts only the unavailable services. No ordinary profile sync invokes them. |
| Android libass/OpenGL render scale, automatic subtitle retiming/timeline mapping | **Reference/mobile-only** shared models/helpers and Android changes retained. Desktop continues using mpv subtitles; do not expose Android-only renderer settings in React. |
| iOS system playback/PiP, companion, vertical navigation bar | **Reference/mobile-only**, retained without compiling/repairing iOS targets. |
| Local date-time display helper and party UI time | **Implemented** in platform code, consumed by retained party UI; party remains disabled. |
| Engine 0.1.6 JAR/native libraries | **Implemented** with upstream runtime assets and desktop Gradle reference. Android AAR retained as mobile lineage. Git LFS availability checked; engine files are tracked regular binaries. |
| Compose 1.13 beta, Material3, navigation3 stable, Haze 1.7.3 | **Implemented** build dependency upgrades; fork Gradle hook, Tauri release matrix, Java runtime, MSI identity/updater signing preserved. Android SDK minor/workflows/libass packaging retained as **mobile-only**. |
| New/updated translations | **Implemented** via sequential locale generation; canonical bridge schema/types/method enums/Rust allowlist regenerated and reviewed. |

## Conflict and automatic-merge decisions

Thirteen conflicts were resolved individually. Version files retain the fork's monotonic build. Image API signatures add upstream's animation/image-loader options on all actuals; desktop keeps layout-sized raster decoding rather than reviving upstream's draw-time rescaling. Decoder components combine embedded-SVG/animation support with the fork's bounded workers, persistent disk cache and memory budget. Shelf scrolling retains fork arrows/fling/hover plus upstream inset handling. Debrid ordering retains title preference while passing cached facts into formatting. Language-label visibility becomes internal for player badges without removing fork aliases. Source identity, Playing marker and episode-panel scroll fixes from the rewrite base remain intact.

The initial merge checkpoint had incomplete image/shelf/language conflict blocks; compilation found them and the complete files were reconstructed from the original three Git revisions in the follow-up change. Native player changes were audited across Kotlin declarations, controller calls and all three JNI implementations. No blanket directory replacement or ancestry rewrite was used.

## Validation evidence

Validation is in progress. Required results and exact CI run links are recorded below before promotion. Logs are under the host temporary directory with prefix `nuvio-sync-20261025-`; they are not checked in.

- RPC scanner unit tests: 4 passed; RPC contract: 42 client functions covered by 50 migration functions. Newly unavailable party/chat RPCs are capability-gated.
- Full updated frontend suite: 75 files / 447 tests passed. Following final artwork crop/hover and navigation refinements, affected Home/artwork/native-panel suites passed 38 tests across 6 files; final Back/artwork tests passed 7 tests.
- Rust format check and tests: passed, 9 tests.
- Final frontend production build, contract/locales/inventory checks and whitespace checks: passed. Existing chunk-size and static/dynamic locale import warnings remain.
- Release/Windows launcher checks: 10 passed, 1 explicit Tauri CLI schema skip. Supabase upgrade-config helper tests: 2 passed.
- Windows native DLL rebuilt successfully. Kotlin desktop compilation and bridge runtime staging: passed after correcting the merge checkpoint and snapshot mapping.
- Desktop suite, embedded shell build/smoke and exact-candidate CI: pending.

## Acceptance limits

Automated Windows JNI/WebView2 presentation tests and an embedded rewrite smoke test are required for this batch. Real debrid/provider sign-in, a populated remote stream with audio badges, multiclient watch parties, installed upgrade and macOS/Linux playback are not inferred from builds. Watch parties/media-server cloud sync remain unavailable as documented in `KNOWN_ISSUES.md`.
