# Desktop UI migration checklist

Baseline: fork commit `4fe67b7b`. `desktop-bridge/contract/ui-inventory.json` records original UI source hashes, composables, action callbacks and referenced labels. Regenerate with `node scripts/desktop-ui/inventory-parity.mjs`; `--check` detects source changes after upstream merges. This inventory includes shared/mobile code and does not prove desktop reachability. Review platform conditions and `AppFeaturePolicy.desktop.kt` before assigning scope.

Live Home comparison evidence and remaining gaps are recorded in [DESKTOP_HOME_COMPARISON.md](DESKTOP_HOME_COMPARISON.md). Home remains partial.

Status: **pending** = not implemented; **partial** = real subset, remaining original behavior; **built** = compiled/connected, awaiting user acceptance; **accepted** = user verified. Build success alone never implies full parity.

| Area | Original behavior to account for | Status |
|---|---|---|
| Visual foundation | Color serialization, auth primary action, font/viewport scale, edge-to-edge rails, original tokens and poster sizing | built |
| Shared components | Buttons, fields, switches, chips, dropdowns, sliders, menus, tooltips, sheets/dialogs, skeletons and progress | built (native-select restyle and styled tooltips deferred) |
| Shell | Top/sidebar navigation, compact/expanded/adaptive behavior, glow/blur/jelly motion, focus/back/scroll state, window persistence | built |
| Auth | Sign-in/signup/guest, visibility/validation/legal, custom servers, capability-gated device login/session restoration | built |
| Profiles | Chooser, create/edit/delete, avatars/backgrounds, entitlement gating, PIN/lockout, addon sharing, remember profile | built |
| Home | Hero controls/motion/trailers where supported, shelf ordering/paging/view-all, posters/actions, collection rows, shuffle | built (hero trailer playback pending supported-platform runtime) |
| Continue Watching | Progress/resume/restart, Up Next/unaired rules, watched/removal actions, blur/thumbnail/style/sort preferences | built |
| Search | Results/cancellation/provider states, recent queries, clearing, discover/type/catalog/genre filters and remembered state | built |
| Catalog | Dedicated route, paging, grid, actions, retry, navigation/scroll restoration | built |
| Details | Artwork/metadata/ratings, play/manual/resume, save/watched/tracking, seasons/episodes, trailers, cast/crew/production/related | built |
| People/entities | Person biography/credits/cast transition, company/network browsing | built |
| Comments | Only original enabled provider-backed comments/detail sheets; preserve fork disabled gates | built |
| Shuffle | Watched inclusion, reroll, manual play, resume, launch context | partial |
| Saved Library | Sources/lists/manage dialogs, horizontal/vertical, type/section/sort filters, poster actions/fallback/errors | built |
| Cloud Library | Provider selection, browsing/search/refresh, file choice, playback | partial |
| Collections | Management screen matches Kotlin count/create/cards, empty state, clipboard export, validated import, confirmed delete and pointer/keyboard reorder. Editor, folder details and source pickers remain available. | built (editor/source-picker visual parity remains) |
| Streams | Source filtering, partial/reload/errors, rich badges/artwork, data saver, matching/order, autoplay/regex/scope/cache/downloads | built |
| Native player | Existing native/web controls, full source/episode/subtitle/audio panels, keyboard/touch, next/skip, progress/PiP/fullscreen | partial |
| P2P | Consent, torrent launch/context, stats/cache/options/teardown | partial |
| Downloads | Movie/show grouping, enqueue/file choice, live state, pause/resume/retry/delete/play, filters/subtitles/restart recovery | built |
| Settings root | Categories, nested navigation, settings search, original defaults/dependencies/persistence/scope | built |
| Appearance | Themes/AMOLED/custom editor/language/icons, navigation settings and all child pages | built |
| Poster/hover | Size/shape/labels/depth, previews/delay/trailer sound/start | built (inline playback pending supported-platform runtime) |
| Home/meta/CW preferences | Every original row and its actual effect on corresponding screen | built |
| Playback preferences | Gesture/hold/audio/subtitles/style/reuse/autoplay/engine/native/P2P settings, supported platform predicates | partial |
| Addons | Install/check/configure/toggle/refresh/reorder/remove/status feedback | partial |
| Plugins | All enabled desktop install/config/status/actions/order | partial |
| Integrations | TMDB/MDBList/debrid provider auth/API keys/preferences/connection state/resolver/cloud selection | partial |
| Tracking | Kotlin provider cards, inline auth/approval/cancel/copy, sync/confirmation/help, source pickers/fallback/refresh retry and anime preferences; Trakt auth stays disabled. Live account and visual acceptance pending. | built |
| Advanced/About | Remember profile/renderer/diagnostics/cache, membership/credits/privacy/licenses | built |
| Updates/delivery | Stable signed feed, progress/download/verified install/relaunch, bundled Java/native resources and rewrite CI for MSI/DMG/AppImage/DEB/RPM/Flatpak. Real installed-app upgrade/rollback and hosted builds still need acceptance. | built |
| OS integration | Deep links/single instance/foreground/native dialogs/icons/multi-monitor/window geometry | partial |
| Motion audit | Token timings, sidebar/jelly/profile/hero/poster/shared transitions/shimmer/reorder/removal/player panels/reduced motion | built (jelly/spring curves approximated with documented easings) |
| Localization | Generated locale catalogs, translated chrome/shared/settings, fallback/plurals/RTL, device first launch | built (feature-screen bodies remain English; see inventory) |
| Inline trailers | Hover trailer playback on supported desktop platforms via backend extraction; Windows stays external | built (macOS/Linux native playback runtime pending) |

