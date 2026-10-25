# Fork changes vs. upstream

A detailed reference of everything this fork (`MichaelCommitsAt3AM/NuvioDesktopButBetter`) changes
compared to upstream [`NuvioMedia/NuvioDesktop`](https://github.com/NuvioMedia/NuvioDesktop).
It's meant for maintainers. The user-facing summary belongs in `README.md`.

### Details title artwork loading — 2026-10-25

Details shows a logo-sized shimmer while title artwork loads and decodes, then fades in the ready image instead of briefly displaying a large text title. It also waits while metadata is still loading before choosing a no-logo fallback. Missing artwork, download/decode failures and a failed image paint retain a readable text title. The retained-image hook exposes pending/failure state without changing existing URL-only consumers; an already decoded logo remains visible during enrichment and failed replacements. The placeholder reserves the normal responsive logo dimensions, announces loading accessibly and disables animation for reduced-motion users. Twenty targeted title-artwork, retained-image and Details navigation tests passed.

### Restore Kotlin-style top-bar drag selection — 2026-10-25

The React top bar prevents native browser link/image dragging from cancelling its pointer gesture. It uses the existing port of `JellyMotion.kt` for spring movement, press/stretch feedback, rubber banding, clamping and nearest-tab release selection, and now feeds the final pointer-up coordinates into that motion just like `detectJellyTabGestures`. Screens change only on release; the following synthetic click is consumed. Claimed drags clear the Settings profile-hold timer, while opening the profile menu cancels a pending gesture. Cancellation restores the active tab. Reduced-motion users see the bubble track the pointer directly without spring animation. Regression coverage exercises real route links, avatar drag suppression, scaled coordinates, release rounding, both drag directions, cancellation, ordinary clicks and profile-menu interruption.

Validation: all 18 targeted navigation/physics tests and the frontend production build passed. The embedded Windows debug build passed and was relaunched with a fresh backend ready handshake. Live mouse/touch acceptance remains for review in the running app.

### Fullscreen icon stays stable during navigation — 2026-10-25

The shared fullscreen button initializes from the last confirmed native window mode instead of resetting to windowed on each screen mount. The initial application query waits to display a mode icon until the state is known; subsequent screens keep the confirmed icon while refreshing it. Native resize events and successful toggles update the retained state. Regression tests cover delayed initial queries, navigation in both modes, navigation after toggling, external changes and failed toggles. All 12 fullscreen tests, the frontend production build and the embedded Windows debug build passed; the debug app was relaunched for visual review.

### Details action confirmations and unclipped hover buttons — 2026-10-25

Watched/unwatched and library add/remove actions now show a top-center confirmation toast in the native network-toast style, with a 2.5-second lifetime and reduced-motion support. Messages follow successful backend responses; failed operations keep their inline errors. Title/profile changes suppress stale confirmations. Watched and library buttons retain their circular shape on hover by using color feedback without enlarging beyond their animation slots. Regression coverage exercises all four confirmations, automatic dismissal and rejected requests. Library shelf tracks regain top hover clearance without shifting their resting card positions. Downloads removes the inherited centered maximum width and uses Library's compact outer gutters for its title, filters and content. The same fullscreen/restore control already used by Library is now available in Search, Downloads and every Settings page, sharing its top-right placement, resize-state tracking and native toggle behavior. Validation: all 451 frontend tests passed across 76 suites; the production frontend build and embedded Windows debug build passed. The updated debug app was relaunched successfully and received populated Home/Details state.

### Settings search, navigation polish and Details artwork — 2026-10-25

Clicking a settings search result now centers its highlighted control after the destination pane completes its initial scroll reset/restoration. The target still waits for asynchronously loaded controls, receives keyboard focus without activating the setting, and cancels pending scrolling on navigation. Selecting the same result again also repeats the jump. Connected Services, Details page and their shared settings subpages use the same icon-only back-link markup as other settings pages, retaining an accessible label while removing hidden text that introduced an extra flex gap and offset the arrow inside its hover background. The Hover Preview navigation card and its settings-search entries are commented out at the user's request; the underlying implementation and saved preferences are retained. Settings scroll initialization now runs before passive search targeting so it cannot overwrite the destination position. Regression tests exercise the real settings layout together with search targeting, delayed controls, repeated selection and cleanup. All 64 settings tests passed. On wide Details pages, the backdrop shade now fades horizontally from the protected left content column to a much lighter right edge; compact layouts retain uniform contrast and stream-selection shading is unchanged.

### Upstream 0.1.32 and current desktop follow-ups — 2026-10-25

Syncs the React/Tauri rewrite with pinned upstream `5e18596aa919a6a4e7b6cdee7f90dfaabbf71b00`, preserving upstream merge ancestry and fork version `0.1.31.4`/44. Adds native audio/video badge settings, mpv language/title matching, release-aware next-episode selection, richer featured metadata and optional MDBList Home ratings, animated-artwork playback preferences, embedded-image SVG support and localized library status titles. Retains bounded image work, kids policies, source identity/episode-scroll fixes and signed Tauri update packaging. Watch-party chat/companion stays disabled pending its absent backend. Full decisions and candidate validation: `UPSTREAM_SYNC_2026-10-25.md`.

### Preserve episode browsing during playback updates — 2026-10-24

Native Episodes rows no longer recenter the playing episode whenever progress or watched-state updates change their contents. Row rebuilds retain scrollTop; alignment happens once when opening the panel or choosing a season, including when the initial episodes arrive asynchronously. Routine updates no longer scroll the season strip. Choosing a season no longer passes the panel-open flag that reset it to the playing season. Six native panel DOM tests passed, including progress updates, reopening, delayed loading and explicit season selection.

Follow-up: the native playerControls transport was still passing true to render for every Sources/Episodes state push, which the Episodes renderer interpreted as a fresh opening. State pushes now use the normal update path; only explicit opening requests signal panel-open alignment. Sources filter alignment now follows the same opening semantics. All seven panel tests passed, including a regression executing the production native state-push handler repeatedly while scrolling both directions and browsing a different season. Live playback scroll acceptance remains pending.

### Identify the playing stream in native Sources — 2026-10-24

The React/Tauri playback bridge passes the original selected StreamItem into the native player. Startup derives its active identity using the same source identity function as the Sources list instead of relying on the resolved playback URL. This preserves the existing native Playing chip and accent border/background for debrid, hashed direct and prepared server streams. Credential-refresh retries update the active identity too. Source rows expose aria-current for the playing item. Same-name sources remain distinguished by source identity.

Validation: all three targeted Kotlin identity tests and four native panel DOM tests passed, covering resolved URLs, same-name alternatives and legacy URL/torrent fallbacks. Bridge staging and the Windows debug shell build succeeded; the updated app was relaunched and responds. Live playback acceptance remains pending.

### Kids setup enables TMDB metadata with the same key — 2026-10-24

Kids profile setup now explains that its validated TMDB key is also saved in that profile’s device-local TMDB credentials. A newly enabled kids profile starts with TMDB enrichment on, including its existing trailer module; users can disable enrichment normally. Key replacements and ordinary kids/rating edits preserve an opt-out. Setup targets the child’s storage while the parent remains selected and updates only the child’s TMDB enable preference in the cloud settings blob, retaining other preferences and excluding the key. Failed KidsScreen validation does not save the key locally. Existing kids configurations require re-entering the key once on each device because KidsScreen cannot return its server-held key. The separate trailer fallback was removed, so turning enrichment off also stops TMDB trailer fetching. Localized video lookup still tries English when needed.

### Use the profile chooser for profile management — 2026-10-24

Removed the redundant standalone Profiles list. Existing `/profiles` links redirect to `/profiles/choose`, where Manage Profiles opens the existing editors for creating, editing and deleting profiles. Profile switching and PIN prompts remain in the chooser and avatar menu; Remember the last profile remains in Settings → Advanced. The account settings description explains the management entry point.

### First available featured titles during cold startup — 2026-10-22

The earlier settled-list guard hid usable Kotlin hero previews until HomeRepository completed every catalog and preview page. On an empty cache, the featured skeleton therefore waited for the slowest request, in adult and kids profiles alike. React now displays the first nonempty Kotlin hero preview immediately, holds it during subsequent loading updates, and retains that first title in the completed selection if it is still eligible. Profile changes reset the selection; an empty completed Kotlin selection still removes it. Kotlin source/rating policies and catalog fetching remain authoritative and unchanged.

Validation: all 17 targeted Home regression tests and the frontend production build passed. The user confirmed the fix works in the debug shell with an isolated copy of existing profiles/settings, empty content/artwork/webview caches and cached add-on manifests removed. Exact startup timings and a completely new account/install remain unmeasured; this removes a confirmed UI wait and does not guarantee a particular startup duration.

### Flatpak CI dependency download recovery — 2026-10-22

Previous successful Flatpak jobs installed Linux dependencies in 62–74 seconds and completed in roughly 13 minutes. Release 0.1.31.3's first attempt spent over 35 minutes fetching Ubuntu packages from the Azure archive, and its retry again remained in dependency installation for over 15 minutes. Flatpak CI now substitutes Ubuntu's main HTTPS archive for the Azure regional mirror and configures 30-second APT connection/inactivity timeouts with three retries. Other platform dependency setup is unchanged. A Flatpak-only build can be attached through `publish-ready` using `flatpak_run`; CI checks that the separate Flatpak job succeeded with identical application/version sources before downloading its artifact. The published packages/updater feed remain unchanged.

### Publish completed packages while Flatpak finishes — 2026-10-22

At the user's explicit request for release 0.1.31.3, the desktop CI workflow adds `publish-ready` with an existing source run ID. It requires successful Windows, both macOS and all three signed Linux updater-package jobs, identical application/version sources and nonempty signed updater targets. Only Flatpak may be absent. It publishes the original CI artifacts, checksums and full signed updater feed without rebuilding or local packaging. The same CI mode can append a subsequently completed Flatpak and refresh checksums while preserving the published updater feed/packages. Ordinary draft/publish runs still require all platforms. This is an explicit exception to the usual all-platform release sequence; Flatpak delivery remains pending until its artifact succeeds.

### Release notes survive GitHub API failures — 2026-10-22

The desktop release workflow falls back to offline repository-history notes when GitHub PR lookup fails, replacing any partial online output. Its empty-note fallback also runs offline. This addresses the repeated invalid-JSON failures in release run 39802032418 before platform builds started. Version/tag checks, platform tests, package validation and publication gates remain unchanged.

### Kotlin-style Media servers presentation — 2026-10-22

The rewrite Media servers overview follows `MediaServersSettingsPage.kt`: SERVERS and ADD SERVER groups, the original empty-state copy, connected-server navigation and individual provider rows using the original Jellyfin bitmap and an SVG transcription of the Emby vector. The generic inline provider selector/credential form is replaced with provider-specific sign-in dialogs matching the Kotlin labels, help text, outlined fields, password visibility control and full-width Connect action. Connections open a separate Server view with identity, options, libraries, refresh, sign-in-again and removal actions. Disabled servers disable dependent switches and refresh. Kotlin remains responsible for connecting, library selection and persistence through the existing bridge methods. Credential clearing and profile-generation guards are retained.

Validation: targeted connection, library/removal, profile-switch and provider-dialog regression tests and TypeScript compilation passed. Pixel-for-pixel comparison in a running native window and live Jellyfin/Emby sign-in remain pending; the existing bridge exposes fewer provider capability/failure details than the original Kotlin UI. No backend/schema or installed-app update is included.

### Stable featured artwork during Home startup — 2026-10-22

React Home publishes settled Kotlin hero lists to its carousel, rather than rendering each partially loaded catalog preview (whose shuffled first item changes as catalogs arrive). Initial loading retains the existing shimmer; background refreshes retain the last settled list. Snapshots are scoped to the active profile. Image decoding/preloading and normal carousel navigation remain unchanged. Regression coverage checks intermediate reordered lists, the final first title and background refresh retention. Live startup visual acceptance remains pending.

### Fullscreen player controls respond to mouse movement — 2026-10-22

The native player controls used by the rewrite now reveal idle fullscreen chrome on pointer movement before resetting the inactivity timer. Previously the fullscreen hover policy left controls hidden and the activity handler ignored hidden controls, requiring a click to recover them. Locked controls and playback-error visibility remain governed by their existing policies. Regression coverage executes the production pointer handler for repeated hide/reveal cycles and locked, error and windowed states. Live native playback acceptance remains pending; this source change does not update the installed app.

### Shared floating fullscreen controls — 2026-10-20

All six existing fullscreen/windowed controls (Home, Library, title details, Collections, profile editing and stream loading) now share `components/FullscreenButton.tsx`. They float at a fixed top-right viewport position and portal outside their scrolling/animated screen trees so scroll offsets, clipping and transforms cannot move them away. Home also exposes its control with an empty, loading or disabled hero, and cached Home removes it while another route is visible. Stream loading's close-player action is offset to avoid overlapping the floating control. Targeted Home and Library tests cover portal placement and Home hide/restore behavior. Visual scrolling/fullscreen acceptance across the screens remains user-led.

The shared button reads the actual Tauri window state on mount and resize, switches between expand/contract icons and labels the next action as Enter/Exit fullscreen. This also follows fullscreen changes made elsewhere, including Escape. Toggle failures retain the current state and report through screen error displays where provided; the resize listener is released on unmount. Component regression tests exercise an initially fullscreen window, both toggle directions, external changes and failed transitions. Validation: all 421 frontend tests across 71 suites passed, as did generated-contract checks, the production frontend build and the embedded Windows debug-shell build. The updated debug app was reopened for visual acceptance.

### Kids profiles have full feature access with content filtering — 2026-10-20

The user explicitly requested removing feature restrictions while retaining KidsScreen's content/rating filters. Removed React's route allowlist/parent-profile placeholder, the hidden Add Profile tile, the offline-download route exclusion and the kids-only download-notification exclusion. The Kotlin bridge no longer rejects feature operations through a default `PARENT_REQUIRED` gate; kids profiles can manage profiles, settings, collections, addons and downloads, including editing Kids settings. Ordinary account authorization, destination profile PINs, profile limits and addon isolation still apply.

KidsScreen remains the kids browsing source; catalog restrictions, rating checks, reply/event filtering and native playback validation remain authoritative in Kotlin. Download snapshots now expose individually verified titles rather than being unconditionally emptied. Download enqueue, playback and mutations validate their repository-backed movie/series identity, and notification hosts reset when profiles change. Unidentified cloud files and free-text search history remain filtered because they lack a verifiable title identity; direct cloud playback fails the title check rather than bypassing it. Cloud/history RPC replies use the same filtering as their events. Supporting cloud files requires a trustworthy metadata mapping, which is outside this change.

Validation: all 17 targeted Kotlin kids-policy/configuration/addon-copy tests passed and the runtime was staged. The profile/menu/editor/bridge/download-notification frontend suites passed (103 tests), followed by the updated Home/bridge/menu/notification suites (89 tests). Tests cover unrestricted profile/download routes and profile creation while retaining destination PIN entry, backend feature access without a title check, blocked title operations and filtering download entries by parent title. Generated contracts, the production frontend build, embedded Windows debug-shell build and Supabase RPC contract checks passed (42 client RPCs/50 migration functions). No database or protocol shape changed. The updated debug app was relaunched with both this change and the floating Home fullscreen control. Live feature, rating-filter and scrolled-fullscreen acceptance remain user-led.

### Featured carousel waits for its background — 2026-10-20

React Home starts each featured title's eight-second automatic rotation interval only after `HeroBackdrop` reports that the background bitmap has loaded and decoded. Missing or failed artwork settles normally so automatic rotation remains available. Readiness is scoped to the profile, title and background URL; replacing a title during loading resets its interval even when the hero count stays unchanged. Manual swipe, keyboard and dot navigation remain available while artwork loads, and the existing visibility/drag/reduced-motion pauses remain in place.

Validation: all 19 Home/carousel and backdrop tests passed, including slow image loading, delayed decoding, subsequent slides, replacement titles, cached images, obsolete completions and decode failures. Generated contracts, production frontend and the embedded Windows debug-shell build passed, and the updated debug app was reopened. The user confirmed that the preceding cold-local-cache profile-loading change now feels good; visual acceptance of this independent carousel timing change remains user-led.

### Progressive Home cards after profile switching — 2026-10-20

Desktop Home previously fetched up to four catalog pages (64 titles per shelf) before publishing any cards. This amplified the wait when switching to KidsScreen, whose catalog pages require server-side rating lookups. The Kotlin Home repository now publishes each accumulated page immediately, while the remaining preview pages load with the existing four-worker concurrency limit. Every ready shelf update is published rather than waiting for an eight-result threshold. The React/Tauri Home already renders partial shelves and uses this without a protocol change. Catalog sizes, pagination offsets, custom posters, release filters and bridge kids-policy verification remain in place. Only finished previews receive a fresh cache timestamp; cancelled or failed continuations leave their usable first page visible and retryable.

Validation: all 20 targeted Kotlin loading, bridge Home lifecycle/loading and kids-policy tests passed, along with 70 frontend Home/bridge tests, generated-contract checks, the frontend production build, Kotlin runtime staging and the embedded Windows debug shell build. Regression coverage exercises a first page arriving while continuation is blocked, cancellation, deduplication, item/page limits, nonpaginated catalogs and bounded concurrent loading. The Supabase RPC contract check passed (42 client RPCs/50 migration functions); no schema or RPC shape changed. The rebuilt debug window was launched and responded. Live hosted KidsScreen latency and the installed release's profile-switch journey still require acceptance; the initial manifest/catalog request, rating verification and artwork remain dependent on the external services. This source change does not update the installed release or change the separate KidsScreen service.

The user reported fast loading in the debug build, then requested a cold-cache rerun. The debug app was closed, the persisted addon-manifest payload and backend/WebView content caches were cleared (with a temporary recovery backup), and the final staged debug runtime was reopened. Account/profile/addon/settings data were retained; process-local catalog and kids-verdict caches reset with the worker. Cold local-load feedback remains pending, and hosted KidsScreen/TMDB server caches were not cleared.

### One-time settings copy when creating a profile — 2026-10-19

The rewrite profile editor's creation flow now has a **Settings** card next to the add-on card. It mirrors the add-on card's toggle and profile picker but has no checkable listing, because only profile-level settings are copied. Turning it on requires choosing a source profile; the copy is one-time and does not link future changes. The card is creation-only and does not appear while editing an existing profile. The existing default — a new profile starting from the active profile's settings and Home layout — is unchanged when the option is off.

Kotlin now exposes `ProfileSettingsSync.seedProfileFrom(sourceProfileId, profileId)` and `HomeCatalogSettingsSyncService.seedProfileFrom(sourceProfileId, profileId)`. The active source is exported from local state, including changes not pushed yet; any other source is read from its latest cloud blob, with the primary profile's blob as the same fallback a profile with no row would inherit. The target blob is written before the new profile can be selected, so its defaults are never observed as the first upload. The copied settings cover the settings-page areas already in the sync blob (appearance, posters, Home layout, playback, streams, p2p, integrations, continue watching, tracking and notifications). Add-on inventories, add-on settings and saved provider credentials remain separate. `profiles.create` accepts `settingsCopyProfileId`; a failure after creation returns `PROFILE_CREATED_SETTINGS_COPY_FAILED` so the editor keeps the created profile and blocks a duplicate retry. Guest sessions, which have no cloud settings rows, skip the copy.

Validation: all 30 profile-editor frontend tests passed (including new coverage for selecting a settings source without an add-on list, omitting the option when off or editing, and blocking duplicate creation after a copy failure); Kotlin desktop compilation and the targeted bridge/Home sync tests passed. The cloud-to-cloud copy itself needs a signed-in account and two profiles, so it was not exercised against the hosted backend in this change; the existing profile-settings and home-catalog blob RPCs are unchanged. No database migration or RPC signature changed.

### Kids rating edits reuse the configured key — 2026-10-19

Changing a configured kids profile's maximum age rating no longer asks for its TMDB key again. The React editor accepts the blank replacement-key field for existing configurations and preserves the saved KidsScreen service address during cosmetic/rating edits. Its helper text now accurately describes key reuse. New enrollments and deliberate key replacements still take a personal key.

Kotlin uses the locally saved management token to request an authenticated replacement configuration from KidsScreen's new `POST /v1/configurations/:id/clone` endpoint. The service reuses its encrypted key and language server-side and returns only a new configuration ID/management token. Possessing a manifest ID alone cannot edit/reuse the key. The old configuration remains intact until Nuvio saves its addon/profile policy; failed saves retain the original and attempt to revoke the unused replacement. Successful saves retain the new management token and revoke the old configuration. No API key is downloaded into React or Kotlin for rating-only edits. A device missing the management token must reconnect once to restore management access, reported with a distinct safe error instead of pretending that the configured key is absent.

The matching service source changes are in the separate `C:/projects/kidsscreen` repository (`src/server.ts`, `src/store.ts`, `test/addon.test.ts`, README). They were deployed to the existing production alias `https://kids-screen.vercel.app` as deployment `dpl_7zhBP8s6iHqdKgKzgK29z4CvLfAJ`. Hosted verification used the existing profile's management capability to clone a temporary different-rating configuration without providing/retrieving the TMDB key, verified the new manifest and unchanged original, checked unauthenticated rejection and deleted the temporary configuration. The actual profile policy and existing configuration were not changed by verification.

Validation: all 9 KidsScreen tests/type checks, all 26 profile-editor tests, the frontend build/contracts, and 11 targeted Kotlin configuration/policy tests passed. Tests cover key reuse, no-op saves, replacement keys, missing management authorization, first enrollment, server moves, remote failures, encrypted persistence, distinct configuration ownership and preserving the old rating for rollback. Rust formatting, all 9 Rust tests and the refreshed embedded debug shell build passed. The updated debug app was reopened for user testing. The Supabase RPC contract check also passed. No database schema or RPC signature changed.

### Profile add-on checklist simplification — 2026-10-19

Removed the redundant “Sync all add-ons” toggle from the rewrite profile editor. Selecting a source profile now loads the checklist immediately, selects all available add-ons by default and copies only those left checked. Kids-mode exclusions still apply. New profiles use independent copies; existing live links are retained on unrelated edits. This supersedes the earlier creation UI's all-add-on live-sharing option. Validation: all 23 profile-editor tests and the frontend production build passed. The embedded Windows debug shell was rebuilt and reopened with the updated checklist.

### Profile credentials, recommended subtitles and kids add-on selection (2026-10-19)

Desktop debrid storage no longer pins every profile to profile 1. TorBox, Premiumize, Real-Debrid, provider preferences and pending device authorization now use the active profile's storage namespace. Switching profiles reloads debrid settings before credential sync captures its baseline. Desktop credential pulls preserve locally saved keys when a cloud row does not yet exist and upsert only those missing nonempty credentials; explicit empty-value disconnect tombstones still clear keys. A pull that observes a local edit while waiting for the server is discarded. Device authorization captures the starting profile and rejects delayed start/poll responses after a switch. Existing TMDB, MDBList, AnimeSkip/IntroDB, tracking and media-server storage already uses profile namespaces; account-wide Nuvio authentication remains account-wide. The rewrite removes local credential/settings slots after successful profile deletion so reusing its index cannot recover the previous profile's secrets.

The old shared debrid slot is retained as profile 1's slot. It cannot safely be attributed or copied to other profiles: those users may need to reconnect once, and already overwritten keys cannot be recovered locally. This change enforces profile isolation within the app; it does not introduce an OS credential vault or encrypt the existing desktop preferences format. Explicitly syncing add-ons still shares their configured URLs/settings, including any credentials embedded in those URLs, by design.

Kotlin reconciles the official OpenSubtitles v3 manifest (`https://opensubtitles-v3.strem.io/manifest.json`) into every profile's local/cloud add-on inventory when missing. An existing disabled row stays disabled. The editor shows it checked by default, labels it Recommended and saves an explicit enabled/disabled row; edits read the existing choice. Live all-add-on groups share the subtitle choice, just as they share other add-on settings. The official endpoint is listed in [Stremio's official add-on registry](https://github.com/Stremio/stremio-official-addons/blob/master/index.json). Manifests/subtitles remain externally hosted and require connectivity.

The add-on sync/import card now sits immediately below Kids profile settings. Cinemeta/AIOMetadata rows are visibly disabled and unchecked while Kids mode is on, even when selected before toggling Kids mode. Kotlin also removes these providers from requested kids copies and from the independent inventory when configuring KidsScreen; source-profile inventories are preserved. Other stream/subtitle providers remain available, and KidsScreen continues to own catalog/search policy.

Validation: 35 targeted Kotlin tests passed across storage restart/disconnect isolation, deleted-slot removal, credential sync, delayed device-auth scope, subtitle reconciliation/disabled state and kids-copy policy. All 404 frontend tests passed; the final editor refinement passed all 23 profile-editor tests again. Generated contracts, frontend production build, Rust formatting, all 9 Rust tests, embedded debug shell build and Kotlin runtime staging passed. The Supabase RPC contract check passed (42 client RPCs/50 migration functions), as did its 3 checker tests. No database migration/RPC shape changed; fresh/upgrade database runs remain CI checks because Docker is unavailable on this Windows host. Live TorBox/Premiumize account authorization, subtitle availability and hosted KidsScreen creation still require external-service acceptance. Automated regression tests use temporary stores and fake provider credentials. The rebuilt embedded Windows debug rewrite was launched successfully: its window responds and the frontend accepted the signed-in session with three existing profiles. Provider-login and subtitle/playback acceptance remain user-led.


### Supabase upgrade-test database isolation — 2026-10-18

GitHub run `39150021770` failed before migrations ran: Docker could not bind the upgrade database to host port 54322 (`address already in use`). RPC-contract and fresh-database checks passed. ECR throttling preceded the failure but the fallback image download succeeded, so it was not the final failure. The log does not identify the port owner; an ephemeral outbound connection is one possible cause.

The disposable upgrade project now uses a unique project/container name and an available port from 15432–15531, below Linux's usual ephemeral connection range. Only its temporary configuration changes; repository/deployed configuration and database migrations are untouched. The helper rejects occupied ports and validates the resulting TOML. Two isolation/occupied-port tests, RPC checker tests and the RPC contract check pass locally, as does Bash syntax validation. Docker is unavailable on this Windows host, so the actual migration run remains a GitHub CI acceptance check.

### Card action popup spring motion — 2026-10-18

Popup image fitting: the shared poster image fills its actual artwork slot with `object-fit: contain`, preserving the entire image on every screen. The previous fixed 390 px image (capped at 45vh) could exceed the parent's 44vh height and be clipped, including poster lettering. The outer card's spring motion is retained; Continue Watching continues to scale its source layout without adding another image crop.

The popup frame now follows the poster's image aspect ratio (source bounds until image dimensions are available) within its width/viewport-height limits, so letterboxing cannot leave square image corners inside a wider rounded frame. Its corner radius scales from the source poster frame's actual radius/width, retaining the user's card rounding instead of imposing a separate popup shape. Regression coverage checks source rounding and image proportions. These image-fitting/rounding follow-ups remain local at the user's request.

All shared `Poster` cards now use this popup unconditionally, including Search/Discover, search results, related titles, people/entity pages and collection pages. The alternate `View details / Manage lists / Toggle watched / Close` popup and its unused styling/imports are removed. All title cards share the artwork preview, library/watched actions, instance-specific source anchors and spring entrance/return. Artwork customization still follows each screen's existing settings. Route coverage includes Search, query results, details, collections and person pages alongside Home, Library and categories. Validation: all 400 frontend tests and the production frontend build pass; live visual confirmation remains pending.

Expanded Home categories (`/catalog/...`) now use this same `HomeActionDialog` and its shared animations, artwork anchoring, add/remove-library and watched-state actions. Poster customization still uses the existing search/catalog artwork settings; the change is limited to the action menu. The popup imports its own styles so direct catalog entry does not depend on visiting Home first.

Category closing follow-up: source keys now include React's stable per-card instance ID for posters and Continue Watching. Cached Home remains mounted behind a category page, so content-only keys could select its hidden copy of the same title; zero bounds then triggered the shrink/fade fallback rather than the return spring. Repeated titles on different shelves had the same ambiguity. Instance keys bind opening, snapshots and return geometry to the actual pressed artwork. A regression includes a hidden cached Home title before the visible category copy. All 30 affected poster/Home/dismissal/geometry tests and the production frontend build pass; live confirmation remains pending.

Landing follow-up: poster anchors now identify the `.poster-frame`, and Continue Watching anchors identify the artwork button, rather than their outer wrappers containing labels and controls. Opening and closing therefore measure the same artwork rectangle. Continue Watching's lifted preview freezes a clone of the source card's computed typography/layout once and scales it as a whole (matching Kotlin's `drawLiftedPoster`), rather than switching between independently styled shelf and popup text. A ResizeObserver fits the frozen layout to the preview slot without frame-by-frame style reads. Regression coverage checks artwork-only target bounds and preservation of source font sizes; live landing verification remains with the user.

Follow-up validation: the full 393-test suite passed after the landing/font fixes; the final catalog route addition passes all 13 targeted action/artwork/dismissal tests and the production frontend build. `git diff --check` passes. Rebuilding the embedded shell was blocked by Windows locking the running `target/debug/nuvio-desktop-shell.exe`; no running app was terminated.

The poster and Continue Watching action popups now follow `core/ui/PosterZoomActionOverlay.kt`: non-bouncy expansion/collapse springs (stiffness 340/460, damping 1, threshold 0.0005), the menu spring (420, damping 0.8, threshold 0.01) delayed 60 ms, title translation, menu scaling from 0.62 around its top edge and row staggering at 0.07 increments. The scrim uses Kotlin's 260 ms standard easing, 45% dimming and 36 px blur, with an 80 ms exit delay and 140 ms menu fade. Browser spring keyframes are sampled once and played through Web Animations; there are no per-frame React updates or layout reads.

The opening animation is installed before paint against untransformed destination bounds, uses top-left geometry and opaque artwork, and no longer competes with a CSS scale/fade. The dialog temporarily allows the travelling artwork outside its scroll box, avoiding clipped flights. The inherited generic dialog blur is explicitly disabled so only one fullscreen blur remains. Outside/Escape dismissal uses the collapse spring, including an interrupted entrance's current bounds; missing source cards shrink/fade in place, and reduced motion skips the animation.

Validation: all 391 frontend tests, the production frontend build, `cargo build --features custom-protocol --locked`, and `git diff --check` pass. Visual smoothness on the user's release host remains unmeasured. This ports the popup entrance/dismissal; existing action execution and destructive card-removal effects are retained.

### Player pause overlay uses the title synopsis — 2026-10-18

The rewrite's `NativePlayback` launch now passes `pauseDescription` into the existing Kotlin player, matching `MetaDetailsScreen`: `meta.description` for movies and the selected video's `overview` for episodes. Previously the omitted argument made the player show the stream's technical description. Missing descriptions are passed as empty text so stream details do not reappear. Artwork, provider/episode labels, description layout and pause timing continue to use the existing Kotlin/native controls.

Validation: `:composeApp:stageBridgeRuntime` and `git diff --check` pass. Live paused-playback acceptance remains pending.

### Release builds hide the startup placeholders — 2026-10-18

The plain "Starting Nuvio…" text in `desktop-ui/index.html` (shown before the React bundle mounts) and the top-right "Connecting to Nuvio…" pill are development diagnostics. They now appear only in dev: a small `transformIndexHtml` plugin in `desktop-ui/vite.config.ts` clears the body placeholder for `vite build`, and `App.tsx` renders the *starting* connection notice only when `import.meta.env.DEV`. The genuine "Connection unavailable" notice still shows in release builds.

### Library layout toggle and Kotlin filter chips — 2026-10-18

The Saved Library header restores the Kotlin layout toggle (horizontal shelves ↔ vertical grid) that the rewrite had dropped, wired to the existing but previously unused `library.setLayout` RPC. It reports the target layout through the Kotlin icon labels (`library_layout_show_vertical`/`_horizontal`) and fades the icon on switch.

The Saved controls row is now a port of `LibrarySavedControls`: Type and List dropdown chips in grid mode (List only for tracker/remote sources) plus the Sort chip in both layouts, each a compact rounded trigger with an anchored menu whose selected row carries an accent check (`NuvioDropdownChip`). The previous native `<select>`s are gone, and labels come from the generated Kotlin string catalog. Grid rendering uses Kotlin's `PosterGridSizing` breakpoints (3–7 columns plus the ultrawide adjustment) instead of `auto-fill`, and the vertical projection mirrors `buildLibraryVerticalProjection` (section selection, type filter, dedupe, provider order).

Validation: `tsc -b`, the frontend production build, and the full 387-test frontend suite pass (new coverage: layout-toggle persistence, sort/list/type chip behavior, the grid breakpoint port and the vertical projection). Visual confirmation on a running build is still with the user.

The Saved shelves also regain their hover scroll arrows (`Scroll <shelf> left/right`), matching the Kotlin `NuvioShelfSection` control and the existing Home arrows; the library no longer hides them. They are sized against the library content's 1.22 zoom so they match Home's physical size (Home itself cancels that zoom).

### Player: paused metadata overlay reverted to the controls — 2026-10-18

With the pause overlay enabled, pausing hid the chrome on the usual idle timeout, but the metadata overlay only flashed before the normal controls came back. The fork's pointer policy (`syncChromeWithPointerPolicy` in `composeApp/src/desktopMain/resources/player-ui/controls.js`) forced the chrome visible whenever playback was paused, and it runs on every native state push — the player poll every 200–500 ms plus the `hideChrome`↔`keepChromeVisible` round trip through Kotlin — so the idle auto-hide that reveals the overlay was undone almost immediately. The desktop runtime likewise keeps `controlsVisible = true` while paused. Because the overlay only shows while the controls are hidden, the two never coexisted.

The policy now yields while a pause is eligible for the overlay (the same rule as `syncPauseMetadataTimer`): in fullscreen, visibility is left entirely to the idle auto-hide timer and to user activity; in windowed mode it still follows the pointer, which is what hides the chrome (and so reveals the overlay) once the pointer leaves the player. Pointer/keyboard activity continues to bring the controls back and hide the overlay. No Kotlin change is needed: the existing `controlsVisible = true` on the pause transition is a one-shot that shows the controls as the pause begins.

Validation: `node --check` on `controls.js` passes. No automated harness covers the embedded player page (`player-ui/`), so live playback verification of the overlay timing is still pending.

### Cold manifest scheduling and stuck KidsScreen refresh — 2026-10-18

Follow-up screenshots and source tracing identified the unresolved cause of KidsScreen staying “Refreshing” across restarts: `toPendingAddon` intentionally seeds uncached enabled sources with `isRefreshing=true`, while initialization and cloud inventory application only launched HTTP work when `!isRefreshing`. A brand-new managed catalog therefore had no fetch job at all; restarting reconstructed the same stuck state. The earlier missing-source repair alone did not resolve this scheduling bug, and the earlier bounded probe's pending state was not evidence of service slowness.

Initialization, cloud reloads, independent snapshot application and enabling unresolved sources now schedule missing manifests regardless of the presentation flag. The existing job registry under `stateLock` remains the authority for suppressing concurrent duplicate requests. Pending-seeding regressions cover both newly constructed and reloaded pending sources, disabled sources and resolved manifests. This applies to any uncached addon, including the KidsScreen source added when converting a profile while importing a playback provider. Existing catalog-only Kids filtering and independent title checks remain in place.

Validation: 19 targeted Kotlin pending-seeding/import/managed-source/Home lifecycle/loading tests passed. A real staged-backend probe of the affected profile (profile 2, now configured as Kids) resolved its previously uncached source and produced six Home shelves/eight featured titles, zero refreshing add-ons and zero add-on errors. Those counts remained stable through profile snapshot inspection, repeated current-profile selection and a fresh backend restart, which reused all eight cached manifests. The prior probe's normal-profile acceptance predates its conversion to Kids. No test profile edits or provider credentials were required for this verification.

The staged fixed backend was launched through the debug rewrite for user testing. At the user's request, the follow-up local installer rebuild was stopped before producing a package; the existing root MSI does not contain this final scheduling fix. No installer rebuild or release is implied by committing these changes.

### Loading after profile editing or cancellation — 2026-10-18

The affected Kids profile's cloud inventory contained only a stream provider and had lost its configured KidsScreen catalog. Kotlin now reconciles the required enabled managed source from the authoritative Kids policy on local initialization and cloud inventory loads, retaining all other providers. This also repairs profiles affected by earlier replacement-style copies without requiring another TMDB key or relaxing parental filtering. Three regression tests cover recovery, idempotence, enabled state/order and ordinary/unconfigured profiles. A live backend probe confirmed restoration of the missing source and a pending loading state through editor inspection and repeated selection; provider networking was still pending during that bounded probe, so this is not a completed catalog-download acceptance test.

Reselecting the current profile now avoids resetting its profile-scoped repositories, including when returning from the editor without saving. An editor regression changes draft fields/import selection then goes back and verifies no mutating RPC or profile-state changes. The other normal profile retained seven Home shelves through inspection and repeated same-profile selection in a local probe. Targeted frontend profile/bridge checks passed 77 tests before the final Kotlin-only recovery changes; six addon import/recovery tests plus nine Home lifecycle/loading tests passed afterward. The original cancellation-triggered failure was not independently reproduced on the normal profile.

### Profile editor layout and additive add-on import — 2026-10-18

Compared the running Compose editor with the rewrite and matched its standalone back/title/fullscreen header, spacing, large identity avatar, rounded elevated cards, name input, circular avatar choices and PIN controls. Retained the fork's Kids configuration, accent color, custom avatar/background and background selection. The edit footer deliberately follows the user's requested arrangement: Delete profile on the left and Save changes on the right on the same row. The import toggle lives in its own Import add-ons card, which remains visible while import is off. Creation retains its existing sync option and full-width primary action.

Editing now offers a one-time import instead of creating/replacing a live add-on link. Kotlin normalizes URLs, preserves the target's existing order, enabled states and custom names, skips duplicate URLs and appends new selected source add-ons. Ordinary edits preserve existing live links; importing explicitly detaches the target while preserving its current list. Source-profile inspection is read-only. Creation retains live all-add-on sharing or independent selected copies; Kids profiles remain independent. Three Kotlin merge tests and nineteen profile-editor tests cover duplicate/configured URLs, order, repeated imports, creation, link preservation, selection and cancellation. The full frontend suite passed 375 tests before the final layout refinements; the targeted nineteen passed again afterward. Visual comparison covered the local Windows Compose/debug app; unavailable remote avatar catalogs were not claimed as live visual acceptance.

### Settings search coverage and result navigation — 2026-10-18

The user could not find **Size range** under Connected Services → Result management because that entire area was absent from the manually maintained index. Added size limits, result counts, per-resolution/quality limits, preferred/required/excluded filters, resolver/cloud/formatting controls, Jellyfin/Emby, P2P/downloads, hover trailers, navigation and additional playback controls. Corrected Addons/Plugins destinations. Search now ranks title matches above descriptions/page matches, normalizes add-on/auto-play spelling and accents/punctuation, handles common synonyms and a single character typo, and ignores common filler in natural queries while still requiring all meaningful words. Breadcrumbs show where results live. Result links carry a setting key; the destination waits for async controls, scrolls to and focuses/highlights the matching row without activating it. Tests cover Size range/file-size queries, aliases/typos/ranking, unique entry keys and end-to-end result navigation without mutations.

### Packaged cast/trailer rows use external styles — 2026-10-18

Cast and trailers appeared vertically on an installed build. Their shared flex/overflow styles lived only in a runtime-created React `<style>` element. Tauri's packaged CSP adds a style nonce to the initial HTML's startup style, so that dynamic element has no matching nonce and is blocked even though `unsafe-inline` appears in the original configuration. Moved both existing static details style blocks into `details-extras.css`, imported by the component, preserving the security policy and cinematic overrides. A headless Edge check with the corresponding nonce-bearing CSP and the actual styles reproduced both rows as block/vertical before the move and flex/horizontal after it. This is a browser layout check, not acceptance on the user's other laptop. Also removed the scroll-revealed condensed title from movie/show details at the user's request; the hero title and navigation controls remain.

### Cold-start Next Up must not block bridge requests — 2026-10-18

A user tested the local MSI on another laptop with no cache and reported delayed cards and “The desktop bridge could not be reached.” Source review found `home.extras.refresh` awaiting up to 16 sequential metadata lookups under the runtime's global RPC mutex. Home addon observers and other requests share that mutex; cold metadata can therefore delay catalog startup and exceed the shell's 30-second request timeout. That error also covers transport failures, so the screenshot alone does not establish the precise failing request on the other laptop.

Home enrichment now returns the local snapshot immediately and resolves Next Up in a cancellable background job, publishing its result through the existing `homeExtras` event. Reset/newer requests invalidate old results, and runtime shutdown cancels outstanding enrichment. Regression tests use suspended metadata and a shared request mutex to check responsiveness, profile reset, latest-result precedence and failure fallback. Kotlin's original `HomeScreen` resolves enrichment in separate coroutine effects with bounded concurrency and uses persisted Continue Watching enrichment; neither original nor rewrite ships movie lists/artwork for offline first launch.

“Bundled defaults” in the earlier entry means bundled URLs/automatic installation, not bundled addon manifest JSON or catalog responses. `DEFAULT_ADDON_URLS` includes Cinemeta and the fork's configured AIOMetadata endpoint. `seedDefaultAddonsIfEmpty` fetches them sequentially only for an empty main profile after inventory settles; an existing account first retrieves its own addon list. `AddonManifestCache` is populated at runtime, uses a 12-hour freshness window, and reuses stale entries while revalidating. No cached user configuration was added to the installer.

Validation for this combined follow-up: 13 targeted desktop tests passed (background enrichment, Home preferences/catalog lifecycle/loading); full frontend suite passed 374 tests, followed by 14 focused Settings search/details navigation tests after final edits; TypeScript/Vite and the optimized local Tauri MSI build passed. Headless Edge reproduced/fixed both row layouts under nonce-bearing CSP. The rebuilt `Nuvio-Setup.msi` in the repo root passed MSI identity, upgrade-version and bundled-runtime verification. All installer builds were local; the earlier GitHub Actions build request was cancelled. A true first-run test on the other laptop remains user acceptance; local checks did not clear account caches or pretend provider downloads work offline.

### Upstream 0.1.31-alpha integration — 2026-10-18

Follow-up live testing found Home stuck on its skeleton despite a successful bridge handshake. A controlled staged-backend probe loaded ten shelves/eight hero items; reopening the rebuilt shell displayed them, so the original stall's exact trigger remains unconfirmed. React now polls the authoritative Home snapshot every five seconds while signed-in Home is empty/loading, preserves profile/revision guards, and offers Retry after sixty seconds. Retry consumes a fresh snapshot and surfaces failures. Three regression tests cover missed events, the loading deadline/retry, and disposal. Home diagnostics contain only epoch/revision/loading/counts. Startup handshake alone is no longer recorded as content acceptance.

Integrated upstream `e808a584e937d3ce148f5e023180586bc3545002` from previous baseline `d4bdf2588d46a4db7131e105efe6bd7576944a1b` on a short-lived rewrite sync branch, preserving the upstream merge. Kotlin/native fixes include buffering/reconnect and Windows renderer/shader changes, player panels/stream information, custom-poster resolution, TorBox large-library loading, restored continue-watching items and P2P engine 0.1.5. Fork DPI/presentation/PiP, subtitle intent, profile policies, image budgets and Tauri release configuration remain intact; the fork release version/build code is unchanged.

The rewrite adds profile-scoped Jellyfin/Emby connection/library settings, backend-driven Home refresh on server changes, native-server playback preparation and YouTube-only stream resolution. Playback settings expose hold-to-speed. MDBList dynamic/liked/external lists use upstream repositories; React gains list visibility and Kotlin sort options, with provider order observation for sections. Credentials remain outside ordinary snapshots. Watch parties and server cloud sync are explicitly deferred/gated because this fork does not host their backend RPCs.

Further parity review adds individual library-list selection and preserves backend section ordering, extracts namespaced poster IDs correctly and carries original poster URLs through the bridge for failed-custom-artwork fallback. The rewrite remains explicitly incomplete and discovered implementation gaps are fixed during sync review. Native episode/source lists also reset comparison caches on empty states so identical results reappear after reload; production-renderer DOM regressions cover this transition and unchanged-node stability. Validation found and repaired an automatically merged native-constructor signature mismatch, Windows file/JAR handle leaks in upstream resource stamping/extraction, and Linux installer assertions that assumed POSIX paths on every host. Static RPC scanning now covers named arguments and watch-party wrapper calls. Database CI covers rewrite/sync branches and bridge source changes. Generated bridge contracts/locales are updated; the UI inventory reads the tracked upstream baseline. Local full desktop tests: 1712 total, zero failures, one skip; frontend: 368 passed; TypeScript/Vite production build, Rust formatting/nine tests/embedded build, RPC scanner regression/contract checks passed. Packaging checks: ten passed, one host-specific skip. All three database CI jobs and all seven platform package jobs passed on application candidate `e922ed5d`; the embedded Windows debug shell was launched afterward with a fresh backend-ready handshake. Cross-platform/provider acceptance evidence and limits are recorded in the [batch report](UPSTREAM_SYNC_2026-10-18.md); the reusable procedure is [UPSTREAM_SYNC.md](UPSTREAM_SYNC.md).

### Agreed upstream integration workflow — 2026-10-18

`AGENTS.md` now records the approved upstream sync procedure directly: start each short-lived sync branch from the latest rewrite, preserve upstream merge ancestry, adapt bridge/React behavior in separate commits, validate the complete rewrite and record implemented/deferred decisions before integrating. The rewrite guide now identifies this as the agreed workflow rather than a proposal. No upstream sync or branch/default-branch change is performed by this documentation update.

### Permanent React/Tauri desktop direction — 2026-10-18

The rewrite is permanently the primary desktop application. React/TypeScript and Tauri own the interface and shell; the existing Kotlin backend and native player remain authoritative. The original Compose application remains available as an upstream reference and development comparison tool. `AGENTS.md`, `CLAUDE.md`, the README and rewrite guidance record this direction without treating outstanding acceptance checks as a reason to return to the old frontend. The rewrite guide proposes short-lived upstream sync branches based on the current rewrite, preserving upstream merge ancestry and adapting bridge/React behavior before integration. No branch/default-branch changes or upstream merge are performed by this documentation update.

### Result management: size filter uses min/max dropdowns — 2026-10-17

The Connected Services → Result management → **Size range** filter previously offered a fixed list of preset ranges. It now opens a dialog with two dropdowns, **Minimum size** and **Maximum size**, each offering Any, 500 MB, 1 GB, 2 GB, 5 GB, 10 GB, 20 GB, 50 GB, 100 GB and **Custom…**. Choosing Custom reveals a GB text field under that dropdown. Save validates the bounds (a custom value must be greater than 0 GB and the maximum must be at least the minimum); Clear resets both to Any. The row summary now reads like `Any`, `Up to 10 GB`, `5 GB+` or `5 GB – 20 GB`.

Covered by `DebridSizeRangeDialog.test.tsx`.

### Player: subtitles stay off after choosing "None" — 2026-10-17

Selecting **None** in the player's subtitle panel turned the subtitle off, but reopening the panel re-selected the previous language (for example English), so the choice looked lost. The panel derived the selected language from the engine's `track-list` `selected` flag, which can still report the old track right after mpv's `sid=no`.

- `PlayerScreenRuntime.refreshTracks` no longer re-derives `selectedSubtitleIndex` from `isSelected` once the user explicitly chose "None" (`subtitleSelectionExplicitlyOff`).
- The subtitle panel and the player-controls subtitle state now use `effectiveSubtitleLanguageKey`/`effectiveSubtitleOptionId`, which force the off language and clear the option when the user explicitly turned subtitles off, instead of falling back to the engine's stale selection.
- The controls-message handlers (`selectBuiltInSubtitleTrack`, `selectAddonSubtitle`) now mark the selection as explicit so automatic selection cannot override it.

Covered by new `SubtitleSelectionModelTest` cases: explicit off beats a stale selected track, and the effective helpers match the engine when not explicitly off.

### Home hero: loading placeholder, no arrows — 2026-10-17

Two featured-hero tweaks in the rewrite Home screen (`desktop-ui/src/features/home`):

- A profile switch can stream shelves in before the featured hero resolves, which left the hero area blank for a moment. `HomePage` now renders the hero-sized shimmer (`.home-loading-hero`, same `--home-hero-height`) whenever the hero is enabled but not resolved while Home is still loading, and removes it once loading settles without a hero. Covered by `HomePage.test.tsx` (shimmer present while shelves show and loading; gone after settling).
- Removed the previous/next arrow buttons from the featured hero. The indicator dots remain, and keyboard arrows, drag/swipe and auto-rotation are unchanged. The unused `.home-hero-arrow` CSS was dropped and the arrow-click test now drives the dots.

### Bundled default add-ons and first-launch add-on warm-up — 2026-10-17

A fresh account used to land on an empty Home until the user added add-ons manually, and the first switch to another profile was slow because that profile's manifests were not cached yet. Both are now handled automatically.

- **Bundled defaults.** `AddonRepository.seedDefaultAddonsIfEmpty` installs `DEFAULT_ADDON_URLS` for a brand-new **main profile** (index 1) that has no add-ons: Cinemeta (`https://v3-cinemeta.strem.io/manifest.json`, keyless public add-on) and AIOMetadata (`https://aiometadata.elfhosted.com/stremio/<config-id>/manifest.json`). Neither requires any user input.
- **AIOMetadata configuration id.** AIOMetadata has no config-free URL — the bare `…/stremio/manifest.json` returns 404 and the path segment *is* a saved configuration. This fork deliberately ships the owner's configuration id **`72194dd9-57a2-4c60-a4b1-462adfd81eae`** as the shared default (defined in `DEFAULT_ADDON_URLS`). Every new account therefore gets the same AIOMetadata provider mix; change that one constant to point at a different configuration.
- **Seeded once.** `AddonStorage.isAddonDefaultsSeeded`/`markAddonDefaultsSeeded` (desktop, Android, iOS) record that a profile has been considered, so deliberately removing every add-on is not undone on the next launch. Seeding only runs once the add-on list is settled (`profileLoadPending` false and, for signed-in accounts, no `profileLoadError`), so a slow or failed cloud pull is never mistaken for an empty account.
- **Parallel first-launch warm-up.** `AddonRepository.prefetchManifests` now gathers every *other* profile's add-on list — from the cloud (`readProfileAddonSnapshot`, cached back into local storage) for signed-in accounts, or local storage otherwise — and fetches the missing/stale manifests with a bounded concurrency (`MANIFEST_PREFETCH_CONCURRENCY = 4`). `DesktopBridgeRuntime` starts it ~2 s after the active profile settles (down from 8 s), so the first switch to another profile no longer needs a manifest round-trip. The active profile is skipped because its own load already fetches those manifests.

Verification: `:composeApp:compileKotlinDesktop` compiles; add-on/Home/desktop-bridge suites pass under `:composeApp:desktopTest`. First-launch and first-switch behaviour verified by the rewrite preview.

### Faster profile switching: add-on manifest cache and Home catalog reuse — 2026-10-17

Switching profiles used to re-download every add-on manifest and then every Home catalog over the network, so a profile with different catalog add-ons could sit on the Home shimmer for seconds. Manifests are now cached by URL (in memory and persisted) and Home reuses matching cached catalogs, so a profile whose add-ons were fetched earlier in the session — or in a previous run — renders Home immediately.

- `AddonManifestCache` (new) stores the raw manifest response per URL with a 12-hour TTL, a 200-entry cap and a debounced persisted blob (new `AddonStorage.loadCachedManifests`/`saveCachedManifests` on desktop, Android and iOS). Manifests are descriptor-only, so one URL-keyed cache is shared by every profile.
- `AddonRepository` seeds rebuilt pending add-ons from the cache (`toPendingAddon`), re-fetches only missing or stale manifests, revalidates resolved manifests silently (without flipping `isRefreshing`), records successful fetches, logs cache hit/miss counts and fetch durations, and clears the cache when account data is wiped. `initialize()` no longer leaves `profileLoadPending` set for signed-in users once local add-ons are loaded, and `prefetchManifests` warms every profile's add-ons after the active profile settles.
- `DesktopBridgeRuntime` pulls the selected profile's add-ons from the cloud in the background on `profiles.select` instead of making the switch wait, and schedules the warm-up after sign-in.
- The Home catalog descriptor signature (`HomeCatalogDefinitions`) now covers identity only (enabled flag, manifest URL, manifest and catalog content). Transient refresh state and the display name no longer change cache keys, so a background revalidation cannot discard cached sections. `HomeRepository.refresh` keeps its in-memory section cache while a profile's manifests are still resolving, so catalogs shared with a previously visited profile are reused instead of re-fetched.

Verification: new `AddonManifestCacheTest` and `AddonPendingSeedingTest`, plus an updated `HomeCatalogDefinitionTest`; the add-on, Home and desktop-bridge suites pass under `:composeApp:desktopTest`.

### Kids-profile settings are editable — 2026-10-17

Kids profiles can now change their settings. `SettingsLayout` no longer wraps the settings pane in the kids-only `ReadOnlyBoundary`, so every category (Layout, Content & Discovery, Playback, Integrations, About, Advanced and their sub-pages) renders editable controls with no restriction notice. The read-only boundary, its context and the `InlineError` duplicate-message suppression that existed only for it are removed; `InlineNotice` had no other consumer and is gone with the styling it shared.

The bridge no longer rejects settings mutations for kids profiles. `KidsBridge.authorize` still gates content management — profile create/update/delete and kids setup, downloads, cloud, collections, add-on-independent library membership and the media-gated `streams.load`/`details.*`/`library.*` paths are unchanged — but it now admits settings namespaces (`settings`, `appearance`, `posters`, `homePreferences`, `home`, `continueWatching`, `search`, `metadataSettings`, `playbackSettings`, `p2p`, `about`, `advanced`, `downloads.filter`, stream badge/filter settings, `tmdb`, `mdblist`, `debrid`, `simkl`, `trackingSettings`, `integrations`, `plugins`, `addons`, `profiles.rememberLast`) plus `session.signOut` and `app.openExternal`. The allowed/blocked policy is covered by a `KidsBridgeTest` case, and the bridge UI test now asserts a kids profile can toggle settings and dispatch the corresponding requests.

### Windows video sizing and PiP DPI compatibility — 2026-10-17

The previous layout repair checked only the outer native container. mpv creates a separate child HWND; that child can remain small while the container and WebView2 controls already fill the host. The native layout pass now checks the actual mpv child bounds and origin, and asynchronously repairs a mismatch even when the outer layout cache matches. The 500 ms layout timer also catches children created after presentation and repairs paused video without a fullscreen toggle.

The real-video regression also reproduced Windows rejecting an in-process SetParent from the Tauri-compatible player container into a DPI-unaware PiP host. Windows PiP now creates an independent, always-on-top window on the native player's UI thread, using the container's DPI mode. It retains the native drag/resize/aspect handling and existing controls. Close requests restore through the Kotlin coordinator; successful restoration destroys the native PiP host, failed restoration retains it, and player shutdown destroys remaining native windows. Failed SetParent calls preserve the previous layout host and report the Windows error. Resizing a native PiP root no longer moves/resizes that root as though it were an embedded AWT panel. macOS retains its AWT PiP window.

Regression coverage uses generated Y4M video with software decoding rather than only a silent WAV. It checks the actual mpv HWND, independent child shrink recovery, ERROR_INVALID_STATE (5023) from a mismatched-DPI host without changing the active parent, native PiP geometry and resize position, close-to-restore signaling, repeated entry, restoration/disposal and shutdown cleanup. Both real-native tests and all three Kotlin restore tests pass; the Windows DLL and bridge runtime were rebuilt/staged. The local run used the existing temporary init script to exclude the unrelated unfinished DesktopDownloadProgressTest compilation failure. Installed-app visual acceptance remains pending.

### Rewrite player layout diagnostics — 2026-10-17

Temporary-style, privacy-safe layout breadcrumbs for one debugging round: the native bridge emits packed host/container sizes at creation, on every applied layout, on each desync correction (desired + actual), at presentation-show and after reparenting (`bridgeControlsLayout*` events recorded into `%APPDATA%\Nuvio\logs\nuvio-player.log` via the existing presentation-event line). Kotlin records the embedded Tauri HWND, layout-refresh requests and PiP reparent outcomes in the same file; the React playback surface reports webview CSS size on mount and after settling into the shell `bridge-diagnostics.log`. Sizes decode as width = floor(value / 100000), height = value % 100000. Remove or keep once the launch-sizing issue is root-caused.

### Rewrite player surface sizing and PiP reparenting — 2026-10-17

The embedded Windows player now re-asserts its native container size when the controls are presented and whenever the surface is reparented, instead of trusting the cached creation size. The 500 ms layout poller also compares the container's actual size against the host size, so any drift heals without requiring a fullscreen toggle. A `bridgeControlsLayoutCorrected` breadcrumb records each correction. Native reparenting reports real success (verified parent after the move, with late tasks re-validating a possibly disposed PiP host), so Picture-in-Picture only enters its placeholder state when the surface actually moved and otherwise aborts cleanly; restores force a layout refresh in the same way. Kotlin refreshes the native layout on presentation, and the Tauri shell's one-shot fullscreen-toggle flag is no longer retained in frontend playback state. Regression coverage: a real-JNI resize test requires the container to track host resizes after presentation, plus Kotlin reparent-failure and frontend state-hygiene tests.

### Full local-work release replacement — 2026-10-17

The replacement 0.1.27.6 release includes all pending project source, tests, assets, packaging and documentation changes, with desktop build 39 so Windows Installer and the updater can upgrade from the original build 38. It includes KidsScreen profile policies and optional PIN migrations, selective profile add-on copying, read-only kids settings, Home loading and desktop defaults, the branded Windows backend launcher, and the player handoff fix. Temporary chat attachment copies are ignored alongside other local caches.

Completed the pending performance helpers' runtime integration: desktop download progress is coalesced to 250 ms with exact start/final byte counts, Home consumes catalog results with bounded concurrency instead of batch barriers, static image reads enforce their encoded-byte budget before allocation, GIF decode resources close deterministically, and collection animation prefetch waits until playback is needed. Existing targeted tests cover these paths. The original release remains available while replacement CI builds and database checks are validated.

### Rewrite playback event handoff — 2026-10-17

Added `WindowsPlayerPresentationTest` to the bridge suite used by desktop release CI. It uses actual JNI/mpv/WebView2 with a temporary silent WAV, holds warm-up open in the JVM DPI mode, creates an offscreen native host with a different DPI mode, and requires initial controls state, presentation acknowledgement and a visible native container. Restoring a shared browser profile makes this test fail with the original `0x8007139F`; restoring the fix passes. Windows desktop tests now depend on the native build and track the DLL as an input to prevent stale/cached binaries from hiding regressions. Six Kotlin host lifecycle tests also pass. Local execution excluded only the existing unrelated unfinished download test via a temporary Gradle init script; no repository test was disabled.

Live diagnostics identified WebView2 controller creation failing with `0x8007139F` before controls navigation. The JVM warm-up browser uses DPI awareness 0 while the Tauri window uses mode 2. Windows player threads now inherit the host HWND's DPI awareness and WebView2 profiles are partitioned by DPI awareness, keeping those contexts from sharing an incompatible browser process. Native environment/controller failures pause mpv immediately and fail Kotlin's pending presentation acknowledgement, so the existing prepared-host cleanup releases the player without waiting for the presentation timeout. Privacy-safe breadcrumbs cover environment/controller/navigation, controls script errors (line numbers only), initial state, artwork/frame readiness, presentation acknowledgement and React event receipt. Native/Kotlin compilation and runtime staging succeeded. Live logs confirm successful controller creation, state application, presentation acknowledgement and the playing event with the Tauri host; the user confirmed playback works. The standard targeted desktop test command is blocked by the unrelated unfinished `DesktopDownloadProgressTest.kt` referencing a missing `copyDesktopDownload`.

The stream opening screen now accepts the completed playing snapshot for its selected stream even when an earlier native snapshot already reported playing without host/stream details. NativePlayback and the start handler publish these details in separate events; requiring a new transition into playing could leave the opening artwork covering an active player. The selected-stream check and one-time handoff guard remain in place. Regression coverage delivers the native state and host details in separate renders, rejects a different stream's event, and checks that navigation preserves playback. All 56 bridge UI tests, the frontend production build and the embedded Tauri debug build pass. Live playback verification remains pending.

### Profile-switch Home loading and profile actions — 2026-10-16

Home loading now includes the active profile's unresolved add-on inventory and every pending enabled catalog manifest, in addition to catalog requests. Addon state changes publish Home snapshots even when the catalog definition signature is unchanged, so a genuinely empty cloud result can settle promptly. Profile-scoped inventory failures settle with a retryable error and stale responses cannot clear another account/profile's pending state. The old 600ms frontend empty-state timer is removed; existing Home shimmer cards remain visible until source/catalog loading settles. Source manifest failures also report an error when no Home content is available.

The profile list adds spacing between Remember the last profile and Add a profile. The profile editor removes its Profile N footer label and places Delete profile on the left of Save changes in the same flex row, retaining confirmation and primary-profile protection. Validation passed: 70 targeted frontend tests, eight Kotlin Home loading/catalog lifecycle tests, the frontend production build and backend runtime staging.

### Reusable read-only settings and saved-key indicator — 2026-10-16

`ReadOnlyBoundary` supplies a neutral status notice, disabled fieldset, capture guards for control changes/dragging, and shared muted card styling. SettingsLayout activates it for every kids-profile settings screen, covering Layout, Content & Discovery and the other categories without per-page copies. Links remain available for navigation. The shared InlineError component uses the boundary context to suppress a duplicate restriction error (including the BridgeError prefix); unrelated errors keep their normal alert treatment. Backend authorization continues to reject prohibited mutations.

Editing an existing kids profile shows masked placeholder dots and an explicit configured-key hint. The entered value remains empty until the user types a replacement, so cosmetic saves retain the existing service configuration and never submit the dots as credentials. Regression coverage checks disabled interactions, preserved links, neutral permission messaging, genuine errors, returning to editable mode, both settings screens, retaining an untouched key and submitting only a replacement. All 71 targeted component/bridge/profile-editor tests, the frontend production build and embedded Tauri debug build pass. The updated debug rewrite was launched for testing.

### KidsScreen excludes Horror movies — 2026-10-16

KidsScreen 0.1.1 always rejects movies whose TMDB genre list includes Horror (ID 27), including G/PG/PG-13 titles and mixed genres. Movies missing genre metadata are withheld. A shared title-policy predicate enforces this in catalogs, search, metadata and batched eligibility checks used by featured titles, direct details and playback. Movie discover requests also exclude genre 27 upstream; detail verification remains authoritative for search and direct IDs. This follows TMDB's genre classification, with no change to the existing TV rating policy. Eight addon tests pass, including a PG-13 Horror movie returned by upstream search/discovery that is absent from catalog/search results, has null metadata and receives a denied eligibility verdict. The update was deployed to the hosted Vercel service. Automatic approval review blocked restarting the debug rewrite, so cached results need a manual restart or refresh after their expiry.

### Compact profile editor card spacing — 2026-10-16

Create/Edit Profile cards use the form grid's scaled 14px gap without the additional shared settings-section bottom margin. This reduces inter-card spacing from 39px to 14px before UI scaling, while preserving card contents and padding.

### Settings navigation and hosted KidsScreen setup — 2026-10-16

A normal Settings click now opens Settings while a kids profile is active. The previous kids-only click override opened the profile menu, and the route guard also prevented Settings from rendering; both navigation restrictions are removed for Settings routes. Hold/right-click/keyboard profile switching stays available, and existing backend restrictions on content-management mutations still apply. A navigation regression test checks normal Settings entry and right-click profile switching from a kids profile. All 66 targeted bridge/profile-editor tests, the frontend production build, Kotlin runtime staging and the embedded Tauri debug build pass.

The profile editor removes the expandable KidsScreen connection and server-address field. It always sends `https://kids-screen.vercel.app` for setup while retaining the masked TMDB key and age-limit fields; the backend's omitted-address default uses the same hosted service. Existing configured profiles keep their stored endpoint for browsing until reconfigured. Moving an old local configuration through the editor requires the TMDB key so the hosted service can create its own configuration.

### Optional profile PINs for kids setup — 2026-10-16

Kids setup no longer requires creating or entering a main-profile PIN. `20261016170000_optional_kids_profile_pin.sql` replaces the kids-policy RPC and guard function while preserving installed migration history, existing rating settings, authentication/ownership checks and independent add-on restrictions. Its legacy guardian-PIN argument remains accepted for older callers but is unused. Ordinary profile PINs remain optional and protect only the destination profile when switching; the bridge no longer marks every profile locked while kids mode is active. Kids-mode editing restrictions and rating enforcement remain in place.

The editor removes the mandatory PIN field and setup warning. The native shell now recognizes KidsScreen setup/connection/persistence/title errors and returns useful fixed messages instead of the generic operation failure, without forwarding raw backend messages or credentials. Validation covers no-PIN enable/disable, removing an optional main PIN without losing kids policy, preserved account isolation, 25 profile UI tests, targeted Kotlin policy tests, and the shell's error-boundary regression test. The database behavior test passed in a rollback-only transaction before deployment. The follow-up migration was applied to the linked backend and verified remotely: mandatory-PIN checks are absent and optional PIN removal is allowed. The frontend production build, staged Kotlin runtime and embedded Tauri debug build passed, and the updated debug rewrite was launched for user testing.

### Profile sharing layout and kids setup — 2026-10-16

The rewrite profile editor uses the shared settings-row card and typography for the source-profile picker. The selective-copy list uses compact horizontal rows with the checkbox at the right, scaled spacing and scoped label styles that override the generic form grid rule. Enabling kids mode forces ongoing add-on sync off; existing kids profiles also initialize in independent-copy mode. The editor explains that copied providers can support playback while Cinemeta, AIOMetadata and other copied catalogs are excluded from kids browsing. Existing backend policy continues to select only the managed KidsScreen catalog and verify titles independently before playback. UI behavior tests (16 profile-editor cases), the frontend production build and the embedded Tauri debug build pass. The running rewrite was closed for rebuilding; automatic approval review blocked the subsequent restart command, so this rebuilt executable has not been launched.

The separate KidsScreen project now includes a Vercel Node function adapter, route rewrites and encrypted persistent Upstash Redis configuration storage. File storage remains the local default, and Vercel refuses to fall back to ephemeral files when Redis settings are absent. Its deployment guide documents importing the independent GitHub repository, required private environment variables, production-domain access, persistence/revocation checks and changing Nuvio's configurable server address. Seven addon tests pass, including the real adapter with fake Redis/TMDB transports. KidsScreen was subsequently deployed through the authenticated Vercel CLI to `https://kids-screen.vercel.app` on 2026-10-16. The deployment accepts the integration's `KV_REST_API_URL`/`KV_REST_API_TOKEN` names, has a private production encryption key, and its public setup/health routes return HTTP 200. Existing local Nuvio profiles can change the server address in the editor; real-TMDB enrollment and playback acceptance still require the user's key.

### KidsScreen integration and kids profiles — 2026-10-16

The independent KidsScreen project lives at `C:\projects\kidsscreen`. It implements the Stremio HTTP catalog/meta protocol and a batched rating-verification endpoint, backed by a user-supplied TMDB API key. The local default is `http://127.0.0.1:7879`; production connections require HTTPS. Its keys are encrypted server-side, and configured manifest URLs contain an opaque ID instead of the key. Its own repository, Node build/test scripts, Dockerfile, setup page and CI are independent of this repository. Nuvio communicates only over HTTP.

The desktop profile editor exposes Kids account, Maximum Age Rating (G/PG/PG-13), masked TMDB API key, parent PIN and an expandable server-address setting. Enrolling a secondary profile installs the managed catalog, detaches its outgoing add-on link and preserves independent stream providers. Profiles with incoming add-on dependents must unlink them first. The main profile remains the parent profile and must have a PIN. Enabling/disabling/changing restrictions requires that PIN; switching out of a kids profile verifies the parent PIN, including switches to other kids profiles. Kids mode blocks profile edits, installation/settings changes, external URLs, person/entity browsing, comments and cloud/download browsing, and hides download notifications. Offline launch waits for profile identity before opening Downloads.

Home/Search/Discover catalog inputs use the managed KidsScreen manifest. Featured artwork comes from the allowed catalog metadata. The desktop bridge filters media-bearing response/event trees, including featured, library, related and Continue Watching objects; checks direct detail/stream requests; and rechecks the registered title before native playback. Unknown or unverified titles are denied. Policy changes clear the previous media state, stop playback and advance the session epoch. Parent-to-child switches also clear details/stream state. Successful verdicts cache for five minutes, failures for fifteen seconds, scoped by account/server/configuration/rating. Missing service connectivity grants no new access. TV mappings are conservative: TV-14 and TV-MA never qualify; unrated, adult-flagged and conflicting higher classifications are excluded. TMDB series ratings are show-level rather than episode guarantees. Old clients and standalone Stremio installs do not gain these Nuvio enforcement controls.

`20261016120000_kids_profiles.sql` adds profile policy columns and a dedicated parent-PIN-authorized RPC, extends profile pulls, preserves policy across ordinary/older cosmetic pushes, prevents live add-on links to/from kids profiles and protects the main PIN while kids profiles exist. It also adds `extensions` to existing PIN RPC search paths so pgcrypto resolves on hosted Supabase as well as fresh databases. The migration has a database behavior test covering authorization, attempts, persistence, account isolation and guardian protection. RPC contract scanning now includes desktop bridge sources. The migration was applied to the linked hosted backend on 2026-10-16 after explicit user approval. A private, Git-ignored backup of the eight existing profile rows and five affected functions was verified first. Remote verification confirms the recorded migration, all four new fields, the guardian trigger, signed-in RPC access and denial of public execution; the existing eight profile rows remain. Validation passed: six add-on tests using a fake TMDB transport and real local HTTP server, 71 frontend tests, targeted Kotlin policy/catalog tests, both TypeScript builds, the production frontend build, local PostgreSQL migration/behavior assertions, and the RPC contract check. The running local setup page and health endpoint return HTTP 200. After migration approval, the embedded React/Tauri debug executable was rebuilt with the staged Kotlin backend and launched. Diagnostics confirm the backend ready handshake and restoration of the signed-in session with three profiles. A personal API key and a migrated backend are needed for real-TMDB acceptance. No release, installer or remote GitHub repository is published by this work.

### Profile switching, desktop defaults and selective add-on copying — 2026-10-16

Successful switches from the navigation popup and profile management open Home with route replacement, including PIN-protected profiles. Failed switches keep the current page. Desktop theme settings default AMOLED Black to enabled on initialization, reset and missing stored preferences; explicit saved false values remain respected. Episode cards default to List on desktop, including missing fields in older settings payloads and the React loading fallback, while saved Horizontal choices and mobile defaults remain intact.

The profile editor replaces its native source dropdown with the existing themed settings-choice dialog. “Sync all add-ons” starts enabled and retains the live link behavior. Turning it off loads the chosen source's add-ons with every checkbox selected. Saving sends only the checked URLs, removes the outgoing link and writes an independent ordered snapshot, preserving configured manifest URLs and enabled states. This replaces the target's current add-ons; an empty selection means no add-ons. Source load errors block saving and support retry, obsolete source responses are ignored, and removed/unknown selected URLs are rejected by Kotlin. Existing profiles with dependent linked profiles must unlink those dependents before replacing their add-ons, so the copy cannot change another profile's list. Cloud persistence reuses `sync_push_addons`; no migration is required. If a newly created profile's copy fails, the editor directs the user to finish from All profiles and prevents duplicate creation. The new read method is included in the bridge schema and Tauri allowlist. Validation: 39 frontend tests, TypeScript/production build, and targeted desktop Kotlin copy/layout tests pass. Live visual/cloud-copy acceptance remains unverified. Kids-profile enforcement, the independent add-on and personal-key setup are implemented in the KidsScreen integration described above.

### Branded Windows backend launcher — 2026-10-16

Windows runtime staging now builds a native `runtime/bin/Nuvio.exe` with the Nuvio icon, product name and file description. It loads the private `server/jvm.dll` directly using JNI rather than spawning `java.exe`; the shell and backend remain separate processes, both named Nuvio. The supervisor retains its JVM options, token/handshake pipes, restart and shutdown behavior. Release builds require the bundled launcher; development retains the explicit Java override and system-Java fallback when it has not been staged. macOS/Linux continue using their existing launchers. The executable opts into UTF-8 for JNI options on supported Windows versions, resolves JVM dependencies from the private runtime, and runs without a console window. Java bundling smoke-tests the real bridge through the new executable, and MSI validation requires both Nuvio executables. This changes process branding; Windows Task Manager's visual grouping and WebView2 grouping are not guaranteed. No installer or release is produced by this change.

### Debug-only update banner preview — 2026-10-16

The rewrite's About page shows the “Test update banner” row only when Vite's development flag is enabled. Production builds also reject preview activation in the test-banner driver. The regular update check and signed release banner remain available. Frontend coverage checks both development preview activation and production hiding/activation prevention.

### Rewrite parity review corrections — 2026-10-16

Placement animations now measure card layout offsets relative to the rail/grid rather than viewport rectangles. Page scrolling, horizontal scrolling, zoom and existing transforms no longer become false card-reordering deltas on a subsequent render. Hidden/replaced containers reset their measurements, and running animations are cancelled when their cards or container disappear. Actual removal/reordering retains its placement animation.

The collection editor's loading path keeps hook order stable. Drafts are scoped to each editor/profile, commit in order, retain failed text, and must successfully flush before save or completion actions; saving no longer proceeds after a one-second wait or a rejected update. Late company pages and person retries are isolated from later routes. Back restores a saved zero offset, and Catalog restores a real item/offset measured from card coordinates, including header spacing, grid gaps, responsive columns and matching catalog context.

Removal effects retain the original card slot through the last item, target the actual artwork, and discard stale work on profile changes. Sheet drag transforms own the surface after entry, with dismissal continuing from the dragged position. Theme tokens also reach body portals. Card depth uses Kotlin's border coverage and sheen formulas on artwork frames. Supported-platform hover trailers consume separate audio sources, synchronize their position/lifecycle with video, and stay clipped to the preview artwork. These corrections have automated coverage; native visual acceptance and macOS/Linux playback remain separate checks.

### Decode featured artwork before revealing it — 2026-10-16

The Home hero keeps its backdrop off screen until the full image has loaded and decoded, then starts its fade-in. This applies to the first feature on launch and later features, preventing partially decoded artwork from appearing. Obsolete image completions are ignored; failed artwork leaves the hero's text and actions available. Reduced motion reveals the decoded image without the entrance animation.

The same decoded-image gate now covers the title/clearlogo artwork on the left. Its layout space remains reserved while loading, then the complete logo fades in. A failed logo falls back to the plain title, and late completions from a previous feature cannot reveal the wrong logo. Episode rating stars remain unchanged: IMDb's current public linking guidelines require express permission or a commercial content licence for logo use, and this checkout does not establish such permission.

### Rewrite inline trailers and parity handoff — 2026-10-16

Hover trailers play in-app on supported desktop platforms through a new scoped `trailers.resolveHover` bridge method that reuses Kotlin's meta peek, hero-trailer selection, and platform YouTube resolution (no new scraping). Playback honors the `trailerPlaybackMode` capability (`in_app` on macOS/Linux, `external` on Windows), the saved hover-preview trailer/sound/start settings, and autoplay policy (muted start, sound only when permitted). A single-owner policy guarantees one preview player at a time with teardown on takeover, route/profile change, hidden window, unmount, errors, or ending; the poster artwork is always the fallback. CSP `media-src` gains `https:` (matching the existing `img-src` level) so backend-resolved streams can play; no frames, scripts, or connectors change. Hero trailer playback stays behind the bridge's unsupported flag. Native macOS/Linux playback validation is explicitly pending.

Parity handoff: the checklist in `DESKTOP_UI_PARITY.md` moves implemented areas to `built`; nothing is marked user-accepted. Frontend evidence: 51 test files / 293 tests green, `tsc` + Vite production build green, contract and locale `--check` green, `:composeApp:compileKotlinDesktop` green. Locales ship as on-demand chunks (App ~854KB JS; English inlined). Remaining runtime acceptance — paired captures/recordings across themes, viewports, DPI, inputs, and platforms; large-list measurements; installed migration and second-update journeys; macOS/Linux trailer and package checks — requires the native app and is listed as pending, not claimed.

### Rewrite details depth, secondary screens, and localization — 2026-10-16

Details gains a CORS-safe dominant-color service (`details/dominantColor.ts`) keyed by artwork with stale-request discard and negative caching; the DominantColor mode washes the backdrop with a 42% blend instead of the flat fallback. A rAF-throttled scroll listener drives a condensed header title and backdrop dimming through CSS variables with no per-pixel React state. Tabbed sections crossfade with interruption-safe keyed panels. Person (`/person/:tmdbId`) and entity (`/entity/:kind/:entityId`) are dedicated repository-backed routes with loading/error/retry, biography/credits and paginated company/network rails, origin-carrying Back, avatar shared motion with fallback, and generation-guarded fetches; the old inline panels and their stale-overwrite risk are removed. Gated comments gain a detail sheet with review badges, spoiler reveal, position, and previous/next navigation.

Collection folders reorder by pointer drag (single `moveFolder` commit, elevation feedback, drop highlight) alongside the existing keyboard buttons. PIN dots pop with a bouncy spring approximation that never changes verification or lockout behavior and never retains digits; grid↔PIN crossfades match the reference timings. Auth modes crossfade. Downloads opens the backend-managed folder through a new scoped `downloads.openFolder` bridge method (`DownloadsPlatformDownloader.openDownloadsDirectory`, no arbitrary paths) with honest platform-failure errors; the method is registered in the contract schema and Tauri allowlist via `sync-methods.mjs`. Downloaded-show drill-down stays as inline expandable groups with search/offline behavior unchanged.

Localization runs on generated catalogs (`scripts/desktop-ui/generate-locales.mjs`, 26 locales from canonical `strings.xml`, `--check` supported): typed `t`/`tp` with English fallback, `%1$s` interpolation, `Intl`-based plurals/numbers/sizes/dates, RTL detection, device-language first launch, and saved-language rendering with document lang/dir. The hand-maintained tracking copy is scoped to 25 fork-only MDBList keys (verified zero drift on the 87 shared keys); navigation, auth, Back, Downloads, and the language row render translated. Provider content is never translated. Remaining hardcoded surfaces (Home shelves/CW, Search/Discover, Catalog, Library/cloud, details sections, collections, streams, profiles/PIN labels, updater/progress copy, settings bodies) are inventoried below and stay English until migrated key by key.

### Rewrite scroll restoration, hero/hover motion, and removal effects — 2026-10-16

Scroll ownership is explicit: `.main-area` for page routes, `.settings-pane` for settings children; rails and sheets are never saved. A shared `navigation/scrollStore.ts` namespaces numeric offsets by profile, route, and list context (filters/sort/catalog/tab/query) with stale-response guards, bounded cancellable restores, and user-scroll interruption. The shell resets only on forward navigation; Back/Forward restores. Catalog measures its live grid instead of guessing columns/rows. Library, Downloads, collection folders, details, and settings children restore through the same store; Discover/Home keep their existing semantics. Only offsets are retained.

The hero pager tracks pointer drags with 1:1 layer motion, fling/distance settle, snap-back, click-arrow buttons, keyboard support, click-after-drag suppression, reduced-motion and hidden-window autoplay pauses, adjacent artwork preload, and a stable starting item. Hover previews match `HomePosterHoverPreview.kt`: 420dp width, centered placement with 24dp overlap and 16px clamping, 260ms enter (fade/scale/slide), 120ms close delay with 170ms exit, wheel-over-preview dismissal, cross-card interruption, and Escape dismissal.

The Home/Library action overlay lifts from the captured source card and returns to its live bounds, with a fade fallback when virtualization, data, route, or profile changes removed the source. Neighbor placement animates via FLIP on moved keys only. Destructive Continue Watching/Library removal arms a bounded ash effect (transform/opacity DOM particles, no canvas reads), calls the repository exactly once, and restores the card with an error on failure.

### Rewrite card depth, streams, details backgrounds, sheets, sidebar, lists — 2026-10-16

Card depth now follows `CardDepthStyleRepository`/`CardDepthEffect.kt` on all five surfaces (posters, Continue Watching, episode cards, cast, trailers): global enable plus per-surface toggles gate rendering, and edge strength, sheen strength, and edge coverage drive a gradient-only overlay clipped to the card shape. No per-card blur is introduced, and overlays sit on the artwork frame so action buttons stay clickable. The old static poster shadow is removed. Poster hover `will-change` is scoped to hover/focus instead of every card.

Stream badge position (top/bottom) and stream background mode (normal/cinematic) from `StreamBadgeSettingsRepository` are consumed in `StreamsPage`: top placement renders the badge row above the title, cinematic applies a blurred dimmed backdrop. Badge rows scroll horizontally like `StreamCard.kt`. Provider chips use the active accent with on-accent text, carry `aria-pressed`, and have a focus ring.

Details background modes from `MetaScreenSettingsRepository` are plumbed: Normal shows no backdrop, Cinematic the artwork backdrop, DominantColor a dimmed fallback wash until Phase 8 delivers real dominant-color extraction with stale-result handling.

Bottom sheets gain pointer drag-to-dismiss with M3-style distance (quarter height) and velocity thresholds, snap-back, content-scroll arbitration, control-gesture exclusion, and interruption; reduced motion keeps instant behavior. Sheet exit timing moves 220ms → 250ms to match `sheetExitMillis`. The sidebar animates width over 200ms and expands on hover/focus for adaptive, or while the profile stack is open for compact; expanded/classic stay open. The hold-to-open profile gesture is unchanged. Menus gain arrow/Home/End keyboard navigation; dialog actions share an equal-width responsive rule; destructive buttons use the palette danger; dialog fields add hover/focus/disabled/error states; detail/stream skeletons respect reduced motion.

Lists use duplicate-safe logical-ID keys (no index suffixes) across shelves, grids, catalog, and episodes. Library added-date sorting builds one lookup map instead of searching per comparison, and progressive fill restarts on sort/mode/layout changes. The rail observes only its container. Catalog drops the guessed six-column/260px math: it measures the live grid, saves anchors on the real `.main-area` scroller, and restores with bounded cancellable retries. The collection editor types into local drafts committing after a 500ms pause, on blur/Enter, or on unmount; save and navigation wait for in-flight commits. `heightDp` needs no bridge change: it is derived from width (3:2) in `PosterCardStyleRepository`. Hover-trailer flags and the poster transition stay disabled by platform/capability gates; tooltips and native-select restyling are deferred.

### Rewrite derived theme palette — 2026-10-16

The settings bridge now projects Kotlin's full derived `ThemeColorPalette` per theme (accent variant, on-accent colors, focus ring/background, accent gradient, native accent) instead of only background/accent/surface. The React shell resolves the active entry — including the custom theme — from that canonical list, so custom themes use the same lerped surfaces as Kotlin rather than mapping the three raw editor slots directly onto background/accent/surface. AMOLED still overrides only the page background, matching `buildColorScheme`. Shared focus outlines use the palette focus ring.

Shared color tokens follow `defaultNuvioThemeTokens`: sheet/dialog resolve to the elevated surface, popover to the card surface; primary buttons use on-accent content with accent-38% disabled state; settings switches use accent track with on-accent thumb (unchecked: border-default track, muted thumb); dialog scrims use black-56%; form errors use the palette danger. Motion durations tokenize `NuvioTokens.Motion` (sheet enter 300ms / exit 250ms); jelly/spring curves stay with existing navigation motion since springs have no CSS equivalent. Raw custom colors remain only as a fallback for backends predating the projection.

### Automatic installation after update download — 2026-10-16

The rewrite's Update action downloads and verifies the signed package, then immediately starts installation and restart without a separate confirmation button. The banner explains this before downloading and moves directly into installation afterward. A failed download never installs. An installation error keeps the verified download and offers Retry update, avoiding another download or an automatic retry loop. About's isolated banner preview remains a simulation.

### Rewrite welcome and release acceptance — 2026-10-16

The rewrite welcome is now deferred until Home is actually visible after profile selection/loading. It no longer covers sign-in, the profile chooser, other routes or offline Downloads; its existing device-local acknowledgement remains unchanged. A double-click on the navigation Search item opens Search and focuses its field without changing the query or scrolling Discover. The focus request is consumed so returning from details does not repeat it.

New and upgrading installations see a one-time welcome explaining the faster rewritten desktop interface and touchscreen support. A device-local acknowledgement is independent of account/profile and future app versions. The dialog appears on Home after startup and profile readiness, and defers the Continue Watching prompt until dismissed. Offline Downloads remains available without dismissing the welcome first. Failed browser storage still allows dismissal for the current session.

Release CI verifies both macOS DMGs by mounting them read-only on their matching GitHub runner, checking production bundle identity and executable architecture, and running the packaged Java/backend token-guard smoke check. These package checks do not claim interactive macOS migration or playback acceptance. Linux packages retain runner identity, runtime and signing checks; installation/migration testing remains a separate user test on Linux.

### Rewrite Discover and search navigation — 2026-10-15

Back navigation restores the previously rendered poster count in the first grid commit, rather than replacing shorter placeholders above the saved viewport over successive frames. Discover disables browser scroll anchoring, and restoration stops immediately once the saved offset is reachable. This prevents the grid rebuild from shifting the page farther down after returning from details.

Discover saves scroll positions by profile, browser-history entry and selected type/catalog/genre. Returning with Back restores the matching offset, with bounded retries while the poster grid fills. User scrolling interrupts restoration. Fresh navigation, filter changes and entering a search start at the top. Search owns its scroll handling so the shared shell reset no longer overrides restoration. Scroll is saved before opening a card and during scrolling, rather than on unmount after another route may have clamped the shared viewport.

Typing a nonempty search or selecting a recent query resets the shared main scroller immediately, before debounce or returned results. Clearing through the button, Escape or input deletion clears the shared search snapshot synchronously and changes its request identity before asking Kotlin to cancel. Late results from the previous request are discarded, so returning from a Discover title restores Discover. Returning from a title opened in actual search results still retains the query and cached results.

### Rewrite offline downloads and playback sync — 2026-10-15

Downloads reuses the details screen's circular BackButton, returning to Library even after a direct launch. Local search matches movie/show titles and episode titles case-insensitively, ignores surrounding whitespace and combines with status/type filters. Startup starts the existing native internet probe and exposes its condition in session snapshots/events. A confirmed NoInternet result (or the browser's offline-at-launch signal) opens local Downloads without waiting for online authentication or profile selection; the online resume prompt stays suppressed there. Unknown/Checking holds the startup loader, while ServersUnreachable follows normal startup. This is a one-time routing decision; subsequent connectivity loss does not navigate away. The native probe retries every 15 seconds while offline or servers are unreachable.

Playback already persists partial positions, completion and dirty sync keys to the existing profile files. The rewrite now uploads those pending progress entries and watched marks when signed-in connectivity returns, also on an online restart, and retries failures every 30 seconds. It visits every cached account profile without switching the active profile. Progress and watched uploads fail independently; only successful acknowledgements clear dirty keys, and newer local changes remain pending. Account/profile context changes cancel in-flight retry work, and uploads require the authenticated account to own the loaded profile cache. Anonymous sessions do not upload to the cloud. Completion uses the existing player threshold; halfway progress does not mark a title watched. The existing sync RPCs and schema are reused.

### Rewrite Library card actions — 2026-10-15

Saved Library cards reuse Home's poster action dialog for right-click, long-press and the card action button, including the same artwork, library membership and watched actions. Both grid and horizontal shelves share the Poster implementation. The extra per-card “Manage lists” button and the hover ⋯ action button have been removed from the saved Library (actions stay available through right-click, long-press and the keyboard context-menu key). Other screens retain their existing menus.

The Library header restores Kotlin's layout toggle (horizontal shelves ↔ vertical grid) and the Saved controls row uses Kotlin's Type/List/Sort dropdown chips. Fullscreen uses a separate circular control at the top-right of the content viewport, matching Home's 35 px top inset, 52 px button and 24 px icon. Downloads is a labeled link with an icon instead of an icon-only action.

### Download start and completion notifications — 2026-10-15

The rewrite shows a temporary top-center toast, styled after Kotlin's “Back online” toast, after a download enqueue succeeds (including confirmed replacements). Errors and replacement-confirmation prompts do not announce a start. An app-level host follows the existing Kotlin download snapshots and announces transitions into completed with the title and episode, even away from the downloads screen. Initial completed downloads and repeated completed snapshots stay quiet. Messages queue, dismiss automatically, respect reduced motion and use a polite live region. Download progress and completion remain owned by Kotlin.

### Download size filter markers — 2026-10-15

The rewrite's maximum download size control reuses the Settings stepped slider, showing a dot at every selectable 1 GB position and the current size beside its label. Dragging previews the selected step locally and saves on release, keyboard completion or blur instead of disabling the slider for a backend save on every movement. The control retains the backend's size bounds and disables while a save is pending.

### Rewrite Picture-in-Picture restoration — 2026-10-15

The rewrite reuses Kotlin's existing always-on-top PiP window, native video surface and controls. Its main player page now mirrors Kotlin's “Video playing in Picture-in-Picture” placeholder and “Restore to Main Player” button, with Escape also restoring from that page. PiP changes are published through playback snapshots and an allowlisted restore command calls the existing Kotlin coordinator. Previously the placeholder lived only in the invisible Compose helper window, and leaving PiP reparented video and controls into that helper's Canvas. Restore now resolves the same parent as initial playback attachment, returning embedded Windows playback to the Tauri HWND while retaining the Canvas path for the original Kotlin app. A failed native restore keeps PiP available instead of disposing its window. Regression tests cover parent selection, unavailable/failed restores, the placeholder, Escape and bridge-error retry. Installed-app playback acceptance remains to be verified.

Validation: the four selected Kotlin PiP/embedded-host tests, three frontend PiP tests, all nine Rust shell tests, TypeScript/Vite production build and generated-contract check passed. No installer was rebuilt.

### Rewrite screen navigation scheduling

The liquid top bar starts its highlight on pointer-down, while BrowserRouter previously queued route changes through React's lower-priority `startTransition`. Poster mounting and bridge snapshot updates could delay the route commit after the bubble moved. The app now sets `useTransitions={false}` on BrowserRouter so navigation commits at input priority; screens continue to show cached data or loading placeholders while their asynchronous work finishes. Bubble physics and timings are unchanged. A regression test failed with the old configuration because Search remained absent after urgent work was flushed; it now verifies immediate Home, Search, Library and Settings commits and retained Home DOM. This isolates the scheduling issue in tests; installed Windows app latency still needs runtime verification.

### Rewrite shared movie-card sizing and Settings search

Movie cards now derive width, aspect ratio and corners from Home’s rendered metrics, including poster customization and landscape mode. The shared component cancels surrounding page zoom so Search, Library, Catalog, Collections and Details rows retain the same physical size as Home. Grids, rails, labels and loading placeholders use shared spacing and typography; expanded hover previews use the Home component everywhere. An isolated browser fixture measured matching 190.07 × 285.10 poster rectangles across Home, Search, Library and Catalog at the default preset. Continue Watching retains its separate card-style choices.

Settings search ports Kotlin SettingsSearch.kt’s whitespace-separated, case-insensitive all-word matching across title, description, page, section and category, preserving index order and description/context fallback. The field has leading search and trailing clear icons, outlined focus styling and reveal motion; it is available through the visible search button, Ctrl+F and upward scrolling at the top. Clearing returns to category navigation. Search rows use unique index keys, open their concrete settings pages, and dispatch profile/collections/privacy/update targets through existing functionality. Unsupported desktop controls remain excluded. Regression tests cover matching, clear/focus, repeated page targets and the update action.

### Home-return hiccup follow-up

The Windows comparison recorded Home frame gaps of 73–97 ms versus 12–30 ms on Library/Settings, with 636 retained Home poster cards and four snapshot requests on every Home return. Disabling the featured hero did not remove the lag. The Activity cache is replaced by a stable, memoized Home route kept outside the active page's layout while hidden, so poster effects and Home snapshot requests do not restart on return. The Home visibility context pauses carousel rotation and scopes scroll tracking to active Home; scroll positions are recorded on scroll before route hiding can clamp the shared viewport. Memoized collection rows avoid rebuilding the shelf tree just to change Home visibility. Rail edge state updates bail out when unchanged, and poster saved-state subscriptions update only when that card's membership changes; scroll-dismiss listeners attach only for active previews. Bubble physics, visuals and timings are unchanged. Regression coverage verifies retained effects/DOM, profile isolation and restoring scroll without tracking another screen or repeating snapshot requests. The follow-up Windows recording had zero refresh RPCs on Home return and a 55 ms maximum frame gap; the user confirmed improved responsiveness. The temporary diagnostics were removed afterward. The result is an improvement, not a claim of eliminating every dropped frame.

### Rewrite account dialogs and Home return performance

Torbox and Premiumize account dialogs now render through a body portal so scrolling/transformed settings containers cannot trap the popup. Their layout, copy, code panel, manual-key alternative and actions follow Kotlin `DebridDeviceAuthDialog` and `DialogSurface`. Opening an unconnected account starts sign-in automatically; approval polls at the provider interval and closes the dialog after the credential is saved. Open link uses the real verification URL, tapping the code copies it, pasted keys use the existing provider validator, and connected accounts show the disconnect confirmation. Pending authorization uses the same Kotlin storage as Compose and survives dialog dismissal/reopen and app restart. Transient redeem failures retain the pending session with Kotlin's 15-minute watchdog; expiry/denial clears it and retry creates a new code. Private device codes and access tokens stay in Kotlin. Missing Premiumize client configuration has a fixed public error code/message. Tests cover portal placement, StrictMode startup, polling, browser/copy actions, manual validation/save, expiry/retry, disconnection, dismissal, persisted sessions and network failure handling. Live provider authorization requires acceptance testing with the user's accounts.

Home now retains its poster DOM through a React Activity when another screen is active. Hidden effects/subscriptions are suspended, the Home route context stays scoped to Home, and changing profiles discards the cache. Returning no longer recreates every poster card. The navigation caches its width, height and density from resize observations instead of reading computed styles and layout on each spring frame. The SVG path, spring equations, timings and visual styles are unchanged. Regression tests verify retained DOM/state, paused effects, profile isolation, selection animation and the absence of per-frame computed-style reads. Runtime smoothness still needs assessment in the Windows debug app.

Home navigation links and drag selection no longer send `resetHomeScroll` on every return. The existing per-profile Home view state can restore the previous position instead of explicitly jumping to the top. This change is being tested in the Windows debug app; the reported Home-return bubble lag still needs runtime assessment.

### Rewrite episode scrolling and trailer capability

Horizontal episode collections reuse Home's `HorizontalRail`, including circular hover/focus arrows, 85%-width paging, reduced-motion behavior and disabled edges. List episodes retain their vertical layout. Hero trailer previews are now explicitly unavailable in rewrite metadata snapshots: the React details hero has no trailer renderer, and Windows also disables this feature in the original desktop policy. Settings disables the switch with an explanation and directs users to the title's Trailers section. The bridge rejects attempts to enable the missing renderer without changing the saved preference; Rust maps `CAPABILITY_UNAVAILABLE` to a clear fixed message while continuing to redact backend messages. Frontend tests cover episode paging/edges, list mode and the disabled setting; Kotlin and Rust regression tests cover the capability rejection and public error text. The installed executable has not been rebuilt.

### Rewrite resume prompt on launch

The Continue Watching launch toggle previously persisted without any rewrite player tracking, launch consumer or popup. The native rewrite host now records the entered video, clears it on ordinary player exit, and retains it while app shutdown releases the player. After profile selection, the React shell consumes the existing Kotlin resume repository through an allowlisted bridge method and offers Resume or Dismiss with title artwork and progress. Resume opens fresh stream selection with the saved episode, position and artwork; the shared repository supplies the next released episode after completed playback. Disabling the setting discards the saved launch marker. The frontend reuses its consuming request across StrictMode effect restarts and ignores late results from another profile. Regression coverage includes those startup, navigation, dismissal and player shutdown cases. Installed-app close/reopen acceptance remains to be verified; no release installer was rebuilt.

### Rewrite right-click behavior

The React app suppresses the browser context menu on ordinary backgrounds, artwork and navigation. Existing poster, Continue Watching, episode, stream and Settings profile menus keep their own right-click handlers. Inputs, textareas and editable content retain native text-editing menus. The app-level bubbling handler prevents the default menu without stopping custom menu events.

### Rewrite shared fullscreen

The Windows embedded player inherits Tauri's fullscreen mode and requests toggles through the shell. Tauri owns both fullscreen and windowed restore bounds; the player no longer changes the same HWND through a separate JNI fullscreen controller. Shell acknowledgements and resize events update the Kotlin controls. Closing playback preserves the current shell mode, including fullscreen entered in the player after starting from a windowed UI. This applies to stream, cloud and downloaded playback. Regression tests cover inherited fullscreen, acknowledged exit, and preserving fullscreen on close/reopen.

### Rewrite startup from cached profiles

After authentication is restored, the bridge publishes the matching account's cached profiles before pulling cloud profiles and add-ons. A sign-in without cached profiles waits for the first profile pull. The frontend decides whether to show the chooser from session profiles, without waiting for cosmetic catalogs. Profile snapshots hydrate cached avatar choices and schedule remote loading in the background; profile, avatar and background events keep the chooser/editor current. Cloud profile changes also update the session used by the chooser. Late add-on responses are discarded after an account or profile change. Remote login validation remains part of startup.

### Stream search failure recovery and diagnostics

The rewrite's stream metadata truncation preserves UTF-16 surrogate pairs. Previously a description ending at the first half of an emoji produced invalid Unicode, preventing delivery of the stream results (reproduced with Unabomber and Spider-Man: Brand New Day). Optional missing descriptions are projected as empty strings to match the bridge contract.

Stream source tasks and desktop HTTP exchanges have a 60-second deadline. Navigating away cancels HTTP requests. Each source keeps its shimmer until optional debrid availability enrichment and presentation finish, then publishes its settled labels and ordering once. This prevents a temporary P2P list from flashing before TB Instant results. Availability enrichment has a 20-second deadline and falls back to unknown availability; other sources can finish independently. Processing failures settle loading state without allowing cancelled searches to overwrite newer requests. The rewrite stream-event subscription survives serialization failures and returns a visible error. Search phases, elapsed times, counts, and event delivery are recorded in `%APPDATA%/com.nuvio.media.desktop.preview/logs/bridge-diagnostics.log`; diagnostics exclude request URLs, response payloads, and credentials. Searches still fetch fresh sources on every entry.

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

### Signed rewrite updates and CI delivery — 2026-10-14

The release updater now runs in Rust through Tauri's updater plugin. It checks the stable signed feed at startup and from Settings, downloads with progress, verifies both the artifact signature and its signed installer version, and keeps the verified bytes for explicit Install and restart. The Kotlin backend stops before installation and restarts if installation fails. Concurrent update operations are rejected; a failed download cannot reach installation. The About banner test remains isolated from release actions. AppImage, DEB and RPM update targets select their own package format; Flatpak retains external update ownership.

`desktop-release.yml` now builds the rewrite on Windows x64, macOS arm64/x86_64 and Linux x86_64, including MSI, DMG, AppImage, DEB, RPM and Flatpak artifacts. It stages the real Kotlin bridge and native resources, bundles Java, runs frontend/Rust/bridge tests, signs updater artifacts and publishes a complete `latest.json` plus checksums after all seven builds succeed. MSI verification checks the old UpgradeCode, ProductVersion, executable name and essential bundled runtime files. Release mode/tag/version-bump guards are retained. Generated release configuration uses `com.nuvio.media.desktop`, `Nuvio.exe` and installer/updater version `1.0.<VERSION_CODE>` from the existing desktop version file; GitHub tags, About and the banner retain the marketing version. Staged classpaths are relative. AppImage explicitly includes the native player library/libmpv for dependency deployment; Linux system packages declare their dependencies. Local Windows test packaging now defaults to the migration MSI, not the separate NSIS preview installer.

The `desktop-release` environment has `NUVIO_UPDATER_PRIVATE_KEY` and `NUVIO_UPDATER_PRIVATE_KEY_PASSWORD` secrets and a `NUVIO_UPDATER_PUBLIC_KEY` variable. The encrypted key and DPAPI password backup are protected under the current Windows user's `.codex/keys/nuvio-desktop-updater` directory. These keys sign updater packages, independently of OS code signing. No release has been published or installer applied by this change. The real Kotlin-to-rewrite upgrade, custom install locations, next rewrite update, rollback, and macOS/Linux runtime acceptance still need installation testing. The existing version has not been bumped.

Validation: all 144 frontend tests, nine Rust tests, six release packaging/schema tests, 20 Kotlin bridge adapter tests, the production frontend build, native Rust compile, staged Kotlin runtime, Java/native staging checks, PowerShell/Bash syntax and Actionlint pass locally. The full Kotlin desktop suite has eight failures in unchanged image/hero/progress areas and Linux path assertions on Windows (1469 tests, one skipped); release CI deliberately runs the bridge adapter suite rather than unrelated Compose UI tests. Hosted multi-platform package builds and installation acceptance have not yet run.

### Nuvio branding — 2026-10-14

The rewrite's product name, window title and Windows Start Menu folder now use `Nuvio`; the packaging script exports `Nuvio-Setup.exe`. The existing Tauri identifier remains unchanged. This is a display-name change; migration from the Kotlin MSI installation and update delivery still require implementation and installed-app testing. Configuration JSON and PowerShell syntax were checked; no installer was rebuilt.

### Top bar selection animation lifecycle — 2026-10-14

The rewrite's liquid navigation now cancels and clears its animation frame in the selection layout effect's cleanup. Previously, React StrictMode's effect restart cancelled the frame without clearing its stored ID, so subsequent route changes could leave the highlight stuck on Home. A regression test exercises animated Home → Search → Library → Settings → Home selection under StrictMode and checks that unmount cancels all pending frames; reduced-motion coverage remains in place. All 139 frontend tests and the TypeScript/Vite production build pass. The packaged Tauri executable was not rebuilt for this change.

### Combined rewrite verification — 2026-10-14

The TypeScript/Vite production build and all 123 frontend tests pass, including 11 Home Layout tests and nine Collections management tests. Verification adds explicit coverage for catalog visibility and Home switch writes, repository-backed reset, hero selection below the limit, opening an existing editor, cancelling deletion and retaining input/data on failed import. The Kotlin desktop bridge JAR builds and all 13 Home catalog tests plus five desktop navigation tests pass. `git diff --check` is clean. The existing Android-host `HomeCatalogSettingsRepositoryTest` could not execute because `compileAndroidMain` fails on desktop-only `PointerButton`/`button` usages in `MainAppContent.kt` and `PlayerScreenContent.kt`, and `onPointerEvent` in `HomePosterHoverPreview.kt`; these files are unchanged in this work. Visual UI verification remains with the user.


Home Layout mirrors the Kotlin summary, grouped toggles, expandable hero sources, and scrollable catalog rows, including addon subtitles and outlined display-name fields. Drag handles and keyboard arrow controls reorder catalogs through Kotlin with stable keys; pinned collections stay locked and show the same explanation. Hero selection respects the repository limit, collection rows stay read-only, catalog loading/failure/empty states match Kotlin, and successive rename edits are serialized. The appearance snapshot includes addon names, pin state, the selection limit, and manifest status.

Home Layout catalogs and Detail Page Sections now use one reusable row component with Kotlin tablet spacing, typography, visibility switches, Menu drag handles, inset dividers, and bounded scrolling. Detail tab-group chips sit below the summary and preserve the three-member limit, selected-group removal, and non-tabbable/hidden section rules. The bridge observes addon manifests and collections together, synchronizes Home settings before refreshing content, skips unresolved first manifests, and resynchronizes on profile epochs. Saved Home preferences load before manifests arrive. Home renders only Kotlin's selected hero items, including its collection fallback; it no longer substitutes unselected shelf titles.

Playback sliders show discrete tick positions, a segmented track, and a vertical handle while retaining native range keyboard/pointer interaction and the same saved intervals. Skip Segments ports Kotlin's separate Skip Intro detection toggle and Automatic Skipping navigation row, selected-type summary, four-option checkbox dialog with descriptions/checkmarks, and conditional AnimeSkip/IntroDB credential dialogs. Individual automatic types update the shared Kotlin repository without replacing other selections. Changed nonempty IntroDB keys run the same verifier before saving; unchanged keys and clearing skip verification. Credential fields support prefilled editing, explicit Save/Cancel, and the IntroDB visibility toggle. Frontend and bridge tests cover these flows without calling live services.

### Glass top-bar navigation and default layout

Top Bar is now the shared desktop default when no layout preference is stored; existing Sidebar selections remain explicit preferences. The rewrite top bar ports `DesktopNavigationBar.kt` and the `core/ui/jelly` spring equations: equal-width tabs, a 4dp-inset accent selection pill, clipped active/inactive text and icons, press stretching, drag velocity deformation, rubber-band movement, pointer glow and spring return. Kotlin Home/Search/Library icon paths, desktop density breakpoints, 320ms label/surface/sheen transitions and 420ms glow-strength transitions are retained. Hover, keyboard focus, profile popup and the Home/Settings scroll thresholds control frosting; the frosted surface uses a 14dp browser backdrop blur with the original tint and vertical sheen. Adaptive/expanded/compact settings, Settings hold/context-menu behavior and reduced motion are supported. Six physics regression tests pass; the combined frontend suite now passes 123 tests, and the TypeScript/Vite build passes after the final refinements. The isolated browser check confirmed compact geometry and active/inactive clipping; concurrent development overlays interrupted the expanded visual check. The shared Kotlin desktop bridge build and 18 selected Home catalog/navigation tests passed during combined verification. Backend staging and debug-app restart are separate from these checks. Exact rendered comparison against the running Kotlin app remains pending; Chromium backdrop blur and Haze are different renderers.


Collections management now follows Kotlin `CollectionManagementScreen`: a standalone sticky header with Back, fullscreen, Copy JSON and Import actions; collection/folder count card; full-width New Collection button; compact folder-count/pinned cards with drag handles, edit and delete actions; and the original empty state. Import validates through `CollectionRepository` before replacing the active profile’s collections, with inline errors and a single Import action. Export writes the repository JSON directly to the clipboard, with a failure modal. Pointer dragging and keyboard Arrow Up/Down on the reorder handle use the existing persisted move action; deletion retains confirmation. Editor and folder-browsing routes continue to use the existing Kotlin bridge. Focused regression coverage checks navigation, empty/populated screens, clipboard failure, invalid/valid imports, reordering and deletion failures.


Every rewrite stream entry, including autoplay and Continue Watching, calls `StreamsRepository.reload` to cancel the old search and fetch fresh source results. Add-on requests send `Cache-Control: no-cache, no-store`; desktop HTTP has no local disk response cache. Request-scoped RPC snapshots and explicit post-activation events prevent stuck loading, while newer events/requests take precedence over late replies. Starting a request clears stale selection state; explicit manual selection ignores autoplay candidates. Regression coverage includes repeated manual entry and autoplay starts for the same title. Expanded Home catalogs replace header Back/Refresh buttons with a reusable top-left circular `BackButton`, also used by title details; failed catalog loads retain their inline retry action.

Details and stream selection share the same 65% → 72% black backdrop gradient. Stream artwork brightness matches the details backdrop's 90% compositing strength; the playback loading screen retains its existing shading.

The edit profile screen includes a bottom Delete profile button for secondary profiles, using the existing `profiles.delete` bridge operation. Confirmation supports cancellation, prevents duplicate submissions and remains open on failures; successful deletion returns to Profiles. The primary profile remains protected. Editor tests cover cancellation, success, errors and primary-profile protection.

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

The earlier optional `desktop-ui/src-tauri/tauri.windows-installer.conf.json` configuration produces a separate current-user NSIS preview installation. It has been superseded for migration/release use by the MSI path: `scripts/desktop-ui/package-windows-setup.ps1` validates a prepared backend's relative classpath and bundled Java, stages it, builds the production frontend and shell with the original MSI upgrade identity, and copies the installer to `Nuvio-Setup.msi`. Pass `-BackendDirectory` to use a prepared runtime elsewhere; the default is the portable build's `resources/backend`. Generated installers are ignored by Git. Local packaging is for installed-upgrade testing and does not publish a GitHub release.

Navigation follows the original Kotlin layout: Downloads is reached through Library, and Settings displays the selected avatar with a profile picker on hold (also accessible by right-click or Arrow Down). Content uses independent 1.22 scaling without enlarging the top bar. Discover uses an adaptive poster grid, virtualized grids account for actual card widths, and catalog/Continue Watching/Up Next/collection rows have scroll arrows at both ends. These changes stay inside the isolated React presentation layer.

Continue Watching’s Poster Card Style selector in the rewrite now draws the Kotlin preview diagrams at their original dimensions: a 100×56 landscape Card with bottom shading and a 55% progress bar, a 100×60 Wide card with a 40-wide artwork panel and 60% progress, and a 60×90 Poster with a 45% progress pill and metadata below it. Rounded corners, placeholder opacities, selected checkmarks and accent-colored labels follow the Compose reference. The preview row reserves room for the full Poster diagram so its metadata is not clipped. No build was run for this change because another agent is working in the same checkout.

Settings parity now uses the Kotlin four-category sidebar, nested routes, centered content pane and original-scale row/card spacing. It implements the General subpages for layout, discovery, addons, playback, integrations, Home, posters and Continue Watching; Account, About and Advanced pages; and dialogs for selection, addon/provider configuration, and confirmations. Kotlin bridge additions expose the corresponding preferences, addon metadata/actions, integration state, playback settings and About details. The pages were compared against the installed Windows app, including Account, About, Advanced, Content & Discovery, Playback, Addons and TMDB; the exhaustive checklist remains partial until all nested states and visual states are verified. This migration remains opt-in and does not change the Compose UI or release pipeline.

An opt-in desktop UI migration adds `desktop-ui/` (React/TypeScript presentation and Tauri supervision), `desktop-bridge/` (Kotlin repository adapters and protocol schema), `scripts/desktop-ui/generate-contract.mjs`, and `gradle/fork-desktop-ui.gradle`. The only existing application build edit applies this fork script from `composeApp/build.gradle.kts`. Upstream repositories, storage, sync and native playback are reused. The original Compose launcher and release pipeline are retained during migration. Playback still uses a separate native Compose player window, and the preview does not yet implement every original screen. See [DESKTOP_UI_REWRITE.md](DESKTOP_UI_REWRITE.md) for architecture, coverage, local preview build and upstream merge procedure.

The installed Windows migration test exposed Java class-loading failures when Rust supplied canonical `\\?\` paths. The supervisor now resolves safe, ordinary Win32 paths for the classpath and native resources while retaining containment checks. A Windows regression assertion and CI smoke check of the staged bridge entry point protect this startup path. The first MSI upgrade replaced Kotlin build 33 with rewrite build 34 and preserved all 30 existing app-data files byte-for-byte, but failed backend startup; that build is not suitable for release.

The corrected CI-built rewrite `0.1.27.3` (build 35) then upgraded a restored Kotlin build 33 successfully at the original installation path. The installer preserved all 30 data files byte-for-byte; the installed app connected to Kotlin, retained the signed-in account and three profiles, and loaded Continue Watching and the saved library. Navigation highlights were verified on Home, Library, Search and Settings. The public feed/download/restart cycle and installed macOS/Linux migration remain acceptance work; see the installed-test record in [DESKTOP_UI_REWRITE.md](DESKTOP_UI_REWRITE.md).

Flatpak packaging retains the upstream uchardet archive checksum and adds Debian's byte-identical source mirror after an intermittent HTTP 418 download failure. CI supports a Flatpak-only build target for focused retries; draft/publish still require every platform. The build 35 Flatpak rerun passed packaging and sandbox runtime linkage checks.

The React stream-selection screen now mirrors the Kotlin desktop loading state: it shows active scraper names and four shimmer skeleton stream cards instead of a centered spinner in an otherwise empty results panel.

Preview sign-out is local-authoritative: the bridge reports `session.signOut` as success once local state is cleared even when remote sign-out fails (e.g. offline), and the UI resyncs to backend truth so logout always lands on the login screen instead of stranding the client on a stale epoch with a session-restore error. Wheel input over the portaled poster hover preview is forwarded to the page scroller, so the page keeps scrolling normally while an expanded card is open. The details screen now tolerates dead addon artwork per title (e.g. Cinemeta returning 404 fanart/logo while catalog art still works): a failed logo falls back to the title text and an unloadable backdrop is dropped, matching the original UI, instead of showing a broken image over an empty hero. Episode thumbnails and season posters use the same tolerance via a shared image component that walks thumbnail, series artwork, then nothing, since the original build degrades these silently through its image pipeline. The home hero shelf fallback is capped to the backend's 8-hero limit so its dot indicators cannot explode into dozens when no backend heroes are available. Poster card title/meta typography is unified through the single shared rule (matching Library) after removing Home and Search overrides that drifted in size, weight, and color; the original uses one shared card component everywhere. Returning from a title restores the previous search query and results instead of resetting to Discover. The preview adds an About test hook that shows a fake update banner (tag 9.9.9 with simulated download progress and release notes), mirroring the original debug banner, so the banner UI can be reviewed without a real release. The preview shell targets the Windows GUI subsystem in all builds, so launching the debug app never pops a console window; shell diagnostics remain in bridge-diagnostics.log.

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
- **Historical shared debrid connection (superseded on desktop, 2026-10-19):** the original fork pinned provider storage to the primary profile. Desktop now isolates provider accounts, preferences and pending sign-ins per profile; see the profile-credentials entry above. Mobile targets are outside this desktop change.

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

- **Downloads type filter label:** the rewrite's combined movies-and-series option now reads “All”; its filter value and behavior are unchanged.
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

- **Bottom sheet entrance direction:** sheets remain opaque while rising from below the window to their resting position. The backdrop no longer fades the entering sheet, and dialog focus uses `preventScroll` with a non-scrolling clipped backdrop so focusing an offscreen action cannot move the animation's starting position.
- **Bottom sheet motion in the rewrite:** episode action sheets enter from below the window in 300 ms and dismiss downwards in 220 ms, with a fading scrim. Shared presence handling retains the sheet and its data through action, Escape and backdrop dismissal; closing content is inert and focus returns after the exit. Manual stream navigation waits for dismissal. Tracking preference pickers use the same motion when their existing narrow-window bottom-sheet layout applies; centered dialogs keep their current behavior. The native player's bottom-anchored audio, subtitle and speed panels now travel fully from/to below the screen, retaining the existing 220 ms transition and 240 ms removal delay. Reduced-motion settings skip movement and dismissal waits.
- **Rewrite player loading handoff (Windows):** the native player container stays hidden until its controls receive the initial player state, render the opening UI and allow artwork decoding (bounded to 1.5 seconds) and two animation frames (with a 100 ms fallback for hidden WebViews). A presentation acknowledgement reveals the native container and completes the bridge start request; React keeps the existing stream loading screen mounted until then. Native controls readiness alone no longer triggers the visual handoff. Cancellation and the 20-second presentation timeout dispose the partially attached session through the existing prepared-host cleanup. Compose's standalone player retains its immediate visibility.
- **Player preparation during resolution:** opening a stream builds a reusable Compose window alongside URL resolution. On Windows/Tauri its transparent, offscreen, non-focusable host starts the Compose renderer with a themed empty surface; media and native children attach only after resolution succeeds. Existing stream loading artwork, labels, controls and navigation remain unchanged. Cancelling or failing resolution disposes the prepared host, and `playback.stop` can interrupt a start without waiting for the bridge RPC mutex. The stream screen cancels pending starts on Back/Close or unmount, while successful navigation preserves playback. The native controls' existing app-launch warmup remains in use; mpv itself still needs the resolved source.
- **Rewrite keyboard focus:** Tauri's foreground events now reach the existing native-player focus handler. The transparent Compose lifecycle window cannot take keyboard focus, and focus restoration skips its offscreen Canvas. Windows controls restore native and DOM focus when their page finishes loading; delayed focus requests only apply while the player's visible root window is foreground. This covers first playback and Alt-Tab without requiring a click on the video.
- **Rewrite focus after navigation:** the native player also checks the foreground thread's actual focused HWND every 50 ms, independently of bridge RPCs. If Tauri's browsing WebView takes focus after handoff, focus returns to the controls WebView. Cross-thread input queues are temporarily attached when needed for the transfer. Native menus and controls already focused inside the player are preserved, and DOM restoration leaves text fields/panels focused. The existing 500 ms playback-state timer is unchanged.
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
  - In windowed mode the controls show while the pointer is over the player; in fullscreen they auto-hide
    after 2.5 s. While paused (with the pause overlay enabled) the idle auto-hide stays in charge of
    visibility so the metadata overlay can appear, instead of the controls immediately covering it again.
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

The React rewrite's Settings hold popup follows Kotlin `ProfilePopupContent`: responsive avatar grid (two columns for four tiles), active check badge, Add Profile tile, inline PIN verification and hold/drag selection. It uses the Kotlin 0.96-to-1 scale and fade timing (180 ms enter; 140 ms fade/160 ms scale exit), retaining the popup until dismissal completes. Positioning chooses above/below the Settings trigger with viewport clamping. Episode thumbnails show white progress bars using `WatchProgressRepository.progressForVideo`, excluding completed/watched entries, in both list and horizontal layouts. Stream discovery and debrid resolution use parent-title artwork rather than episode thumbnails, consistent with the native player's opening artwork.

- `scratch_debrid.diff` at the repo root is a leftover working diff (committed in `eee2644f`), not part of
  the app. Safe to delete.
- `StreamLoadTimeline` / `StreamLoadTimelineFile` and the `// STREAM-LOAD-TIMELINE` call sites are temporary
  instrumentation (§11).
- `PlayerControlsAction.KeyboardHoldSpeedStart/End` (and their mapping in `NativePlayerController`) are dead code
  since upstream's hold-to-speed replaced the fork's (§6). Remove them, or keep them to reduce merge friction.
- Several fork changes deliberately comment code out instead of deleting it (Trakt UI, debrid "Sort results",
  TV login) to keep upstream merges simple.

### Rewrite Downloads header controls

The Downloads header groups a compact **Open folder** button and an adjacent sliders icon for **Data saver preferences** at the right edge. The icon keeps an accessible label and hover title, and both controls retain their existing actions and touch targets.

### Rewrite fullscreen Escape shortcut

A root-level keyboard listener exits the Tauri window from fullscreen on Escape across all rewrite screens, including startup, profile selection, and dialogs. It checks the native window state before setting windowed mode and leaves existing control dismissal and Kotlin player shortcuts intact.

### Decoded stream artwork entrance

Stream selection and player-opening backgrounds and title logos now wait for image load and bitmap decode before rendering and fading in. Logo space stays reserved while loading, failed logos fall back to the title, obsolete requests are ignored, and reduced-motion mode skips the fade and title pulse.

### Premiumize connection without an OAuth client

The Kotlin Premiumize integration uses a generated `PremiumizeConfig.CLIENT_ID` from `PREMIUMIZE_CLIENT_ID` in `local.properties`; the fork now defaults to its registered public client ID `350574336`, including when an override is blank. This applies to Kotlin and rewrite builds, locally and in CI. The rewrite now keeps its password-masked API-key field and validated Kotlin save path available after device authorization fails, including missing-client builds. A **Find my API key** button opens the official Premiumize account page. No user credentials or borrowed application IDs are bundled.

Premiumize documents API-key Bearer authentication and device-code OAuth at https://www.premiumize.me/api. Other forks can register an app at https://www.premiumize.me/registerclient and override its client ID through `PREMIUMIZE_CLIENT_ID` in their local/CI properties. This fork’s public client ID is bundled by default; no CI secret update is required. An OAuth client secret is not needed for the existing device-code flow. Real account connection still requires user approval or a valid account API key.

The registered fork client was verified against Premiumize’s live device authorization endpoint: HTTP 200 with a device/user code pair, a five-second polling interval, and a ten-minute lifetime. Full account approval remains a user-driven test.

### Release notes after merging feature branches

Desktop CI falls back to the full commit range when first-parent release notes contain no eligible entries. This lets a release proceed after feature work arrives entirely through merges; the generated draft is still rewritten into user-facing notes before publishing.


## Desktop details cards and trailer categories (2026-10-24)

The React details collection and related-title rows reuse Home’s `HorizontalRail` and circular hover/focus arrows, hide horizontal scrollbars and omit poster three-dot buttons. Right-click and hold actions remain available. Poster frames explicitly clip to their configured rounded shape during hover transforms. The trailer category selector reuses `DropdownChip` with the `DetailTrailersSection.kt` trigger and `Menu.kt` popup styling, selected accent/checkmark and category video counts. This change targets the React/Tauri desktop app only.

Kids setup also disables TMDB cast enrichment (`tmdb_use_credits`) by default after copying another profile’s settings, writing the same preference to local profile storage and its synced settings. Later profile edits and key replacements preserve explicit cast choices. Android storage and common sync policy regression checks cover copied cast-on settings, parent isolation and preserving a later opt-in.

Validation: 72 focused desktop UI tests, 51 desktop Kotlin kids/TMDB/credential tests and 53 Android host tests passed. The React production assets, embedded Windows debug shell, staged Kotlin bridge and Android full debug APK built successfully.


## First-visit metadata enrichment and details overflow (2026-10-24)

Cold TMDB enrichment had a five-second budget, which could discard the result before all requests completed. The mobile details repository now follows the desktop progressive-load lifecycle: publish add-on metadata immediately, enrich in a cancellable per-title job, publish core TMDB data before MDBList/related-title processing, and fetch series episode enrichment afterward. Both clients allow 30 seconds for enrichment, leave expired attempts retryable, cancel obsolete work on title/profile changes, retain original add-on metadata for re-enrichment, and include module switches in the details cache fingerprint. The previously unused `includeEpisodes` switch now actually prevents season requests from blocking core details. Mobile's TMDB payload cache also distinguishes trailer, collection and recommendation switches.

React DetailsExtras previously fetched a one-time snapshot even though the Kotlin repository emits later enrichment updates. It now refreshes on details events without clearing the visible title or resetting the user's trailer category, and ignores late responses belonging to a previous title. Regression tests exercise all three behaviors.

Details rails now inherit their actual 27px content gutter (24px/20px at narrower widths), rather than Home's wider viewport gutter. This keeps both circular arrows inside the visible row and removes the cause of page-wide horizontal overflow. The vertical page scroller additionally clips horizontal overflow. Heading/subtitle and bottom padding are reduced; horizontal scrolling remains available inside each rail. A browser fixture using the built production CSS at 1280px confirmed equal page client/scroll widths, a fully visible 60px round arrow, working track scrolling and a 3.66px heading/subtitle gap.

Credential handling is unchanged. KidsScreen receives the personal TMDB key during provisioning; synced profiles carry its configuration ID, while direct TMDB enrichment reads device-local credentials. A server-side, account-authorized enrichment proxy on KidsScreen is the recommended follow-up for seamless new-device enrichment. No key was added to synced preference blobs, manifest URLs or shipped binaries.

Validation: 73 focused frontend tests (including three first-visit refresh/category/stale-response regressions), 69 desktop Kotlin tests and 75 Android host tests passed. Frontend assets, the staged Kotlin bridge, embedded Windows debug executable and Android full debug APK built successfully. The layout fixture is a geometry check; live TMDB/KidsScreen availability and credential provisioning on a second device remain external dependencies.


## Stable details during progressive enrichment (2026-10-24)

Desktop details retain the current title's decoded backdrop and logo while replacement TMDB artwork loads and decodes, including when a replacement fails. Title/profile changes cannot reuse another title's artwork. The details page and its backdrop remain mounted across metadata updates; skeletons and existing enrichment section ordering are retained. Frontend regressions cover pending decoding, failures, obsolete image completions, identity changes and keeping the page mounted.

The mobile kids visibility projection previously emitted an empty/loading state before every filtering pass, tearing down and recreating the details layout during each enrichment update. Details now opt into retaining only the last sanitized version of the same title while its update is verified. New titles, profiles, policies and denied/error states still clear before publishing verified data; other kids-visible consumers retain their existing behavior. The settings-refresh effect no longer keys itself to metadata arrival/loading, which had repeatedly re-requested the title and reset the layout. Phone/tablet artwork keeps its last loaded painter while enriched replacements load. Mobile flow regressions cover verified-content retention, policy/profile/title boundaries, cancelled responses and unchanged default consumer behavior.

The desktop Trailers section shows one loading card while its videos are pending. Other section skeleton counts are unchanged.

### Independent enrichment sections (2026-10-24)

Both apps publish core metadata while trailers, related titles and collection items load independently. Updates accumulate rather than replacing earlier successful sections, failed optional requests complete their loading state, and navigation cancellation prevents late updates. Disabled cast, artwork and details skip their dedicated requests; cache keys distinguish those options. Existing kids admission and related-title filtering remain in place. Regression tests cover delayed optional responses, empty selections, optional failures and cancellation.

The desktop player preparation overlay now places fullscreen to the left of close in one shared row, matching the player.

### Kids production defaults and duplicate certifications (2026-10-24)

Kids setup initializes both production-company and network enrichment off and synchronizes those choices without inheriting the parent's enabled options. Later explicit choices remain intact. Missing production preferences default off in kids profiles; existing saved preferences are preserved. Both apps normalize repeated slash-separated add-on certifications (such as `PG / PG / PG`) to unique labels at metadata parsing, without changing admission checks or discarding distinct ratings. Parser, shared-policy and Android profile-storage regressions cover the behavior.

### Saved kids key editor (2026-10-24)

Both profile editors display a Key saved row with a green check and Replace key action for configured kids profiles. The masked input is only displayed for new setup or explicit replacement; cancelling clears the draft without altering the saved key. Mobile saves only reconfigure KidsScreen when the kids toggle, rating or key changes, and use the current saved profile as the baseline. Tests cover ordinary edits without a local key, replacement/cancellation and changed policies.

Second-device rating edits now use the trusted KidsScreen `clone-owned` route when the original management token is absent. The service verifies the signed-in account references the enabled kids configuration before cloning its encrypted key, never returns that key, and keeps the original configuration for rollback. Custom endpoints never receive Nuvio session tokens. Client routing/allowlist tests and service owner/expired/unrelated/disabled-account tests cover this path.
