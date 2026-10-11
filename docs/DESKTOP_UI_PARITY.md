# Desktop UI migration checklist

Baseline: fork commit `4fe67b7b`. `desktop-bridge/contract/ui-inventory.json` records original UI source hashes, composables, action callbacks and referenced labels. Regenerate with `node scripts/desktop-ui/inventory-parity.mjs`; `--check` detects source changes after upstream merges. This inventory includes shared/mobile code and does not prove desktop reachability. Review platform conditions and `AppFeaturePolicy.desktop.kt` before assigning scope.

Live Home comparison evidence and remaining gaps are recorded in [DESKTOP_HOME_COMPARISON.md](DESKTOP_HOME_COMPARISON.md). Home remains partial.

Status: **pending** = not implemented; **partial** = real subset, remaining original behavior; **built** = compiled/connected, awaiting user acceptance; **accepted** = user verified. Build success alone never implies full parity.

| Area | Original behavior to account for | Status |
|---|---|---|
| Visual foundation | Color serialization, auth primary action, font/viewport scale, edge-to-edge rails, original tokens and poster sizing | partial |
| Shared components | Buttons, fields, switches, chips, dropdowns, sliders, menus, tooltips, sheets/dialogs, skeletons and progress | partial |
| Shell | Top/sidebar navigation, compact/expanded/adaptive behavior, glow/blur/jelly motion, focus/back/scroll state, window persistence | partial |
| Auth | Sign-in/signup/guest, visibility/validation/legal, custom servers, capability-gated device login/session restoration | partial |
| Profiles | Chooser, create/edit/delete, avatars/backgrounds, entitlement gating, PIN/lockout, addon sharing, remember profile | partial |
| Home | Hero controls/motion/trailers where supported, shelf ordering/paging/view-all, posters/actions, collection rows, shuffle | partial |
| Continue Watching | Progress/resume/restart, Up Next/unaired rules, watched/removal actions, blur/thumbnail/style/sort preferences | partial |
| Search | Results/cancellation/provider states, recent queries, clearing, discover/type/catalog/genre filters and remembered state | partial |
| Catalog | Dedicated route, paging, grid, actions, retry, navigation/scroll restoration | partial |
| Details | Artwork/metadata/ratings, play/manual/resume, save/watched/tracking, seasons/episodes, trailers, cast/crew/production/related | partial |
| People/entities | Person biography/credits/cast transition, company/network browsing | partial |
| Comments | Only original enabled provider-backed comments/detail sheets; preserve fork disabled gates | partial |
| Shuffle | Watched inclusion, reroll, manual play, resume, launch context | partial |
| Saved Library | Sources/lists/manage dialogs, horizontal/vertical, type/section/sort filters, poster actions/fallback/errors | partial |
| Cloud Library | Provider selection, browsing/search/refresh, file choice, playback | partial |
| Collections | Manage/create/edit/delete/reorder, folder details, catalog/source pickers, artwork/layout/visibility and cancellation | partial |
| Streams | Source filtering, partial/reload/errors, rich badges/artwork, data saver, matching/order, autoplay/regex/scope/cache/downloads | partial |
| Native player | Existing native/web controls, full source/episode/subtitle/audio panels, keyboard/touch, next/skip, progress/PiP/fullscreen | partial |
| P2P | Consent, torrent launch/context, stats/cache/options/teardown | partial |
| Downloads | Movie/show grouping, enqueue/file choice, live state, pause/resume/retry/delete/play, filters/subtitles/restart recovery | partial |
| Settings root | Categories, nested navigation, settings search, original defaults/dependencies/persistence/scope | partial |
| Appearance | Themes/AMOLED/custom editor/language/icons, navigation settings and all child pages | partial |
| Poster/hover | Size/shape/labels/depth, previews/delay/trailer sound/start | partial |
| Home/meta/CW preferences | Every original row and its actual effect on corresponding screen | partial |
| Playback preferences | Gesture/hold/audio/subtitles/style/reuse/autoplay/engine/native/P2P settings, supported platform predicates | partial |
| Addons | Install/check/configure/toggle/refresh/reorder/remove/status feedback | partial |
| Plugins | All enabled desktop install/config/status/actions/order | partial |
| Integrations | TMDB/MDBList/debrid provider auth/API keys/preferences/connection state/resolver/cloud selection | partial |
| Tracking | Currently enabled providers/sources/sync/fallback/anime preferences; Trakt auth stays disabled in this fork | partial |
| Advanced/About | Remember profile/renderer/diagnostics/cache, membership/credits/privacy/licenses | partial |
| Updates/delivery | Channel/check/install/relaunch, bundled Java/native resources, CI installers/upgrade compatibility | pending |
| OS integration | Deep links/single instance/foreground/native dialogs/icons/multi-monitor/window geometry | partial |
| Motion audit | Token timings, sidebar/jelly/profile/hero/poster/shared transitions/shimmer/reorder/removal/player panels/reduced motion | pending |

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
5. Prepare bundled Java/native delivery, CI installers and Tauri-compatible update install/relaunch. Do not invoke the Compose installer from the preview.
6. User-led screen, touch, keyboard, playback and persistence acceptance across window sizes and platforms.

Desktop handoff: `cargo build --features custom-protocol` passed. The debug preview was launched. The initial webview stayed on its startup message; a reload during asset diagnostics displayed the saved-session home screen with hero artwork and Continue Watching cards. This startup/reload behavior still needs investigation before release. Diagnostics were closed and Nuvio was left foreground for the user. No sign-in, content mutation or playback acceptance journey was performed.

Visual-feedback build handoff: TypeScript/Vite and Tauri custom-protocol debug builds passed again. Startup observation caught and corrected the Settings profile-anchor positioning conflict and the content scroll viewport height. The startup stall remains intermittent; reload was needed on a subsequent launch. Only startup rendering was observed; profile switching, search results and arrow interaction acceptance are left to the user.
