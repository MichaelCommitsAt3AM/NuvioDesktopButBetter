# Upstream 0.1.34-alpha integration

- Previous upstream: `5f99fb4dba1ee43258977abacde7703a27e941fa`
- Target: `1a600da8314fea54a8aa36a9998fd8fcd66132ec` (0.1.34-alpha)
- Rewrite base: `fc4c6cff78b5e065f4b11df6df1577148c08d672`
- Merge checkpoint: `d76be0eeccae5ad2a29dd3c838e70f5c1e4c847c` on `codex/sync-upstream-0.1.34-2026-11-02`.

The integration candidate passed the local automated checks and the CI database and all-platform build-only matrix. The exact reported provider stream and interactive acceptance remain unverified as detailed below.

Conflict decisions: preserve the fork desktop version; Vietnamese was unchanged by the fork after line-ending normalization, so the upstream translations were retained. Retain explicit subtitle-off handling while using upstream selection keys and auto-sync; retain the disabled Trakt entry. Upstream moved appearance and playback settings into separate files; retain that structure and avoid duplicate old definitions. Preserve both fork incomplete-metadata retry state and upstream metadata/persistence state. An automatic settings-search merge retained an obsolete icon argument and was corrected.

This integration includes upstream subtitle styling in the native player and rewrite settings, preferred subtitle re-evaluation when embedded or add-on tracks arrive late, upstream watch-progress persistence reconciliation, chapter scene handling and locale updates. Selection preserves explicit user choices. Desktop settings retain imported font selection when unrelated style settings are saved. Watch-progress writes track completion by profile to avoid losing one profile's pending write when another profile's write finishes first.

Checks so far: RPC contract tests and scanner passed; frontend suite passed (94 files, 574 tests) before the final settings controls; focused playback settings tests and production build passed after them; Rust formatting and 11 tests passed; embedded shell built before the final runtime was staged; launcher/release tests passed (10, one explicit skip). An initial desktop suite compiled after fixing settings search but failed two upstream chapter scene assertions and one host-dependent settings assertion; fixes are being retested. Android host subtitle selection and restore tests passed in the mobile repository. These checks do not constitute live playback or cross-platform acceptance.

The subsequent full Windows desktop run passed: 293 suites, 1,950 tests, no failures and one platform skip. The staged bridge runtime was rebuilt after the source changes. Interactive playback acceptance remains pending.

Parity review also identified the episode availability indicator and localized generic episode titles; the rewrite now renders both. The focused episode suite passed 15 tests and the production frontend build passed. Database checks passed for candidate 5ea792d1d96ee1abf468c3cfc5e4947982e3514f; the build-only matrix was canceled because the episode UI changed, and must be rerun for the new candidate.

## Behavior decisions

- **Implemented:** native mpv subtitle styles, fonts and shadow, forced-track language matching, manual track persistence, subtitle auto-sync feedback, numeric locale setup, and chapter skip merging. Player controls continue to use the shared Kotlin runtime and native player resources. The rewrite playback settings exposes built-in font, radius and shadow controls; native player controls also expose imported fonts. The bridge retains appearance when another style setting is changed.
- **Implemented:** the fork's subtitle automatic selection retries after late tracks and add-ons while protecting an explicit choice. A saved per-title manual choice retains precedence over the global preference, as before.
- **Implemented:** shared watch-progress queued persistence and bounded metadata enrichment with per-profile write ordering, plus server progress queue changes. Fork metadata retry state is retained.
- **Implemented:** React episode cards display upstream's unavailable/unaired indicator and localize generic episode titles. Existing episode actions remain available. Player badge and matching changes remain in shared Kotlin.
- **Already covered:** rewrite settings keep their own navigation and expose the existing Kotlin settings. Upstream Compose settings reorganization is retained as reference; desktop remains React/Tauri. The fork's Linux Flatpak packaging and Java preferences configuration remain in the release pipeline.
- **Reference/mobile-only:** Android engine choice/failover, ExoPlayer buffering and rendering, and iOS-specific changes are retained from upstream but not built in the desktop tree. Translations are regenerated. Desktop version code remains the fork's and no release bump is part of this sync.

Local final frontend suite: 94 files, 575 tests passed. The final Windows embedded shell was built with custom protocol. Android host `PlayerSubtitleRestoreTest` passed 10 cases in the mobile repository. Results use synthetic tracks and do not reproduce the user's particular stream or demonstrate a provider subtitle download. The Supabase checks passed on the final application candidate: [run 41509604215](https://github.com/MichaelCommitsAt3AM/NuvioDesktopButBetter/actions/runs/41509604215). Cross-platform package build: [run 41509561515](https://github.com/MichaelCommitsAt3AM/NuvioDesktopButBetter/actions/runs/41509561515), passed all seven platform jobs on candidate `97987ef1c2283b2c7c807104cbc1117c02d5e746`. Real provider sign-in, exact reported media, Android device playback, macOS/Linux playback, visual acceptance and installed upgrades have not been exercised.

The Windows desktop suite included native JNI/mpv/WebView2 presentation playback tests. The automated subtitle journey uses controlled tracks and add-on results; it does not establish that the exact stream from the report is fixed. No release was published.
