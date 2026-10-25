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

All required automated checks passed on the exact application candidate below. The remaining visual/manual acceptance limits are explicit; startup diagnostics do not substitute for visual or provider playback acceptance. Logs are under the host temporary directory with prefix `nuvio-sync-20261025-`; they are not checked in.

- RPC scanner unit tests: 4 passed; RPC contract: 42 client functions covered by 50 migration functions. Newly unavailable party/chat RPCs are capability-gated.
- Full updated frontend suite: 75 files / 447 tests passed. Following final artwork crop/hover and navigation refinements, affected Home/artwork/native-panel suites passed 38 tests across 6 files; final Back/artwork tests passed 7 tests.
- Rust format check and tests: passed, 9 tests.
- Final frontend production build, contract/locales/inventory checks and whitespace checks: passed. Existing chunk-size and static/dynamic locale import warnings remain.
- Release/Windows launcher checks: 10 passed, 1 explicit Tauri CLI schema skip. Supabase upgrade-config helper tests: 2 passed.
- Windows native DLL rebuilt successfully. Kotlin desktop compilation and bridge runtime staging: passed after correcting the merge checkpoint and snapshot mapping.
- Full `:composeApp:desktopTest`: 1,812 tests, zero failures/errors, one macOS-only window-insets test skipped on Windows, across 277 XML suites. This includes 2 real Windows JNI/WebView2 presentation/DPI/resize/PiP tests (extended to check `stringProperty` and mpv `alang`), 8 animated-image tests, 5 SVG tests, 5 playback matching tests, 7 Trakt paging tests and 3 source-identity tests. Full Gradle staging/test command passed in 10m 2s.
- `cargo build --locked --features custom-protocol`: passed in 52s, embedding the tested frontend and staged Kotlin runtime.
- Application candidate: `2ce3087a41a4145aaa60442353561e447507d170`, pushed to origin's sync branch.
- Database CI: [40190490899](https://github.com/MichaelCommitsAt3AM/NuvioDesktopButBetter/actions/runs/40190490899), **passed** on `2ce3087a41a4145aaa60442353561e447507d170`: RPC contract, fresh database (including PostgREST smoke) and upgrade database.
- All-platform build-only CI: [40190531407](https://github.com/MichaelCommitsAt3AM/NuvioDesktopButBetter/actions/runs/40190531407), **passed** on `2ce3087a41a4145aaa60442353561e447507d170`: Windows x64 MSI, macOS arm64/Intel, Linux AppImage/DEB/RPM/Flatpak, plus packaging preflight. Release publication jobs were skipped by build-only mode.
- Embedded Windows startup smoke: passed through process/transport diagnostics. After Windows CI passed, the user-authorized debug executable was launched at 15:17 EAT (PID 23856). A new ready handshake was accepted at startup; React accepted the signed-in session and received a settled Home event at epoch 2 with `loading=false`, `shelves=10`, `hero=8`. The debug process remained running and was left open.
- Visual/UI automation acceptance: not completed. Computer Use was stopped by physical Escape; after the user explicitly authorized resuming, the session still reported its stopped state. No further Computer Use input was issued. The authorized executable was launched with the runbook's `Start-Process` command instead; no claim of visual inspection or manual playback follows from the diagnostics.

## Acceptance limits

Automated Windows JNI/WebView2 presentation tests and embedded rewrite startup/React Home delivery checks passed. Visual confirmation and interactive settings/playback acceptance remain pending because Computer Use stayed stopped. Real debrid/provider sign-in, a populated remote stream with audio badges, multiclient watch parties, installed upgrade and macOS/Linux playback are not inferred from builds. Watch parties/media-server cloud sync remain unavailable as documented in `KNOWN_ISSUES.md`.

## Integration

Origin was fetched again before promotion; the rewrite branch had no incoming remote commits. The original two local commits remain ancestors of the sync. The normal upstream merge and adaptation commit remain intact. The final evidence commit changes only this Markdown report; the tested application/workflow tree is unchanged, so the build matrix does not need repeating for that documentation-only update. Integrate by normal fast-forward into `feature/react-tauri-desktop-rewrite` and push to origin, retaining `5e18596aa919a6a4e7b6cdee7f90dfaabbf71b00` in ancestry. No default-branch change, version bump, tag, release publication or production migration is part of this batch.
