# Upstream 0.1.39-alpha integration

- Previous upstream: `35bdb2a77ca86b4141588832a3fc3ca0c80bfc4d` (0.1.38-alpha)
- Target: `04c94b54334c6ad2a1b18f48393d2a31e0dda2fc` (the `0.1.39-alpha` tag). `upstream/Dev` (`1ece6d7ae`) had 12 more first-parent commits (Linux screensaver inhibit, Linux deb/rpm icons, home layout display-name spacing, pause overlay scale, desktop scroll stutter, Discord activity, ASS styling and sizing on desktop, HTTP/2 poster prefetch, drag-scroll parity, mpv end-file errors on macOS/Windows). They are left for the next batch to keep this one release-sized.
- Rewrite base: `4873cf0e7394f61c6f26a76de65232e1bc928ce4` (`feature/react-tauri-desktop-rewrite`, including the pending hero-trailer name ranking committed before the sync)
- Merge checkpoint: `cb72e7ea06029a5b5d4bd29d039ba5f59c729b2b` on `codex/sync-upstream-0.1.39-alpha`

The range is 142 files (about 10k insertions, mostly translations): rolling-window Home loading with desktop rows completed after their first page, controller navigation follow-ups and foreground-only controller input, JDK 25 packaging, desktop JVM heap flags, throttled download progress, subtitle shadow blur and a separate ASS/SSA style, RTX HDR applied to SDR sources only, mouse-wheel volume in the player, Linux overlay focus and X error handler fixes, the desktop source-fallback unlock, Traditional Chinese and `iw` Hebrew resources, and the mobile `cmp-rewrite` merges.

## Conflicts (9 files)

- `DesktopVersion.properties`: kept the fork's `0.1.38.1` / `54`. No version bump is part of this sync.
- `desktop-release.yml`: kept the fork's Tauri package matrix. Upstream's changes are the JDK 25 move for its jpackage jobs and pinned DEB/RPM release numbers, and the fork does not run those jobs. **Deferred:** moving the fork's private runtime (`bundle-java.mjs`, jlinked from the CI JDK, currently 17) to JDK 25 is a separate runtime decision, not a merge resolution.
- `HomeRepository.kt`: both sides had rebuilt desktop Home loading. The fork's version already has a sliding fetch window (`forEachHomeCatalogUpdate`), progressive first-page previews (`loadHomeCatalogPreview`), a 20-minute per-catalog freshness cache, and a section cache that survives while a profile's manifests resolve. React Home reconciliation and the "first hero preview" behavior depend on that pipeline. Upstream's rolling `Semaphore` window, `LoadedHomeRow`/`completeDesktopRows` continuations and `loadedRequestKey` short-circuit duplicate those features, so the fork pipeline is kept. Taken from upstream: the sorted request key (a reordered server addon list no longer restarts loading) and the addon name/subtitle applied on publish (renames show without a refetch; the fork's fresh-cache path then republishes without fetching). `DesktopHomeRows.kt` and its test are kept as upstream reference but are not called.
- `AddonRepository.kt`: added upstream's `shouldPushAddonsToServer` guard (only a registered, non-anonymous session pushes addons, rechecked after the debounce). Upstream's `isUsingPrimaryAddonsFromSecondaryProfile()` early return is not restored, because the fork replaced it with the primary-addons allowlist. The merge left duplicate `AuthState`/`AuthRepository` imports, which were removed in the checkpoint.
- `ShelfComponents.kt`: the fork's hover, interaction and coroutine-scope state, with upstream's `rememberSaveable` shelf group key.
- `DownloadsPlatformDownloader.desktop.kt` and `DesktopDownloadProgressTest.kt`: kept the fork's tested `copyDesktopDownload` helper at upstream's 1-second interval (`ProgressIntervalNanos`; the fork used 250 ms). Both tests are kept: the fork's fake-clock test (clock step raised to 4 ms per read so a timed update still lands) and upstream's real-HTTP once-per-second test.
- `values-vi/strings.xml`: upstream's file. The fork had not changed it from the base; the conflict was line-ending noise.
- `values-hu/strings_party.xml`: upstream's wording without the `%2$s` link argument, which the fork's base string no longer has.