## Acceptance gates for every applicable inventory entry

- Identify actual desktop-visible controls, conditional states and dialogs in the original source.
- Use Kotlin repositories for operations and persistence. No fake save controls or mock content.
- Preserve loading/empty/error/retry/cancel/confirmation and incremental results.
- Preserve profile isolation, entitlements, capability gates, existing defaults and ranges.
- Preserve keyboard/focus/right-click/back and provide touch equivalents for essential hover actions.
- Compare layout/motion/scroll restoration at small, normal, maximized and ultrawide windows.
- Record build checks and user acceptance separately.

## Platform exclusions to preserve

Current desktop policy disables OS notifications, account deletion, external-player preference, donation progress and personal-media addon copying. Device login is active-server capability gated. Trakt connection/sync controls are commented out in this fork. Windows trailers open externally and hero playback is disabled; supported other desktop platforms retain their original behavior. PiP is platform dependent. Android/iOS-only engine/native-tab/service controls are excluded.

## Implementation sequence

1. Foundation/checklist/shared primitives and color/layout/scaling fixes.
2. Feature adapters/contracts and native player integration.
3. Auth/server/profiles/navigation.
4. Home/search/discover/catalog.
5. Details/people/entities/watched/shuffle.
6. Library/cloud/collections.
7. Streams/P2P/full playback.
8. Downloads.
9. Remaining settings/integrations, with feature prerequisites implemented earlier.
10. Motion/platform/delivery audit and user-led acceptance.

## Current implementation checkpoint — 2026-10-10

Latest visual/navigation feedback: content scale increased by 22% independently of navigation; Discover cards fit adaptive columns; virtual-grid row sizing accounts for distributed card widths; Downloads moved into Library; the Settings item carries the active avatar and a hold-to-open profile menu; horizontal poster, Continue Watching, Up Next and collection rails have end arrows. Original references: `LibraryScreen.kt` LibraryDownloadsButton, `MainTabsDestination.kt` Settings item, and `ProfileSwitcherTab.kt` avatar/long-press behavior. Original drag-to-select profile gestures remain part of the broader gesture parity audit. Frontend compilation passed; visual acceptance remains user-led.

All areas marked partial now have actual connected implementations except motion/delivery items explicitly pending. No area is marked accepted until the user checks it. Details of implemented flows are in the migration guide.

Build checks: TypeScript/Vite production build; Kotlin desktop compile and staged runtime; canonical generated-contract drift check; original 155-file UI inventory check. The inventory normalizes the sole community repository visibility hook. Tauri debug compilation and startup observation are recorded separately below after they finish. No feature acceptance tests, profile mutations, account changes or playback journeys were performed by the agent.

Remaining priorities:

