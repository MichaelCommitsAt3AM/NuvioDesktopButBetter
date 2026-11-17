# Upstream 0.1.37-alpha+2 integration

- Previous upstream: `a81a207bb2a3139683c638a46615b9d7a15af016` (0.1.35-alpha)
- Target: `65061186dde35fc0a0f90b05d380f2318133f227` (`upstream/Dev`, two commits after the `0.1.37-alpha` tag: the Discord IPC handshake fix and the detail-hero rating chip)
- Rewrite base: `fab96d7f4f61efa04aa232199ebaddd008cc759a` (`feature/react-tauri-desktop-rewrite`)
- Merge checkpoint: `4ff9ac568ad7ec7c8d90f51dbbb22cb814e4e31c` on `codex/sync-upstream-0.1.37-alpha`

The range is 435 files (about 149k insertions, mostly translations and the new rating, auto-sync and source-fallback code). It spans upstream 0.1.36 and 0.1.37 because both were integrated together.

## Conflicts (22 files)

- `DesktopVersion.properties`: kept the fork's `0.1.35.2` / `51`. No version bump is part of this sync.
- `build.gradle.kts`: kept upstream's `composeCompiler` stability block and the fork's `fork-desktop-ui.gradle` hook.
- `values-bg`, `values-vi` strings: upstream's files. The fork side differed only in line endings.
- `AddonRepository`: kept the fork's `prefetchManifests`; added upstream's tracking-consent state and `installWithTrackingConsent`. Upstream's "primary add-ons required" guard is not applied, because the fork removed that policy.
- `MetaDetailsScreen`, `DetailHero`: upstream's re-wrapped `LazyColumn` (backdrop `CompositionLocal`) and trailer surface, with the fork's `rememberNuvioFlingBehavior` and `desktopImageScaling` removal re-applied.
- `HomeRepository`: kept the fork's progressive per-catalog loading and cache TTL; added upstream's hero-source gating (`heroSourcesResolved`, published once every hero source has finished its full fetch). `HomeScreen`: upstream's `rememberHomeHeroState` with the fork's keys and content types.
- `AudioTrackModal`, `PlayerNextEpisodeAutoPlay`, `PlayerScreenRuntimeEffects`: upstream's layout, source-fallback resolve (`resolveWithSourceFallback`) and `playReplacementSource`, with the fork's `flingBehavior` and `contentTitle` re-applied.
- `StreamsRepository`, `StreamsScreen`, `StreamsTabletLayout`, `ProviderFilterRow`: upstream's shared `StreamSearchSessions` (one search per title/episode joined by the stream screen, the player's sources panel and next-episode search). The fork's per-source 60 s timeout, friendlier error text, the 20 s debrid-availability timeout (leftover `CHECKING` streams settle as `UNKNOWN`) and diagnostics moved into `StreamSearchSessions.kt`. The Data saver chip is kept on the mobile and tablet layouts.
- `WatchProgressIdentityTest`: upstream's values.
- `Main.kt`: upstream's macOS app menu bar and title-bar double-click combined with the fork's startup markers, frame-time probe and shutdown flush.
- `DownloadsPlatformDownloader.desktop.kt`: upstream's retry/backoff and truncation check, driven by the fork's throttled `copyDesktopDownload` (now returns the transferred byte count).
- `PlayerEngine.desktop.kt`: both import sets (focus events plus the new auto-sync coordinator).
- `DesktopPlayerPictureInPicture.kt`: upstream's `setPictureInPictureActive` (PiP forces Fit) applied to both the Swing-window path and the fork's Windows-native PiP path; the fork's native disposal and reparent diagnostics kept.
- `NativePlayerController.kt`: snapshot carries upstream's video size and the fork's heartbeat diagnostics.

