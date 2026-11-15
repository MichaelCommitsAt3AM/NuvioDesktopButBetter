package com.nuvio.app.features.trailer

import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.sync.withPermit
import kotlin.time.Duration
import kotlin.time.Duration.Companion.minutes
import kotlin.time.TimeMark
import kotlin.time.TimeSource

actual object TrailerPlaybackResolver {
    private val extractor by lazy { InAppYouTubeExtractor() }
    private val cacheMutex = Mutex()
    private var playbackCache = emptyMap<String, CachedPlaybackSource>()
    private val webGuard = TrailerResolveGuard()
    private val webExtractionPermits = Semaphore(MaxConcurrentWebExtractions)

    actual suspend fun resolveFromYouTubeUrl(youtubeUrl: String): TrailerPlaybackSource? {
        if (youtubeUrl.isBlank()) return null
        cacheMutex.lock()
        try {
            playbackCache = playbackCache.filterValues { entry ->
                entry.cachedAt.elapsedNow() < PlaybackCacheTtl
            }
            playbackCache[youtubeUrl]?.let { cached ->
                TrailerExtractionPlatform.diagnostic(
                    "cache hit ageMs=${cached.cachedAt.elapsedNow().inWholeMilliseconds}",
                )
                return cached.source
            }
        } finally {
            cacheMutex.unlock()
        }

        val source = extractor.extractPlaybackSource(youtubeUrl)
        if (source != null) {
            cacheMutex.lock()
            try {
                playbackCache = playbackCache + (
                    youtubeUrl to CachedPlaybackSource(
                        source = source,
                        cachedAt = TimeSource.Monotonic.markNow(),
                    )
                )
            } finally {
                cacheMutex.unlock()
            }
        }
        return source
    }

    /** Fork-only: a source the React desktop UI's `<video>` can play (no HLS/AV1). Cached separately. */
    suspend fun resolveWebPlayableFromYouTubeUrl(youtubeUrl: String): TrailerPlaybackSource? {
        if (youtubeUrl.isBlank()) return null
        val key = "web:$youtubeUrl"
        // Cheap checks first, without taking a permit.
        when (val state = webLookup(key)) {
            is WebLookup.Cached -> return state.source
            WebLookup.Skip -> return null
            WebLookup.Miss -> Unit
        }
        // Only a couple of extractions run at once; a burst of title changes queues here
        // (and drops out if the caller was cancelled) instead of firing a request storm.
        return webExtractionPermits.withPermit {
            // Another caller may have resolved this title, or tripped the guard, while we waited.
            when (val state = webLookup(key)) {
                is WebLookup.Cached -> return@withPermit state.source
                WebLookup.Skip -> return@withPermit null
                WebLookup.Miss -> Unit
            }
            val source = extractor.extractWebPlayableSource(youtubeUrl)
            cacheMutex.withLock {
                when {
                    source == null -> webGuard.recordFailure(key)
                    source.isDegradedWebSource() -> {
                        webGuard.recordDegraded()
                        playbackCache = playbackCache + (
                            key to CachedPlaybackSource(source, TimeSource.Monotonic.markNow(), DegradedCacheTtl)
                        )
                    }
                    else -> {
                        webGuard.recordSuccess()
                        playbackCache = playbackCache + (
                            key to CachedPlaybackSource(source, TimeSource.Monotonic.markNow())
                        )
                    }
                }
            }
            source
        }
    }

    private suspend fun webLookup(key: String): WebLookup = cacheMutex.withLock {
        playbackCache = playbackCache.filterValues { entry -> entry.cachedAt.elapsedNow() < entry.ttl }
        val cached = playbackCache[key]
        when {
            cached != null -> WebLookup.Cached(cached.source)
            webGuard.shouldSkip(key) -> WebLookup.Skip
            else -> WebLookup.Miss
        }
    }

    private sealed interface WebLookup {
        data class Cached(val source: TrailerPlaybackSource) : WebLookup
        data object Skip : WebLookup
        data object Miss : WebLookup
    }

    actual suspend fun resolveSingleUrlFromYouTubeUrl(youtubeUrl: String): String? {
        if (youtubeUrl.isBlank()) return null
        return extractor.extractSingleUrl(youtubeUrl)
    }

    private data class CachedPlaybackSource(
        val source: TrailerPlaybackSource,
        val cachedAt: TimeMark,
        val ttl: Duration = PlaybackCacheTtl,    )
}

/**
 * The web-playable path only reaches the combined progressive stream (360p-class) when the
 * 1080p adaptive streams were missing or unreachable, which is what YouTube's bot checks
 * look like. Separate video and audio URLs mean the good path worked.
 */
internal fun TrailerPlaybackSource.isDegradedWebSource(): Boolean = audioUrl.isNullOrBlank()

private const val MaxConcurrentWebExtractions = 2
private val PlaybackCacheTtl = 10.minutes
// A degraded source still plays, but is retried soon so quality recovers once YouTube relaxes.
private val DegradedCacheTtl = 2.minutes