Audited automatic merges: `NativePlayerBridge.setSubtitleAppearance` gained `shadowBlur`. The Kotlin declaration, `NativePlayerController.applySubtitleStyle` (via `toMpvSubtitleShadow`) and the Windows, macOS and Linux JNI implementations all agree. The Windows native delta only adds the shadow blur, the SDR-only RTX HDR filter (re-evaluated on `MPV_EVENT_VIDEO_RECONFIG`) and an `unknown*` track-language prefix check. The fork's cross-DPI WebView2, presentation acknowledgement and sizing code is untouched. `build.gradle.kts` adds `--enable-native-access=ALL-UNNAMED`, heap flags and `appRelease = "1"` for the Compose launcher and jpackage. `DesktopControllerInput` keeps the fork's `isPolling`. The desktop compile after the merge found only the duplicate imports.

## Behavior decisions

- **Implemented:**
  - **Source fallback on desktop.** The bridge reported `streamAutoPlayFallbackBlockedByEngineSwitch` from the Android-only engine-switch setting, so React could grey out "Fallback to next matching source on failure". It is now always `false` on desktop, matching upstream's `PlaybackStreamSettings` and `PlayerScreenRuntimeSourceFallback` fix. The key stays in the snapshot for contract stability.
  - **Traditional Chinese.** `generate-locales.mjs` now turns BCP-47 resource folders (`values-b+zh+Hant`) into the code `AppLanguage` saves (`zh-Hant`). Before this, a saved Traditional Chinese choice would have fallen back to Simplified `zh`. The language appears in React automatically through `AboutBridge` (`AppLanguage.entries`). `iw` (legacy Hebrew) is generated beside `he` and flagged RTL. Covered by a new `pickLocale('zh-Hant')` assertion.
- **Implemented through shared runtime:** subtitle shadow blur (native `sub-blur`), RTX HDR only for SDR sources, mouse-wheel volume and Shift/progress-bar seeking in the native player controls (`controls.js`), throttled download progress, the registered-session addon push guard, the sorted Home request key and addon renames, plugin media-type parsing, server profile device ids, addon sync eligibility and the addon HTTP text limit, and the Linux overlay/X error handler fixes.
- **Already covered:** foreground-only controller input. The React gamepad layer (`desktop-ui/src/gamepad/gamepadInput.ts`) already drops input unless the document is visible and focused.
- **Reference (Compose only / mobile):** controller navigation follow-ups and focus-border-only-during-navigation (`controller/*`, `NuvioFocusable`, Compose popups), the startup cached profile entry in `AppGate`, the separate ASS/SSA subtitle style and its modal (the desktop native player does not use `customizeAss` until upstream's later desktop ASS PR), Compose JVM heap flags, and the store/sideload JSON.
- **Deferred:**
  - JDK 25 for the rewrite's private runtime (see above), including `--enable-native-access` in `supervisor.rs`. The flag only matters on JDK 22+.
  - Upstream's heap flags (`-Xms128m -Xmx2g`, G1 free-ratio and periodic GC) for the Kotlin bridge launched by `supervisor.rs`. They target Compose/Skiko memory behavior, and the headless bridge needs its own measurement first.
- **Locales:** regenerated (31 locales: added `zh-Hant` and `iw`; es, fr, he, hu, pl, sk, tr, vi and en changed). Upstream switched several English Library labels to Title Case ("Select Type", "Sort Library", "Recently Added"). `LibraryControls.test.tsx` was updated to match, including the "hides the list chip" check that would otherwise have passed trivially.

## Validation

- Supabase RPC contract tests and scanner: passed (42 client RPCs, 50 migration functions). The batch adds no client RPC.
- Method sync, contract, locale and UI inventory generators plus `--check`: passed. No new bridge methods. The inventory records the new and changed Compose sources; regenerating it acknowledges the review above, not parity.
- Desktop Kotlin compile: passed after removing the duplicate imports.
- Windows desktop suite (`stageBridgeRuntime` + `desktopTest`): 2,321 tests, 1 skipped, 0 failures. This includes the bridge tests, the merged download-progress tests (3), `DesktopHomeRowsTest`, `ControllerForegroundGateTest` and the real JNI/mpv/WebView2 `WindowsPlayerPresentationTest`.
- Frontend: the full Vitest run found the 3 Library label failures above. After the test update the full suite passes: 111 files, 700 tests, 1 skipped. `contract:check` and the production build passed. The lockfile is unchanged, so `npm ci` was not rerun.
- Rust: `cargo fmt --check`, 12 tests and the embedded shell build (`cargo build --locked --features custom-protocol`) passed. No Rust changed in this batch.
- Launcher/release tests: 10 passed, 1 explicit host skip.
- `git diff --check`: clean.

Not run: Android host tests, CI (Supabase database tests and the all-platform build-only matrix) until the branch is pushed, live playback with subtitle shadows or RTX HDR, live downloads, a physical controller, macOS/Linux playback, installed upgrade and visual acceptance. No release was published and no version was bumped.
