# Nuvio Desktop performance audit

Date: 7 October 2026. Focus: faster browsing and less CPU, allocation, and disk activity while running.

This audit inspected the desktop startup, image pipeline, collection animations, home/search catalog loading, downloads, native player polling, storage, and diagnostics. It includes implemented fixes and automated regression checks. It does not include before/after application FPS, idle CPU, working set, or cold-start measurements; the improvements below describe verified reductions in work and scheduling delays, rather than a measured overall speedup.

## Changes implemented

| Issue | Change | Expected user impact | Evidence |
| --- | --- | --- | --- |
| Every desktop download read (up to 8 KB) called into `DownloadsRepository.mutateItem`, which published state, serialized the complete download list, and synchronously rewrote the desktop preference file. | Progress callbacks now run at most once per 250 ms during copying, plus the initial and exact final byte counts. | Less disk traffic, list allocation, serialization, and UI invalidation during downloads. | A deterministic 2 MB transfer with 256 chunks now emits 3 callbacks instead of the previous 257. Copied bytes, resumed byte counts, and unknown-length final progress are verified. |
| Home loading used four-request batches and waited for every request before starting the next batch or publishing ready results. | Four fetches remain active as slots free up. The first usable shelf is published immediately; subsequent updates are coalesced every eight completions and at the end. | Faster first content and less waiting behind a slow addon. Section display order remains driven by preferences. | A test holds the first catalog indefinitely while the other five finish. A separate test verifies a four-fetch concurrency limit and worker cancellation. |
| Each visible collection card prefetched its animation even when a static cover was available and the user had not hovered it. | Animation loading starts when it will play; static covers continue to load through Coil. Existing animation caches remain available for later hovers. | Less background network/decode work and fewer retained codecs while browsing collections. | All three existing hover tests now pass for GIF, animated WebP, and extensionless animation URLs. They verify no animation request before hover, playback, and restoration of the cover on exit. |
| Static GIF decoding left `Data`, `Codec`, and temporary `Canvas` native objects to garbage collection. The general image decoder read the complete response before enforcing its 20 MB limit. | Static GIF temporary native objects close deterministically, failed output bitmaps close, and both static decoders bound encoded reads before accepting the response. GIF source dimensions are limited to 4096 px per side before pixel allocation. | Lower transient native resource retention and bounded decoder input allocations for oversized artwork. | Tests verify normal input is unchanged, an indefinitely large stream is rejected after roughly 20 MB, and a decoded GIF remains accessible after its codec closes. |

The first hover of an uncached animation now pays its fetch/decode latency. The static cover remains visible during that load. Cards without static covers retain their existing always-animate behavior. Home scheduling lives in shared code, so Android/iOS home loading also receives that scheduling change; only the desktop/JVM target was executed here.

## Validation

- Baseline `:composeApp:desktopTest --offline`: 1,408 tests, 7 failures, 1 skipped.
- After changes: 1,415 tests, 4 failures, 1 skipped (1,410 passed).
- Targeted performance regression suite: 10 tests, all passed.
- `git diff --check`: passed.

The three baseline `CollectionCardRemoteImageTest` failures were resolved by avoiding eager animation loads. The four remaining failures were present before these changes:

- `HomeHeroSectionTest`: desktop hero full-bleed layout assertion.
- `LinuxUpdateInstallTest`: package handler, unknown AppImage path, and AppImage replacement assertions.

The targeted suite selects `HomeCatalogLoadingTest`, `DesktopDownloadProgressTest`, `BoundedImageSourceTest`, `SkiaGifDecoderTest`, and `CollectionCardRemoteImageTest`. Tests use deterministic clocks/gates or a local test HTTP server, not external media providers.

## Further opportunities, in priority order

These are source-backed risks to measure next, not established causes of current application-wide slowness.

1. **Move collection animation frame decoding off the Compose thread.** `CollectionCardRemoteImage.desktop.kt` still calls `codec.readPixels` and downscales each animated frame inside `LaunchedEffect`, whose default context is the UI thread. Large hover animations can compete with rendering. Use an owned worker buffer and a safe handoff to the displayed frame; a background thread must not mutate a bitmap while Compose draws it. Also make codec eviction respect active consumers before expanding this path.
2. **Bound search requests and cancel abandoned fetches.** `SearchRepository.kt` launches one job per searchable catalog. `CatalogData.kt` deduplicates HTTP fetches in a separate long-lived scope, so cancelling an old query does not cancel its underlying HTTP requests. Many catalogs and rapid typing can leave irrelevant requests competing with the current query. Add a request budget and subscriber-aware cancellation while preserving useful request deduplication.
3. **Batch routine diagnostics and preference persistence.** `DesktopDiagnostics.record` synchronously creates/checks the directory, checks log size, opens, appends, and closes the log under one lock. `KermitFileLogWriter` sends Info-and-higher logs through it during browsing until player attachment disables that writer. `DesktopStorage.Store.persist` similarly rewrites a properties file on the caller thread. Keep synchronous crash breadcrumbs, but consider a bounded writer queue for ordinary logs and coalesced preference updates where profiling shows UI-thread writes.
4. **Measure actual image cache occupancy before reducing its budget.** `DesktopImageCacheConfig` permits 128–320 MiB of native bitmap cache (192 MiB fallback), based on physical RAM. This is a maximum budget, not a measured allocation or total process memory. Lowering it blindly may make repeat browsing slower through decode and texture-upload churn. Compare occupancy/hit rate and process private bytes over a repeatable browsing session first.

## Runtime measurement recipe

Use the same machine, renderer, window size, addon configuration, and content for both revisions. Separate cold and warm-cache runs. Repeat at least three times and compare medians for:

- Startup to first window composition and first usable home shelf.
- A repeatable shelf scroll: frame interval p50/p95/p99, and image fetch/decode timing.
- Idle home and collection screens for 60 seconds: process CPU, private bytes, working set, and disk writes.
- A local fixed-size download: throughput and preference-file write count.
- Repeated animation hovers and exits: frame intervals and native memory retention.

Existing image/frame telemetry can be enabled for a deliberate source-run measurement:

```powershell
.\gradlew.bat :composeApp:run -Pnuvio.desktop.imageTelemetry=true -Pnuvio.desktop.frameTelemetry=true
```

Disable frame telemetry for idle CPU measurements: its continuous frame callbacks create their own workload. Startup phase breadcrumbs already exist in `Main.kt`. Use a JVM allocation/CPU recording alongside OS process memory metrics because the bitmap cache and native player allocate outside the Java heap. Playback should be measured separately from browsing so decoder/video workload does not obscure UI improvements.

No releases, packages, commits, or dependency changes were created by this audit.