Audited automatic merges: the compile of the desktop target found two non-exhaustive `when` expressions over the new `AddAddonResult.TrackingConsentRequired` (default add-on seeding and the bridge's `addons.install`), both fixed. `NativePlayerBridge.kt` is unchanged by upstream, so no JNI declaration changed; the upstream native edits were a one-line Windows change (`sub-ass-override` is now `no`), Linux overlay snapshot handling and a macOS rework, none of which touch the fork's Windows presentation or DPI code. `ChapterSkipIntervals.kt` had been left on a pre-post-credits version by the 0.1.34 sync; upstream's version is restored, which also satisfies upstream's updated tests.

## Behavior decisions

- **Implemented:** tracking add-on consent. `addons.install` returns `trackingConsent` (name and manifest URL) instead of installing a tracking add-on; the call is repeated with `acceptTracking: true` after the user ticks the consent checkbox in a new Settings → Addons dialog. Default add-ons that need consent are skipped, not installed silently.
- **Implemented through shared runtime:** shared source search sessions, hero-source gating, post-credits skip targets, PiP resize, chapter-title toggle in the native overlay (`chapterTitleEnabled`), `sub-ass-override` and ASS handling, download retries with truncation check, video-size snapshot, source fallback after a failed auto-selected source and subtitle/audio track selection changes (the rewrite launches the Kotlin `PlayerScreen`).
- **Behavior change that needed a test update:** forced-only subtitle selection is now the default (`useForcedSubtitles = true`). `PlayerBuiltInSubtitleSelectionTest` covers normal-language selection with a controller that has no audio tracks, so its settings now set the option off explicitly.
- **Deferred:**
  - User ratings (`RatingChip`, `RatingSheet`, episode rating, MDBList/Trakt/Simkl user ratings, `TrackingRatings`). The Kotlin repositories are merged but there is no bridge method, snapshot field or React rating UI. The detail hero's new rating chip is therefore not shown in the rewrite.
  - Audio amplification, audio delay and center mix controls. The runtime and Compose modal exist; whether the native HTML overlay exposes them has not been checked, so they are not claimed.
  - Mpv subtitle auto-sync coordinator (`AutoSyncMpvCoordinator`, `DesktopAutoSyncMpvPlatform`): compiled and wired into the desktop player surface, but the rewrite's auto-sync settings and results UI were not re-reviewed.
  - Styled subtitle cues and playback stall resume: shared runtime, not exercised.
- **Reference/mobile-only:** macOS app menu bar and title-bar double-click, the macOS native bridge rework, EDR revert, Linux overlay snapshot wake, Android/iOS source sets, `store.json`, `ArtworkBackdrop` cinematic backgrounds in Compose screens, new Tamil/Bengali/Hebrew/Dutch/Chinese/Ukrainian resources.
- **Locales:** regenerated into the rewrite bundles (29 locales).

## Validation

- Supabase RPC contract tests and scanner: passed (42 client RPCs, 50 migration functions).
- Contract, locale and UI inventory generators plus `--check`: passed. The inventory now also records the new Compose files (consent dialog, rating sheet/chip/stars, artwork backdrop, mpv auto-sync). Regeneration acknowledges the review above, not parity: ratings remain deferred.
- Desktop Kotlin compile: passed after the two `when` fixes.
- Windows desktop suite (`stageBridgeRuntime` + `desktopTest`): first run 2,107 tests, 4 failures (two post-credits chapter tests, two subtitle selection tests); after restoring `ChapterSkipIntervals.kt` and the test settings change, all passed.
- Frontend: 100 files, 605 tests passed, 1 skipped, including two new consent-flow tests; `contract:check` and the production build passed.
- Rust: `cargo fmt --check`, 11 tests and the embedded shell build (`cargo build --locked --features custom-protocol`) passed.
- Launcher/release tests: 10 passed, 1 explicit host skip.
- `git diff --check`: clean.

Not run: Android host tests (including `StreamSearchSessionsTest`, which exists only there), CI (Supabase database tests and the all-platform build-only matrix) until the branch is pushed, live playback, add-on source searches against real providers, macOS/Linux playback, provider sign-in, installed upgrade and visual acceptance. No release was published and no version was bumped.
