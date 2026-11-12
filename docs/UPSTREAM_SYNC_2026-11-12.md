# Upstream 0.1.35-alpha integration

- Previous upstream: `1a600da8314fea54a8aa36a9998fd8fcd66132ec` (0.1.34-alpha)
- Target: `a81a207bb2a3139683c638a46615b9d7a15af016` (0.1.35-alpha tag)
- Rewrite base: `429836b13c71dfa15cc1870e415ee7773eb96311` (`feature/react-tauri-desktop-rewrite`)
- Merge checkpoint: `fede0bc2b7d922d0eb8336d9f65daf5d1dcbc9eb` on `codex/sync-upstream-0.1.35-2026-11-12`

`upstream/Dev` (`37ce07d35`) has seven more PRs and two mobile merges after the tag: macOS window menu and titlebar double-click, download auto-resume, hero meta rows, ignored playback clicks, PiP aspect inheritance and the shared auto-sync engine. They are left for the next batch so this one stays release-sized.

## Conflicts

- `composeApp/Configuration/DesktopVersion.properties`: kept the fork's `0.1.34.1` / `49` (upstream `0.1.35-alpha` / `35`). No version bump is part of this sync.
- `PlayerScreenRuntimeUi.kt`: imports only. The fork already imports `remember` elsewhere, so upstream's `clipToBounds`, `Dp` and `dp` were added and the duplicate dropped. The fork's startup language/subtitle-off arguments and `playerPlayWhenReady` sit alongside upstream's party-panel `Fit` resize mode.

Audited automatic merges: the new `setSubtitleVisible` JNI declaration has matching implementations in the Windows, Linux and macOS bridges and in `NativePlayerController`. Upstream removed the in-player "Use custom styling" toggle (`customSubtitleStylingEnabled`, `subtitleCustomStyleToggle`) but retained `PlayerSettingsRepository.useLibass`, so the rewrite's libass setting is still valid. `--win-shortcut-prompt` only affects the legacy Compose jpackage MSI/EXE; the rewrite's Tauri packaging is unchanged. The upstream `.gitignore` was untouched in this range.

## Behavior decisions

- **Implemented:** subtitle add-on request extras (`filename`, `videoSize`, `videoHash`, desktop video-hash computation). The rewrite's player launch in `NativePlayback.kt` builds its own `PlayerScreen`, so it now passes `SubtitleRequestExtras` the way upstream's stream screen does: hints only for torrents, URL filename fallback for direct links. Source switches inside the player already use upstream's shared runtime.
- **Implemented:** Continue Watching "mark as watched". New bridge method `home.continueWatching.markWatched` resolves the progress entry (or the Up Next episode from request fields) to a `ContinueWatchingItem` and calls `WatchingActions.markContinueWatchingWatched`. Snapshots expose Kotlin's `canMarkWatched`, and React shows the menu action only when it is true, on both the Continue Watching and Upcoming rails, with the existing removal animation.
- **Implemented through shared runtime (no rewrite change):** subtitle hide via `sub-visibility`, desktop ASS/background styling, enlarged stream badges, chapters modal refresh, font import on the AWT thread, current-stream marker for reused links and GIF codec lifetime. The rewrite uses the Kotlin player and `player-ui` resources directly.
- **Already covered:** the NVIDIA RTX toggle (the rewrite exposes `nvidiaRtxSuperResolutionEnabled`) and the About version footer (the rewrite's About page shows the updater's current version).
- **Reference/mobile-only:** watch-party side panel resize (`!isDesktop`), iOS Now Playing/audio session, MPVKit bump, Android libass ASS fix, `store.json`, and the legacy jpackage shortcut prompt.
- **Locales:** upstream ar/fr/it/pl updates regenerated into the rewrite locale bundles.

## Validation

- Supabase RPC contract tests and scanner: passed (42 client RPCs, 50 migration functions).
- Contract, locale and UI inventory generators plus `--check`: passed. The inventory changes cover `ContinueWatchingActionSheet` (implemented), player runtime files and `player-ui` resources (shared runtime), and `AboutSettingsPage` (already covered).
- Windows desktop suite on the merge checkpoint: 297 suites, 1,998 tests, 0 failures, 1 platform skip.
- Windows desktop suite after the bridge adaptation: 1,998 tests, 0 failures, 1 platform skip; staged bridge runtime rebuilt.
- Frontend: 94 files, 576 tests passed (including a new Mark as watched case); `contract:check` and production build passed.
- Rust: `cargo fmt --check` and 11 tests passed.
- Launcher/release tests: 10 passed, 1 explicit host skip.

Not exercised: real subtitle add-on requests with a hash-capable provider, live playback, macOS/Linux playback, provider sign-in, installed upgrade and visual acceptance. No release was published and no version was bumped.