1. Complete conditional original layouts and navigation state; resume prompts/restart/last-link reads, home shuffle and provider list management.
2. Replace broad feature snapshot projections with canonical strict contracts and audit cancellation/profile boundaries of asynchronous feature dialogs.
3. Reproduce original transitions, embedded trailers on supported platforms, full poster hover behavior, and React translations.
4. Complete native player ownership/state synchronization and desktop deep-link/window persistence behavior.
5. Validate the implemented bundled Java/native delivery, rewrite CI packages and signed install/relaunch using actual Kotlin-to-rewrite and rewrite-to-rewrite updates. Flatpak keeps external update ownership.
6. User-led screen, touch, keyboard, playback and persistence acceptance across window sizes and platforms.

Desktop handoff: `cargo build --features custom-protocol` passed. The debug preview was launched. The initial webview stayed on its startup message; a reload during asset diagnostics displayed the saved-session home screen with hero artwork and Continue Watching cards. This startup/reload behavior still needs investigation before release. Diagnostics were closed and Nuvio was left foreground for the user. No sign-in, content mutation or playback acceptance journey was performed.

Visual-feedback build handoff: TypeScript/Vite and Tauri custom-protocol debug builds passed again. Startup observation caught and corrected the Settings profile-anchor positioning conflict and the content scroll viewport height. The startup stall remains intermittent; reload was needed on a subsequent launch. Only startup rendering was observed; profile switching, search results and arrow interaction acceptance are left to the user.

Home Layout settings now follow HomescreenSettingsPage.kt and SettingsComponents.kt: native copy/spacing, addon subtitles, expandable hero selection with its repository limit, scrollable catalog rows, display-name edits, pinned lock feedback, and drag/keyboard reordering through Kotlin. The bridge exposes pin and manifest status and publishes appearance changes on addon updates. Combined verification passed the frontend build, all 123 frontend tests and 13 Kotlin Home catalog tests. The desktop bridge JAR builds. The Android-host Home catalog repository tests are blocked by existing shared-UI desktop pointer API compilation errors. Visual verification is left to the user.

Follow-up: Home catalogs and Detail Page Sections share `ReorderableSettingsRow`, including native Menu handles, switch alignment, inset separators, and scroll bounds. Tab groups render below section summaries. Addon/collection observation now rebuilds catalog preferences and Home when manifests or cloud collections change, rather than relying on an explicit RPC. The frontend no longer repopulates an empty selected hero from unrelated shelves. Exact visual comparison to the user's Kotlin screenshot remains pending because the screenshot was not attached to this chat.

Playback follow-up: stepped sliders expose all selectable positions with tick dots and a vertical handle based on the supplied reference. Skip Segments follows `PlaybackSettingsPage.kt` and `AutoSkipSegmentSelectionDialog.kt`, including separate detection/automatic selection, native option descriptions, conditional credential dialogs, and the IntroDB verification/save/clear flow. Native playback continues to use the shared Kotlin player/settings runtime. Verification: 135 frontend tests, 11 selected Kotlin catalog/lifecycle/skip settings tests, TypeScript/Vite build, and desktop shell build pass. IntroDB verification tests inject results instead of contacting the real service. Screenshot-to-app visual comparison for Home/Detail Page remains unverified.


## Upstream 0.1.33 checkpoint — 2026-10-28

Native playback now includes embedded chapter navigation/timeline, stream information and upstream badge delivery. React Playback preferences expose the Kotlin chapter switch and profile-scoped external subtitle autosync controls (enable, thorough search and tolerance); the bridge initializes persistence and observes profile/preference changes. These additions are **built**, with automated behavior checks recorded in `UPSTREAM_SYNC_2026-10-28.md`. Real subtitle alignment/provider playback and cross-platform interactive acceptance remain pending. Existing partial areas above are not promoted by this source-inventory refresh.


### Continue Watching destructive motion — 2026-10-28

The enlarged-card ash effect now ports the Kotlin particle field, front and motion equations, with the same 1500 ms easing, menu fade, 300 ms scrim release and default placement spring. Real Chromium fixtures cover rendered card capture and popup lifetime across source removal. This is **built**; the updated embedded Windows debug app remains the user acceptance surface. Library removal is unchanged.
