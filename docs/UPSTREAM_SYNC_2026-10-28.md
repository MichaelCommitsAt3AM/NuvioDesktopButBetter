# Upstream sync — 2026-10-28

## Pinned history

- Previous upstream: `5e18596aa919a6a4e7b6cdee7f90dfaabbf71b00` (October 25 batch).
- Target: `5f99fb4dba1ee43258977abacde7703a27e941fa`, upstream `Dev` and `0.1.33-alpha` at fetch.
- Rewrite base: `7eebd489ddf249365aefe23d4cc858e0af16a59e`; clean and equal to origin's `feature/react-tauri-desktop-rewrite`.
- Integration branch: `codex/sync-upstream-0.1.33-2026-10-28`.
- Upstream merge: `9972795d9ae59dff18d91e0d81702460de136f58` (normal two-parent merge); rewrite adaptation follows separately.
- Fork desktop version retained at `0.1.32.1` / build `45`. No release bump or publication is included.
- Reviewed range: 85 files, 8,316 insertions and 166 deletions before fork conflict resolutions.

## Behavior review and mapping

| Upstream change | Disposition and rewrite mapping |
| --- | --- |
| Desktop external subtitle autosync and embedded subtitle timeline extraction | **Implemented** in Kotlin and the native player shared by the rewrite. The coordinator wraps the native controller, preserves original subtitles if no reference matches, cancels obsolete work, and retains manual subtitle controls. Initialized profile-scoped persistence in the bridge entry lifecycle as well as the legacy entry point. |
| Autosync preferences | **Implemented** in React Playback settings via validated Kotlin setters: opt-in (default off), thorough search (default on), tolerance 0–500 ms in 100 ms steps. Preferred none/forced language disables the opt-in control, matching Kotlin. Reactive preference events and profile changes refresh settings snapshots. Added canonical schema for these values, generated types and validators, and search entries. |
| Embedded chapters, chapter timeline and panel | **Implemented** in shared Kotlin and native HTML controls. The rewrite uses this exact player runtime; chapter queries use the existing mpv string-property JNI boundary. React exposes the persisted chapter enable switch (desktop default on). Chapter normalization/seek tests and native DOM source-transition tests cover behavior. |
| Stream information panel | **Implemented** in shared player state and native HTML controls, including source, video, selected audio/subtitle and server details. Native DOM regressions verify source clearing/repopulation and text-only provider labels. No stream URL is added to React snapshots. |
| Player badges delivery | **Implemented** in native control serialization; existing React Streams badge settings and Kotlin badge generation retained. |
| Release-language recognition and title false positives | **Implemented** upstream title removal together with the fork detector's case-sensitive short aliases, subtitle/audio distinction, flags, implied languages and preference ranking. Strip known parsed/resolved titles once per source without lowercasing the remaining detector input. |
| Server title lookup and bounded matching caches | **Implemented** in Kotlin providers/repository with external-ID verification and title/original-title fallback. Removed the obsolete eager `ServerMatcher.warm()` call from the bridge to match the upstream lifecycle change. Existing React server controls reuse Kotlin; unavailable media-server cloud sync remains disabled. |
| TMDB original-title cache and synchronization | **Implemented** upstream locking and original-title access while keeping fork cache keys for independent enrichment module switches. |
| Foldable controls, Android Matroska chapter loader and storage, iOS hinge/PiP/engine switching | **Reference/mobile-only** retained; desktop compilation covers shared declarations. No Android/iOS build or repair. Desktop player startup retains fork audio/subtitle/off preferences and presentation-aware play intent. |
| Translations | **Implemented** through sequential locale generation, including new Croatian resource files and updated chapter strings. |
| Version/store metadata | Upstream base/mobile version and store history retained as lineage; desktop fork version/build deliberately preserved. Fork Gradle hook, Tauri CI, runtime layout, updater signing and MSI identity are unchanged. |

## Conflict resolutions and automatic-merge audit

Seven files conflicted. The desktop version keeps the fork build 45 instead of upstream 33. Vietnamese resources were three-way merged after normalizing line endings, preserving the fork strings and four upstream additions. Language presentation combines upstream title stripping with the fork detector, rather than reinstating regex-only detection. TMDB combines locking with module-sensitive keys. Player runtime combines fold layout with startup language preferences and fork presentation-aware play intent. Desktop surface retains focus/displayability behavior and adds autosync candidate plumbing/controller wrapping. Native modal opening retains forced rerender on opening, protecting the fork's episode/source cache fixes while including chapters.

Automatic merges were reviewed for controller API/implementation/serialization paths, source and chapter reset lifecycle, bridge initialization, provider matching and settings propagation. No native JNI signatures or binary resources changed in this batch. No blanket directory replacement or ancestry rewrite was used.

## Validation

Local checks passed on the application changes committed with this report. Full logs remain outside the checkout under the host temporary directory with prefix `nuvio-sync-20261028-`.

- RPC scanner unit tests: 4 passed; contract scanner: 42 client RPCs covered by 50 migration functions. Upgrade-config helper tests: 2 passed.
- Full frontend suite: 81 files / 506 tests passed; new settings and chapter/info DOM regressions also passed in a focused 11-test run. Initial accessibility-label failures were fixed in the new controls. Existing jsdom canvas diagnostic is non-fatal.
- Frontend production build, contract/locales/inventory checks and whitespace check: passed. Existing chunk-size and mixed static/dynamic locale import warnings remain.
- Rust formatting and all 9 tests passed. Embedded Windows shell `cargo build --locked --features custom-protocol`: passed in 22 seconds, embedding final frontend assets and the staged Kotlin runtime.
- Full `:composeApp:stageBridgeRuntime :composeApp:desktopTest --no-configuration-cache --console=plain`: passed in 4m 29s on the final source. Detailed XML counts are recorded below. Native Windows presentation tests use the real JNI/mpv/WebView2 boundary; no JNI source change required a new native implementation in this batch.
- The first Kotlin run exposed three title-stripping regressions (case normalization of regex words) and an upstream assertion expecting enum language order. Title stripping was corrected; the test explicitly retains the fork's appearance ordering (`ITA.ENG` yields Italian then English). No tests were disabled.
- Release/Windows launcher checks: 10 passed, 1 explicit Tauri CLI schema skip.
- Database and all-platform build-only CI: pending on the exact pushed candidate.

## Acceptance limits

Automated chapter/panel, preference and native presentation checks are distinct from real network playback acceptance. External subtitle matching depends on an available embedded reference, supported remote media/subtitle formats and provider access. Provider sign-in, installed upgrade, live subtitle alignment against real media, and macOS/Linux interactive playback are not inferred from compilation. Existing watch-party and media-server cloud-sync dependencies remain documented in `KNOWN_ISSUES.md`.

## Integration

Pending validation on the integration branch. Preserve the normal upstream merge when promoting; do not squash or rebase it. No default-branch change, tag, release publication or production migration belongs to this batch.
