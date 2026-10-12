# Fork changes vs. upstream

A detailed reference of everything this fork (`MichaelCommitsAt3AM/NuvioDesktopButBetter`) changes
compared to upstream [`NuvioMedia/NuvioDesktop`](https://github.com/NuvioMedia/NuvioDesktop).
It's meant for maintainers. The user-facing summary belongs in `README.md`.

## Baseline and how to regenerate

- **Upstream branch:** `NuvioMedia/NuvioDesktop` → `Dev`
- **Last shared commit (merge base) when this was written:** `b1e00724` (2026-09-28, "fix(windows): bundle
  jdk.accessibility so Access Bridge doesn't break launch (#747)")
- **Fork-only commits:** 39 non-merge commits (plus 12 upstream-sync merges). About 10 are `bump version` and
  several are CI/docs only.
- **Net diff vs. upstream:** 172 files, +9.9k / −0.8k lines. About 45% of that is the Supabase backend
  (migrations, tests, config).

To check what has changed since this document was last updated:

```bash
git remote add upstream https://github.com/NuvioMedia/NuvioDesktop.git   # once
git fetch upstream Dev
git log --no-merges --oneline upstream/Dev..HEAD          # fork-only commits
git diff --stat $(git merge-base HEAD upstream/Dev) HEAD  # full fork diff vs. upstream
```

Keep this file current: when a fork-only feature or fix lands, add it to the matching section below.

## React/Tauri desktop preview

Profile PINs use a shared Kotlin-style four-dot numeric keypad in the chooser, profile menu and editor, with automatic submission after four digits, visible failures and a server lockout countdown. Failed setup/removal now throws a bridge error instead of appearing successful. Successful mutations update cached lock flags immediately; account-password recovery reports errors explicitly. `20261012130000_profile_pin_repairs.sql` qualifies bcrypt calls using pgcrypto's installed schema, enforces four-digit PINs, retains account isolation and five failures → five-minute lockout, denies changes/removal during lockout, and broadcasts successful PIN changes to other devices. The repair was applied to NuvioSync on 2026-10-12 with user approval. SQL behavioral assertions passed in an isolated database with pgcrypto installed in both `extensions` and `public`; nine profile UI tests, TypeScript checking and the Kotlin backend build passed. Deployed database lint is clean, resolving the four PIN errors noted in the earlier add-on migration check. No release build was made; live cross-device and visual testing remain separate user checks.

The profile editor replaces the primary-profile one-time add-on copy toggle with “Sync add-ons with another profile” and a required profile selector. `addon_sync_profile_id` is persisted in account-scoped profile caches and the cloud profile pull; existing profile/cosmetic pushes leave this field untouched. Local add-on mutations update every linked member's cache, and supersede older pending pushes from that group. `20261012120000_profile_addon_links.sql` serializes account add-on writes, atomically replicates the full list to group members through the existing `sync_push_addons` RPC (including Kotlin clients), and adds an explicit link RPC returning the authoritative source snapshot. Empty lists, enabled states, names and ordering are preserved; source deletion detaches followers without erasing their lists. Cycles, self-links and cross-account sources are rejected. The old Kotlin editor retains its one-time copy option; the rewrite uses the new persistent link. Signed-in linking preflights server support before profile creation. Tests cover the editor flow, group membership/cache decoding, and database replacement, two-way updates, empty lists, isolation, unlinking, deletion and slot reuse. The migration was applied to the linked NuvioSync backend on 2026-10-12 after user approval. Validation includes five Kotlin group tests, four editor tests (17 frontend regression tests including playback), TypeScript checking, SQL behavioral assertions on an isolated PostgreSQL instance, and the Supabase RPC contract check. The development backend was staged; no release installer was produced. Remote migration history confirms installation. Remote SQL lint reports no new add-on-link function errors; it also reports existing `crypt(text,text)` resolution errors in four PIN RPCs, outside this change. Live two-device interaction remains a user verification step.

Profile selection now displays an isolated React loading overlay matching AppLoadingContent: a 44dp wordmark, 24dp gap and 40dp indicator over the selected profile backdrop. The SVG arc reproduces the Kotlin two-second easing and rotation. The overlay persists through profile reconciliation and Home loading, then fades out over 400ms; failed selection restores the prior session/content. This applies to both the full-screen picker and Settings profile switching. Two regression tests cover Home readiness and failure recovery (five frontend tests total). The supplied Kotlin recording was used as the visual reference. The rebuilt desktop preview was checked by selecting Michael: the logo/arc overlay appeared and loading completed into populated Home. Production frontend and embedded Tauri debug builds pass. Catalog backgrounds retain the previously documented limitation.

The React profile chooser follows `ProfileSelectionScreen` sizing, centered branding, colored circular initials, mesh-style background, staggered entry and press motion. Manage Profiles toggles edit badges and the Add Profile tile on the same screen. Startup respects `rememberLastProfileEnabled`, and `/profiles/choose` is accessible from the Settings profile menu. Selection still uses the Kotlin bridge, with errors and PIN handling retained. Newer authentication-session events now trigger reconciliation instead of being discarded against the loading snapshot epoch; a regression test covers startup without reloading. Custom URL backgrounds and avatars are rendered when supplied; catalog background image loading and exact color-interpolation parity remain migration work. Both installed Kotlin and rebuilt preview pickers were inspected on desktop; preview startup without reload, selection of Michael into Home, reopening from Settings and Manage/Done behavior were verified. Production frontend and embedded Tauri debug builds pass, as do all three frontend workflow tests. PIN entry and saving/deleting profiles were not exercised in this visual pass.

Home-only parity overrides live in `desktop-ui/src/features/home/homeParity.css`, using the Compose hero/gutter/card formulas. The Home action dialog and hover preview now mirror their original layouts; card holds support touch, horizontal rails hide scrollbars and expose hover arrows, and Home restores vertical position and hero selection after Details. Continue Watching merges progress/next-up by recency, splits future episodes only for SPLIT_UPCOMING and supports manual selection and restart without clearing saved progress. `DesktopPlayback.start` gains an optional restart flag in the isolated Kotlin bridge. Home remains partial: detailed motion, artwork/cache differences, collection variants and resume/release-alert behavior still require parity work. See [the comparison record](DESKTOP_HOME_COMPARISON.md).

Continue Watching readiness is based on the initial local snapshot rather than successful remote synchronization. Saved progress appears while sync and Next Up metadata continue in the background; empty snapshots collapse the section. Loading cards reuse Search's `PosterLoadingCard` shimmer, with artwork ratios matching the selected Continue Watching layout. Regression tests cover pending, locally available, empty, failed and profile-switch states.

The shared expanded title preview in Home, Search and Library remains mounted for a 160ms closing fade with a 2% shrink. Closing cards are inert; reopening cancels removal, and reduced-motion settings skip the movement. A regression test checks exit retention, reopening and eventual removal.

Right-click/hold title action dialogs dismiss with a coordinated 160ms fade, 2% shrink and 4px downward movement of the artwork and menu together. The blurred scrim fades independently without animating blur. This replaces competing CSS/Web Animations fades, makes closing controls inert, cleans up dismissal timers, and respects reduced motion. Poster and Continue Watching dialogs share the behavior.

Search renders incremental addon sections while the repository still reports loading, keeping returned shelves mounted and one shimmer row below them until outstanding requests finish. Query changes hide old results during debounce. A bridge/UI regression test covers partial and additive results, completion and query replacement. Downloads has scoped 1.08 content scaling, compact headings, 40–42px controls, smaller artwork and tighter spacing; touch controls retain 44px targets. Its empty-state instructions reflect the stream context-menu download action.

The release-mode Tauri shell launches Kotlin with the packaged backend directory as its working directory rather than the compiler's source checkout. Portable Windows builds include embedded production frontend assets, relative backend classpaths, native resources and a private Java runtime. Generated root executable/backend resources are ignored by Git. These are portable preview builds, not installers; WebView2 remains a Windows prerequisite.

On Windows the Kotlin backend subprocess uses `CREATE_NO_WINDOW`, so bundled `java.exe` does not open a console window at app startup. Its piped ready handshake and diagnostic logging remain available to the shell.

Details extras and watched snapshots now expose the primary playback action using the existing Kotlin series continuity resolver and saved movie progress. The rewrite displays `Resume` / `Resume Sx Ex` (or the resolver's play label), targets the resolved episode, and carries its progress and artwork into stream selection. Completed movies keep `Play`. Details and stream pages ignore cached details for another content id/type; Continue Watching route metadata provides the loading artwork immediately. Artwork elements are keyed by content and image URL so a previous decoded image cannot linger across title changes. Regression tests cover resumed movies, unstarted movies, resumed series routing, and unrelated cached title/episode artwork.

The series episode selector also defaults to the resolved playback action's season, including when progress arrives after episode metadata. Manual season choices take precedence for the current title. A title-specific component key resets the choice when navigating to another series; unavailable seasons fall back to the first regular season (or Specials when that is all the metadata contains).

The bridge restores MainAppContent's cloud-sync lifecycle: authenticated account/profile activation starts `WatchProgressSourceCoordinator` and `SyncManager.pullAllForProfile`, and foreground/background changes start or stop the shared periodic pull and request the shared throttled foreground refresh. Previously only focus changes triggered pulls, so focus before authentication or a later profile selection could leave Continue Watching local-only. The shared coordinator preserves Nuvio Sync/Trakt/Simkl source selection and the existing cloud merge rules; repository updates already publish Home and Home Extras events. Profile activation remains nonblocking. Lifecycle tests cover focus before sign-in, account/profile changes, background polling, guest sessions, and shutdown.

The optional `desktop-ui/src-tauri/tauri.windows-installer.conf.json` configuration produces an NSIS Windows setup executable for the rewrite. It installs for the current user, adds Start Menu shortcuts and an uninstaller, and embeds the WebView2 bootstrapper (internet is required if WebView2 is missing). `scripts/desktop-ui/package-windows-setup.ps1` validates a prepared backend's relative classpath and bundled Java, stages it, builds the production frontend and shell, and copies the setup to `Nuvio-Rewrite-Setup.exe` in the repository root. Pass `-BackendDirectory` to use a prepared runtime elsewhere; the default is the portable build's `resources/backend`. Generated setup binaries are ignored by Git. This local preview packaging does not publish a GitHub release.

Navigation follows the original Kotlin layout: Downloads is reached through Library, and Settings displays the selected avatar with a profile picker on hold (also accessible by right-click or Arrow Down). Content uses independent 1.22 scaling without enlarging the top bar. Discover uses an adaptive poster grid, virtualized grids account for actual card widths, and catalog/Continue Watching/Up Next/collection rows have scroll arrows at both ends. These changes stay inside the isolated React presentation layer.

Settings parity now uses the Kotlin four-category sidebar, nested routes, centered content pane and original-scale row/card spacing. It implements the General subpages for layout, discovery, addons, playback, integrations, Home, posters and Continue Watching; Account, About and Advanced pages; and dialogs for selection, addon/provider configuration, and confirmations. Kotlin bridge additions expose the corresponding preferences, addon metadata/actions, integration state, playback settings and About details. The pages were compared against the installed Windows app, including Account, About, Advanced, Content & Discovery, Playback, Addons and TMDB; the exhaustive checklist remains partial until all nested states and visual states are verified. This migration remains opt-in and does not change the Compose UI or release pipeline.

An opt-in desktop UI migration adds `desktop-ui/` (React/TypeScript presentation and Tauri supervision), `desktop-bridge/` (Kotlin repository adapters and protocol schema), `scripts/desktop-ui/generate-contract.mjs`, and `gradle/fork-desktop-ui.gradle`. The only existing application build edit applies this fork script from `composeApp/build.gradle.kts`. Upstream repositories, storage, sync and native playback are reused. The original Compose launcher and release pipeline are retained during migration. Playback still uses a separate native Compose player window, and the preview does not yet implement every original screen. See [DESKTOP_UI_REWRITE.md](DESKTOP_UI_REWRITE.md) for architecture, coverage, local preview build and upstream merge procedure.

The React stream-selection screen now mirrors the Kotlin desktop loading state: it shows active scraper names and four shimmer skeleton stream cards instead of a centered spinner in an otherwise empty results panel.

The expanded preview includes profile CRUD/PINs, auth-server/device options, catalog/discovery/history, rich details/entities/watched/shuffle, saved/cloud libraries, collection editing/import/export, downloads, stream filtering/autoplay/P2P, and nested preference/integration/community pages. Colors, sign-in contrast, app scaling, adaptive grids and full-width rails address the initial visual feedback. These features reuse Kotlin repositories; build success is recorded separately from user acceptance. `docs/DESKTOP_UI_PARITY.md` retains incomplete motion, localization, lifecycle, update-installation and delivery work. A 155-file UI fingerprint inventory flags upstream changes; RPC allowlist/type/validator generation lives under `scripts/desktop-ui/`. One existing UI source declaration is changed from private to internal (`SupportersContributorsRepository`) to reuse its community service. No release version or CI release pipeline is changed.

---

## 1. Own Supabase backend (version-controlled in `supabase/`)

Upstream's client talks to upstream's hosted Supabase project, and upstream keeps that schema private.
Its `.gitignore` even excludes `supabase/migrations/`. This fork runs its own Supabase project, and the
whole backend lives in this repo.

**Schema (`supabase/migrations/`)**, reverse-engineered from the RPCs the client calls:

| Migration | What it provides |
|---|---|
| `20260716050345_sync_foundation` | `set_updated_at` trigger helper, `sync_invalidations` table + `log_sync_invalidation` (feeds Realtime sync invalidation) |
| `20260716050346_watch_progress` | `watch_progress` + event log; full pull, delta pull with cursor, push, delete RPCs |
| `20260716050347_watched_items` | `watched_items` + event log; same full/delta/push/delete RPC set |
| `20260716050349_avatar_catalog` | `avatar_catalog` (readable by anon + authenticated), `get_avatar_catalog` |
| `20260716052538_profiles_and_pins` | `profiles` table and profile PIN locks: bcrypt-hashed PINs (pgcrypto), 5 wrong attempts → 5-minute lockout. RLS is on with **no** policies, so `pin_hash` can't leak through the REST API; all access goes through `SECURITY DEFINER` RPCs |
| `20260716052540_library` | `library_items`, `sync_pull_library` / `sync_push_library` |
| `20260716052541_collections` | User folders/lists (`collections`) |
| `20260716052543_home_catalog_settings` | Per-profile home-screen catalog layout |
| `20260716052544_profile_settings_blob` | Per-profile, per-platform settings blob |
| `20260716052545_provider_credentials` | OAuth/provider tokens sync (pull/push/delete) |
| `20260716052547_addons`, `…48_plugins` | Installed addons/plugins per profile |
| `20260716052549_profile_data_deletion` | `sync_delete_profile_data`: deleting a profile also deletes its data in every table |
| `20260731090000_registered_devices` | `registered_devices` + `register_current_device` (upstream client feature, backend added here) |
| `20260731090001_library_delta_sync` | `library_items_events`, delta cursor + `sync_pull_library_delta`, incremental `sync_push_library_items` / `sync_delete_library_items`. Library primary key becomes `(…, type)` so a movie and a series can share an id. Legacy `sync_push_library` keeps working for older clients |
| `20260814120000_profile_primary_addons_allowlist` | `primary_addons_allowlist` column on profiles (see §3) |
| `20260828120000_membership_and_cosmetic_catalogs` | `member_grants`, member avatar/background catalogs, `get_my_member_access`, `get_my_membership_overview`, `get_member_profile_avatar_catalog`, `get_member_profile_background_catalog`. Upstream 0.1.21 added client calls to these; without them, supporter features failed with `PGRST202`. This fork has no billing provider: membership is granted by hand in `member_grants` (service role only), and non-members get empty results |

**Edge function:** `supabase/functions/delete-account/` deletes the caller's own auth user (JWT verified). Every
table cascades from `auth.users`, so nothing needs per-table cleanup.

**Other backend files:** `supabase/config.toml` (local stack config) and `supabase/README.md` (local verification,
self-hosted deploy, smoke checks and rollback guidance).

**Tests and CI for the backend:**
- `supabase/tests/database/device_and_library_delta.test.sql`: pgTAP suite.
- `scripts/check_supabase_rpc_contracts.py`: static check that every RPC the Kotlin client calls exists in the
  migrations. It excludes the TV-login RPCs (see §10).
- `scripts/test-supabase-rpc-api.sh` / `test_supabase_rpc_api.py`: checks real PostgREST response shapes.
- `scripts/test-supabase-migration-upgrade.sh`: upgrade path from the pre-device/pre-delta schema with existing
  data. The held-back baseline is derived automatically, not hard-coded.
- `.github/workflows/supabase-database-tests.yml`: jobs `rpc-contract`, `fresh-database`, `upgrade-database`. Runs
  on pushes touching `composeApp/src/**/*.kt` or `supabase/**`. The Supabase CLI is pinned to `2.115.0`, because
  newer Postgres images grant anon `EXECUTE` by default and break the "anonymous clients cannot …" assertions.
- `.gitignore`: upstream's `supabase/migrations/` and blanket `scripts/*` ignores are deliberately **not** carried
  over. Re-drop them if an upstream sync brings them back.

Commits: `2e2059c5`, `a9d38dad`, `4602eddb`, `31d82522`, `fb4d0cef`, `329be165`, `b01f6b45`.

---

## 2. Updates come from this fork

- The desktop in-app updater (`AppUpdaterPlatform.desktop.kt`) checks `MichaelCommitsAt3AM/NuvioDesktopButBetter`
  releases instead of upstream's. The Android full flavor and iOS updater configs point here too, with
  pre-releases included.
- **Silent Windows MSI upgrade:** for an `.msi` update, the app writes a small detached script and exits. The
  script waits for the process to release its file locks, runs `msiexec` silently and relaunches the app.
  Previously the app force-exited and left the interactive installer wizard to be finished (or abandoned) by
  hand. If the app can't find its own executable path, it falls back to the old interactive flow.
- A truncated download now reports "download incomplete" instead of a generic failure.
- **MSI versioning:** `desktopReleasePackageVersion` is pinned to `1.0.<VERSION_CODE>`. The fork's MSI
  `UpgradeCode` is fixed, so `ProductVersion` must strictly increase every release. A value derived from the
  marketing version can't guarantee that across upstream syncs. `set-version.sh` now rejects a non-increasing
  version code.

Commits: `eee2644f`, `9d6f9407`, `5f320e3e`.

---

## 3. Profiles

- **"Use primary profile's addons" is now a one-time copy, not a live link.** In upstream, a secondary profile
  with `usesPrimaryAddons` read profile 1's addon list directly, and couldn't add, remove, reorder or toggle
  addons. In the fork, that option **copies** the primary profile's addons into the profile's own list (merged,
  never replacing). After that the profile manages its addons independently. The edit-locks in
  `AddonRepository` are removed.
- **Choose which addons to copy:** when creating or editing a profile, a new "shared addons" card offers
  *Share all* or *Choose specific addons*, with a checklist of the primary profile's addons
  (`PrimaryAddonsPickerCard` in `ProfileEditScreen.kt`). The selection is stored as `primary_addons_allowlist`
  and synced (§1).
- **New profiles inherit settings and home layout:** creating a profile seeds it with the active profile's full
  settings blob (`ProfileSettingsSync.seedProfileFromCurrent`) and home-catalog layout
  (`HomeCatalogSettingsSyncService.seedProfileFromCurrent`) *before* it is first selected. Otherwise its
  defaults could be uploaded first. A secondary profile that still has no remote settings or layout row
  inherits the primary profile's on first pull and saves it as its own. This also covers profiles created
  before the change.
- **P2P settings now sync** as part of the per-profile settings blob (enabled, upload, hide torrent stats).
- **Deleted-profile cleanup:** a profile slot reused after deletion no longer briefly shows the deleted
  profile's addons (`AddonRepository.clearLocalDataForDeletedProfile`).
- **Debrid connection is shared across profiles:** debrid settings storage (desktop, Android, iOS) is pinned
  to the primary profile's slot, so connecting Torbox/etc. once works for every profile.

Commits: `2e2059c5`, `4602eddb`, `93678608`.

---

## 4. Debrid and stream ranking

- **Prefer matching release titles** (`StreamTitlePreference.kt`): the default-on toggle under
  Settings → Streams moves clear title mismatches below matching releases without hiding them.
  Ranking uses parsed release titles, torrent names, filenames, or folder descriptions; it ignores
  punctuation, years and release metadata, and leaves missing or ambiguous titles neutral. A matching
  alternative is required before a mismatch is demoted. Existing ordering is preserved within each tier.
  This applies to stream lists, automatic selection (including next episodes and binge-group choices),
  and debrid result limits before truncation. It works with playable-link resolution on or off and
  adds no network requests or waiting period. `StreamTitlePreferenceTest` covers normalization, fallback,
  setting defaults/persistence, limits and automatic selection.

- **Manual API key entry:** the debrid connect dialog accepts a pasted API key (e.g. Torbox) as an
  alternative to the browser device-code flow. The app validates the key before saving it
  (`DebridSettingsPage.kt`).
- **Language-aware ranking** (`DebridStreamLanguageDetector.kt`, `DebridStreamPresentation.kt`):
  - Detects audio languages from filenames, descriptions and flag/globe emoji. It handles full names, 3-letter
    codes, short uppercase codes that collide with title words ("DE", "CHI"), glued dub/sub tags ("HebDub",
    "PLDUB", "ESub") and camel-cased words ("SubsPlease").
  - A language next to a subtitle marker counts as a subtitle, not audio. Sizes like "14.4 GB" and "DTS-ES"
    are ignored.
  - A stream with no language tag is assumed English, unless it only has a bare subtitle marker or an unlisted
    language. Multi/dual audio counts as including English. This fixes upstream, where untagged English
    releases sank to the bottom and "Required = English" hid them.
  - Once any "Preferred …" rule is customized, results sort automatically. Foreign-only streams go last, then
    the order is resolution, quality, HDR, audio, channels and encode, with an explicit preferred-language tag
    breaking ties before size. The manual "Sort results" setting is hidden.
  - Unit tests: `DebridStreamLanguageDetectorTest`, `DebridStreamPresentationTest`.
- **20 more languages** in the debrid language pickers and formatter labels: Hungarian, Hebrew, Russian,
  Ukrainian, Arabic, Turkish, Tamil, Telugu, Malayalam, Kannada, Dutch, Swedish, Norwegian, Danish, Finnish,
  Greek, Romanian, Thai, Vietnamese, Indonesian.

Commits: `eee2644f`, `6ecbf8c7`.

---

## 5. Streams screen: "Data saver" download filter

The rewrite's stream-selection bridge now reads string fields from the RPC parameter object instead of treating that object as a JSON primitive. This fixes the `BridgeError` when choosing Data saver (and the same reader used by other stream actions). Invalid or missing fields return `INVALID_ARGUMENT` without mutating the filter. Mode switching continues to use `StreamsRepository` and `DownloadStreamFilter.apply`, matching Kotlin's resolution/source/size rules. Successful switching clears previous action errors. Bridge regression tests cover both modes, malformed arguments, and the All providers filter.

New feature on every platform (`features/downloads/DownloadFilter*.kt`, `StreamsScreen.kt`,
`StreamsTabletLayout.kt`):

- A **Best quality / Data saver** chip next to the addon filter row on the streams list.
- *Data saver* hides streams above user-set limits. A tiny hint shows how many streams were hidden, and an
  empty state appears when everything was filtered out. The limits are:
  - max resolution (default 1080p)
  - allowed source types (default WEB-DL + WEBRIP; also REMUX, BluRay, HDTV, DVD, CAM)
  - max file size (1–20 GB, default 8 GB)
  - whether streams of unknown size are shown (default: hidden)
- Resolution and source are classified from the stream title/filename/metadata. Size comes from addon hints or
  debrid cache info. Streams with an undetected resolution or source are never hidden for that reason.
- Settings live on a new **Download filter settings** page. You open it from the Downloads screen (tune icon),
  or by long-pressing / right-clicking the chip. Settings are stored per profile.

Commit: `93678608`.

---

## 6. Desktop player

- ~~Hold Space for 2× speed~~: added by the fork in `9d6f9407`, then **superseded by upstream's own
  hold-to-speed gesture** (`6406c2f8`, `945869a8`), which replaced the fork's `controls.js` code in a sync. The
  fork's `KeyboardHoldSpeedStart/End` actions remain in Kotlin but nothing sends them any more (see
  Housekeeping).
- **Subtitles resolved before playback starts** (fixes a freeze/spinner on the first subtitle switch):
  - Addon subtitle files are downloaded to a local cache on a background thread before mpv sees them
    (`DesktopSubtitleFileCache.kt`). mpv's `sub-add` no longer blocks its core thread on an HTTP fetch.
  - Preferred audio (`alang`) and subtitle (`slang`) languages, or "subtitles off", are passed to mpv at load
    time in all three native bridges (Windows, macOS, Linux). A simple preference then resolves in the same
    demuxer pass instead of a mid-playback track switch. Language codes are expanded to ISO-639 aliases, and
    `gb`/`en-gb` map to English.
  - Initial playback waits until audio/subtitle selection is applied, with a bounded retry so it can never
    hang.
  - Fixed the Linux bridge's JNI `create()` signature. It was missing `preferredAudioLanguages`, which
    silently misaligned every parameter after it.
- **Controls behaviour (`controls.js`):**
  - In windowed mode the controls show while the pointer is over the player, and always while paused. In
    fullscreen they auto-hide after 2.5 s.
  - Clicking a control button no longer stops auto-hide forever. Only keyboard (`:focus-visible`) focus counts
    as interacting.
  - `F` toggles fullscreen. `Esc` exits fullscreen, debounced so one press doesn't toggle twice.
  - The play/pause button follows the user's intent immediately, instead of the engine snapshot that lags by a
    poll interval.
  - Episode panel: rows are no longer rebuilt on every mouse move (fixes thumbnail flicker). It scrolls to the
    current season and episode, and a "Specials" (season 0) entry no longer breaks season selection.
  - Fullscreen toggles send only the fullscreen flag, not the whole controls payload.
- **Keyboard focus after alt-tab:** when the window regains focus, keyboard focus goes back to the Compose
  surface and to the embedded player. Shortcuts like Space work without clicking first (`DesktopWindowFocus.kt`,
  `Main.kt`).
- **Stability (Windows native bridge):**
  - Live-handle registry guarding the JNI boundary against use-after-free and double-dispose.
  - mpv is stopped before its window is destroyed.
  - The player host releases native resources before its HWND goes away.
  - A duplicate Back from the native controls is ignored.
  - Native layout refreshes only when the size actually changes (`refreshLayout`).
- **Skip intro API** now authenticates with an `X-API-Key` header instead of `Authorization: Bearer`.

Commits: `2e2059c5`, `a858b642`, `9d6f9407`, `4e0cd7aa`, `02178f06`.

---

## 7. Desktop window and fullscreen

- **Fullscreen restore no longer collapses the window:** restoring fullscreen at launch now waits until the
  window is really on screen, then re-asserts the fullscreen rect once. Before, it could capture Windows'
  132×37 minimum rect as the restore point and persist it, so every later launch opened as a sliver.
- Fullscreen uses per-monitor DPI-correct bounds resolved natively. This fixes the wrong rect on mixed-DPI
  multi-monitor setups.
- An implausible window geometry (<400×300, NaN) is never saved or loaded. The window has a 400×300 minimum
  size.
- Window state writes are debounced and moved off the UI thread, then flushed on close
  (`DesktopWindowModeStorage.kt`).
- `Esc` exits app fullscreen.

Commits: `2e2059c5`, `7b11ff6a`.

---

## 8. Performance and smoothness

**Startup (desktop):**
- `Desktop.getDesktop()` URI-handler setup (can take seconds on Windows) and the native player library preload
  now run on background threads, so they don't delay the window appearing.
- **Windows:** the native player bridge and its runtime DLLs ship as jpackage *app resources* in the install
  directory. They used to be embedded in the jar and extracted to `%TEMP%` at runtime, a write-then-load
  pattern that antivirus heuristics flag (`prepareWindowsAppResources` in `build.gradle.kts`,
  `NativePlayerBridge.findAppResourcesLibrary`).

**Images (desktop):**
- `NuvioSkiaImageDecoder` decodes artwork straight to layout size with mipmapped linear filtering. It enforces
  payload/dimension limits for untrusted addon artwork and checks for cancellation. This replaces the old
  draw-time `desktopImageScaling` path, which is removed.
- Coil memory/disk caches are sized from physical RAM (memory 128–320 MB, disk 300 MB). The disk cache lives in
  a proper OS cache directory (`%LOCALAPPDATA%\Nuvio\Cache`, `~/Library/Caches/Nuvio`, `$XDG_CACHE_HOME/nuvio`)
  instead of Coil's `%TEMP%` default (`DesktopCachePaths.kt`, `DesktopImageCacheConfig.kt`).
- Memory cache keys are bucketed by role (`NuvioImageCacheBucket`: shelf poster/landscape/logo, hero
  backdrop/logo, collection), so the same URL used as a hero backdrop and a shelf card no longer evicts itself.
  The fallback-poster interceptor re-keys correctly.
- No crossfade and low filter quality on dense shelves to cut render cost during catalog loads.

**Home screen:**
- `HomeRepository` reuses unchanged catalog section instances across publishes, so shelves don't all
  recompose on every batch.
- Poster card style is computed once per shelf instead of once per card.

**Details screen:**
- Details show addon metadata immediately. TMDB enrichment, MDBList enrichment and per-season episode
  metadata then load in the background in stages, instead of blocking the screen. Navigating away cancels
  stale loads.
- TMDB requests are capped at 3 concurrent.
- "More like this" tops up TMDB recommendations with TMDB "similar" titles when there are fewer than 12. If
  Trakt returns nothing, the TMDB recommendations are kept instead of clearing the section.

**Scrolling:**
- Custom desktop fling (`DesktopFlingBehavior.kt`): a lower-friction exponential decay keeps the real release
  velocity, so trackpads glide naturally. Velocity is clamped so a single mouse-wheel notch can't fling to the
  end of a list. Applied to most scrollable screens and panels.
- **Shelf page arrows:** hovering a shelf on desktop shows animated ◀ ▶ buttons that page the row smoothly.

Commits: `2e2059c5`, `a858b642`, `6fe8671e`, `93678608`.

---

## 9. Reliability

- **Addon manifests retry:** a failed manifest fetch retries with exponential backoff (2 s → 30 s, 6
  attempts). This covers cold-start network hiccups that used to leave an addon and its home catalogs empty
  for the whole session.
- `AddonRepository` state is now thread-safe (lock around init/profile/refresh bookkeeping; no duplicate
  concurrent fetches).
- **Continue Watching metadata retry:** entries still missing metadata after a resolution pass are retried
  with bounded backoff, instead of showing a raw id.
- The home screen doesn't re-fire "first catalog rendered" when returning from details.
- Recent searches are capped at 5 displayed entries.

Commits: `2e2059c5`, `a858b642`.

---

## 10. Upstream features gated off on this fork

| Feature | Why | How |
|---|---|---|
| Trakt sync UI | No Trakt credentials are shipped | The Trakt provider card, the Trakt-only "Viewing & discovery" section, the Trakt options in library/watch-progress source pickers, and their settings-search entries are commented out. Client code is kept to ease merges. Release workflows no longer require `TRAKT_CLIENT_ID/SECRET` |
| TV/device-link login ("six-character codes") | Backend RPCs (`start_device_login_session`, `poll_tv_login_session`) and the `tv-logins-exchange` function don't exist here | `ServerConfiguration` sets `tvLogin = false`. The RPCs are excluded from the contract check. Client code is kept |

Commits: `aa65e2a1`, `e50b2d73`.

---

## 11. Diagnostics (desktop)

- `DesktopDiagnostics`: synchronous breadcrumb log at `<data dir>/logs/nuvio-player.log`. It rotates at 8 MB
  to `.previous.log`, catches uncaught exceptions, and copies JVM `hs_err_pid*.log` crash reports into
  `logs/crashes/`. It records startup phase timings, player attach/dispose lifecycle and a 60 s playback
  heartbeat. It never logs URLs, headers or user data.
- `KermitFileLogWriter`: mirrors Info+ app logs into the same file until playback starts, so startup bugs can be
  reported with one file.
- Opt-in image/frame telemetry (`-Pnuvio.desktop.imageTelemetry` / `frameTelemetry`, or the
  `NUVIO_DESKTOP_IMAGE_TELEMETRY` / `NUVIO_DESKTOP_FRAME_TELEMETRY` env vars). Off by default.
- **`StreamLoadTimeline`** (temporary): writes per-playback stream-load timings to `logs/stream-timing.log`.
  It's marked `STREAM-LOAD-TIMELINE` throughout and meant to be removed after testing.
- Extra logging around home catalog settings and empty home publishes.

Commits: `2e2059c5`, `a858b642`, `93678608`, `d18426ff`.

---

## 12. Build, release and CI

- **Versioning:** desktop `VERSION_NAME` is `Major.Minor.Patch.Fork`. See `CLAUDE.md` → Versioning / Desktop
  release process. `set-version.sh` enforces strictly increasing version codes.
- **`desktop-release.yml` adapted for the fork:**
  - Sentry secrets are optional; source-bundle upload is skipped without a token.
  - The AppImage website points here.
  - Release titles are `<base> - Fork update <n>` / `<base> - sync with upstream`, published as Latest.
  - Windows MSI verification looks for native DLLs in app resources.
  - The DEB check accepts file names without the release segment.
  - Markdown-only changes after the bump commit don't block a release.
  - Upstream-sync-only releases get a release note instead of failing on empty notes.
- `pr-template-check.yml` (upstream's PR-template/contribution-policy gate) is disabled on this fork with an
  `if: github.repository == 'NuvioMedia/NuvioDesktop'` guard, so it's skipped here but unchanged for upstream.
- `update-store-source.yml` no longer runs on desktop releases: it always failed looking for an `.ipa`.
- `scripts/linux/configure-desktop-runtime.sh` no longer requires Sentry/Trakt secrets.
- `buildWindowsPlayerBridge` is a typed, configuration-cache-compatible task that rebuilds when its inputs
  change. Upstream used a plain `Exec` that only ran if the DLL was missing.
- `jdk.management` is added to the bundled runtime modules (needed for physical-RAM cache sizing and startup
  timing).
- `gradle.properties`: daemon heaps are reduced to fit a 16 GB machine, and parallel builds are on.
  `gradle/gradle-daemon-jvm.properties` pins the daemon JVM to 21.
- `CLAUDE.md` documents the project and the fork's release process.

Commits: `ebfe83f5`…`010ad2a2` (bumps), `679f78e2`, `5f320e3e`, `9b67e4e3`, `823b3580`, `835f946c`,
`9de1f8f0`, `d28a5791`, `7a2ba793`, `c3776eec`, `c2d15ed2`.

---

## Housekeeping notes

- `scratch_debrid.diff` at the repo root is a leftover working diff (committed in `eee2644f`), not part of
  the app. Safe to delete.
- `StreamLoadTimeline` / `StreamLoadTimelineFile` and the `// STREAM-LOAD-TIMELINE` call sites are temporary
  instrumentation (§11).
- `PlayerControlsAction.KeyboardHoldSpeedStart/End` (and their mapping in `NativePlayerController`) are dead code
  since upstream's hold-to-speed replaced the fork's (§6). Remove them, or keep them to reduce merge friction.
- Several fork changes deliberately comment code out instead of deleting it (Trakt UI, debrid "Sort results",
  TV login) to keep upstream merges simple.
