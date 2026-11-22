# Upstream 0.1.38-alpha integration

- Previous upstream: `65061186dde35fc0a0f90b05d380f2318133f227` (0.1.37-alpha+2)
- Target: `35bdb2a77ca86b4141588832a3fc3ca0c80bfc4d` (the `0.1.38-alpha` tag). `upstream/Dev` had 9 more first-parent commits (mouse-wheel volume, RTX HDR for SDR only, subtitle shadow, focus-border and source-fallback settings fixes); they were left for the next batch to keep this one release-sized.
- Rewrite base: `de28048cc7668bae85196ff6973f2a401aa68c63` (`feature/react-tauri-desktop-rewrite`)
- Merge checkpoint: `9c6e7afa10eabbf11139838ca2acca4a5fded9d8` on `codex/sync-upstream-0.1.38`

The range is 30 non-merge commits and 157 files (about 16k insertions): Plex and Silo media servers, keyboard/gamepad spatial navigation, NVIDIA RTX Video HDR, exact desktop seeks, a downloads redesign, Windows touch scrolling, the desktop hand cursor, external episode-rating alignment and Linux overlay fixes.

## Conflicts (15 files)

- `DesktopVersion.properties`: kept the fork's `0.1.37.2` / `53`. No version bump is part of this sync.
- `update-store-source.yml`: kept the fork's `workflow_call`-only trigger (the fork stopped running the iOS sideload update on desktop releases). Upstream's beta-source changes to the job body merged automatically.
- Native player, all three platforms (`windows/player_bridge.cpp`, `macos/player_bridge.mm`, `linux/player_bridge.cpp`), `NativePlayerController.kt` and `NativePlayerControllerTeardownTest.kt`: the JNI `create` now carries both the fork's preferred audio/subtitle languages and subtitles-off startup flag and upstream's `nvidiaRtxHdrEnabled`, 13 arguments in Kotlin declaration order. The Windows UI-thread lambda, `runNativeUiThread`, `initializeOnNativeUiThread` and `startMpv` pass both sets. Upstream removed `hr-seek=no` on Windows and macOS for exact seeks/resume; that removal is accepted, while the fork's `alang`/`slang`/`sid=no` startup hints stay.
- `PlayerEngine.desktop.kt`: kept the fork's embedded-Tauri surface readiness (`playerSurfaceReady`) and stream-load timeline failure marker, added upstream's RTX HDR effect key and argument.
- `ShelfComponents.kt`: upstream's `ProvideControllerRowLazyListState`/`LocalControllerGroupKey` wrappers and `itemsIndexed` around the fork's hoverable row, page arrows and `rememberNuvioFlingBehavior`.
- `TmdbEntityBrowseScreen.kt`: upstream's controller scroll registration plus the fork's fling behaviour.
- `DownloadsScreen.kt`, `DownloadsDestinations.kt`: upstream's redesign plus the fork's download-filter settings page (Tune action, `initialShowFilterSettings`, a back handler for the filter page). The merge dropped the filter title import; restored in `96a4fa3bc`.
- `App.kt`, `Main.kt`, `ProviderFilterRow.kt`: both sides' additions (image components and keyboard host; frame-time probe and hand cursor; the existing focus border with the fork's `combinedClickable`).

Audited automatic merges: the typealias `NativePlayerCreate`, `NativePlayerBridge.create`, the controller call site and every native signature agree on the 13-argument order. `build.gradle.kts` gains `--add-opens=java.desktop/java.awt.event` for Compose touch scrolling only; the rewrite's supervisor is not changed because its WebView handles touch natively. Linux seeks match upstream (absolute seeks without `exact`, relative seeks exact). The desktop compile after the merge found only the missing import above.

## Behavior decisions

