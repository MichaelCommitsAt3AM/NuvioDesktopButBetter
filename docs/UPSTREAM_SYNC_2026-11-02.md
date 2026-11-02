# Upstream 0.1.34-alpha integration (in progress)

- Previous upstream: `5f99fb4dba1ee43258977abacde7703a27e941fa`
- Target: `1a600da8314fea54a8aa36a9998fd8fcd66132ec` (0.1.34-alpha)
- Rewrite base: `fc4c6cff78b5e065f4b11df6df1577148c08d672`
- Merge checkpoint: `d76be0eeccae5ad2a29dd3c838e70f5c1e4c847c` on `codex/sync-upstream-0.1.34-2026-11-02`.

This batch is not yet approved for promotion. Review, final-candidate local validation, CI database and all-platform build-only jobs, and affected playback journeys remain required.

Conflict decisions: preserve the fork desktop version; Vietnamese was unchanged by the fork after line-ending normalization, so the upstream translations were retained. Retain explicit subtitle-off handling while using upstream selection keys and auto-sync; retain the disabled Trakt entry. Upstream moved appearance and playback settings into separate files; retain that structure and avoid duplicate old definitions. Preserve both fork incomplete-metadata retry state and upstream metadata/persistence state. An automatic settings-search merge retained an obsolete icon argument and was corrected.

Work in progress includes upstream subtitle styling in the native player and rewrite settings, preferred subtitle re-evaluation when embedded or add-on tracks arrive late, upstream watch-progress persistence reconciliation, chapter scene handling and locale updates. Selection preserves explicit user choices. Desktop settings retain imported font selection when unrelated style settings are saved. Watch-progress writes track completion by profile to avoid losing one profile's pending write when another profile's write finishes first.

Checks so far: RPC contract tests and scanner passed; frontend suite passed (94 files, 574 tests) before the final settings controls; focused playback settings tests and production build passed after them; Rust formatting and 11 tests passed; embedded shell built before the final runtime was staged; launcher/release tests passed (10, one explicit skip). An initial desktop suite compiled after fixing settings search but failed two upstream chapter scene assertions and one host-dependent settings assertion; fixes are being retested. Android host subtitle selection and restore tests passed in the mobile repository. These checks do not constitute live playback or cross-platform acceptance.

The subsequent full Windows desktop run passed: 293 suites, 1,950 tests, no failures and one platform skip. The staged bridge runtime was rebuilt after the source changes. CI and interactive playback acceptance remain pending.