- **Implemented:**
  - **Plex and Silo sign-in.** Upstream registers both as media-server providers with their own sign-in flows (Plex: plex.tv approval in the browser or a link code, then server, Plex Home user and PIN; Silo: address, browser code or password, then profile and PIN). The new `ServerSignInBridge` hosts upstream's `PlexSignInFlow`/`SiloSignInFlow` unchanged and publishes their state as `servers.signIn` in the servers snapshot. The snapshot carries steps, link codes, server/user/profile names and fixed error text only; account and server tokens, Plex PIN ids, Silo device codes and sign-in page URLs stay in Kotlin, and `servers.signIn.openPage` opens the page from Kotlin. `servers.connect` now refuses Plex and Silo, so a password is never sent for them. React shows a guided dialog (`GuidedServerSignIn.tsx`) and the Plex/Silo logos; leaving the page, switching profile or closing the dialog cancels the flow (Silo withdraws a waiting code and ends an unsaved sign-in on the server), and a flow is dropped if the active profile changes under it. Kids mode is blocked.
  - **RTX Video HDR.** `nvidiaRtxHdrEnabled` in the playback settings snapshot and setter; a second toggle in the Windows-only NVIDIA RTX Video card.
  - **Downloads redesign.** The downloads snapshot adds live `bytesPerSecond` (upstream's smoothing), `watched`/`watchProgress`/`remainingMs` (upstream's `watchStatus`) and `customPoster` (the Library custom-poster setting); it is republished when watch progress or watched marks change. `downloads.pauseAll`/`downloads.resumeAll` call the new repository methods. The React page follows the new layout: a titles/size summary, Active (with Pause all/Resume all), one Downloaded section sorted newest first with show rows (episode count, size, "N downloading"), poster/thumbnail artwork with a watch-progress bar, speed, a Watched mark, a Go to details action, per-season summaries and the size-aware delete prompt. Upstream removed the strings the old page used, so this was also required for correct text.
- **Implemented through shared runtime:** exact seeks and resume position on Windows/macOS, media-server token renewal and account sync (`ServerRepository.callForPlayback`, `ServerSync`), Plex's remote-playback-blocked message (shown by the Kotlin player through `serverPlaybackMessage`), not offering header-signed server streams to watch parties, external episode-rating alignment, cast filmography filtering, the bounded Trakt library refresh queue and the Linux XWayland/overlay fixes.
- **Reference (Compose only):** keyboard/gamepad spatial navigation, focus rings, controller hint toolbar and sounds (`controller/*`, `NuvioFocusable`, `PlatformKeyboardNavigation`), Windows touch scrolling for Compose surfaces, the Compose hand cursor (the WebView already uses pointer cursors), the downloads action sheet (ported as inline row actions), settings-category focus handoff and the sideload `store-beta.json`.
- **Deferred:** gamepad navigation in the React shell. Upstream's controller engine targets Compose focus; the rewrite has keyboard navigation but no gamepad input. Recorded in `KNOWN_ISSUES.md`.
- **Locales:** regenerated (29 locales); only the English table changed in this batch.

## Validation

- Supabase RPC contract tests and scanner: passed (42 client RPCs, 50 migration functions). The batch adds no client RPC.
- Method sync, contract, locale and UI inventory generators plus `--check`: passed. 17 new methods (`servers.signIn.*`, `downloads.pauseAll`/`resumeAll`) are in the schema and the Rust allowlist. The inventory records the new Compose sources (Plex/Silo sheets, download action sheet, focus/keyboard/touch helpers); regenerating it acknowledges the review above, not parity, since gamepad navigation is deferred.
- Desktop Kotlin compile: passed after restoring the filter-title import.
- Windows desktop suite (`stageBridgeRuntime` + `desktopTest`): 2,289 tests, 1 skipped, 0 failures, including the real JNI/mpv/WebView2 `WindowsPlayerPresentationTest` (updated for the 13-argument `create`) and two new bridge tests (Plex/Silo refuse the generic password connect; a guided sign-in call with no flow fails and the snapshot is empty).
- Frontend: 104 files, 646 tests passed, 1 skipped, including new guided sign-in and downloads-redesign tests; `contract:check`, `tsc` and the production build passed. The lockfile is unchanged, so `npm ci` was not rerun.
- Rust: `cargo fmt --check`, 11 tests and the embedded shell build (`cargo build --locked --features custom-protocol`) passed.
- Launcher/release tests: 10 passed, 1 explicit host skip.
- `git diff --check`: clean.

Not run: Android host tests, CI (Supabase database tests and the all-platform build-only matrix) until the branch is pushed, real Plex/Silo sign-in and playback, RTX HDR on NVIDIA hardware, live downloads, macOS/Linux playback, installed upgrade and visual acceptance. No release was published and no version was bumped.
