package com.nuvio.app.features.trailer

import kotlinx.coroutines.sync.Mutex
import kotlin.time.Duration.Companion.minutes
import kotlin.time.TimeMark
import kotlin.time.TimeSource

actual object TrailerPlaybackResolver {
    private val extractor by lazy { InAppYouTubeExtractor() }
    private val cacheMutex = Mutex()
    private var playbackCache = emptyMap<String, CachedPlaybackSource>()

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
        cacheMutex.lock()
        try {
            playbackCache = playbackCache.filterValues { entry -> entry.cachedAt.elapsedNow() < PlaybackCacheTtl }
            playbackCache[key]?.let { return it.source }
        } finally {
            cacheMutex.unlock()
        }
        val source = extractor.extractWebPlayableSource(youtubeUrl) ?: return null
        cacheMutex.lock()
        try {
            playbackCache = playbackCache + (key to CachedPlaybackSource(source, TimeSource.Monotonic.markNow()))
        } finally {
            cacheMutex.unlock()
        }
        return source
    }

    actual suspend fun resolveSingleUrlFromYouTubeUrl(youtubeUrl: String): String? {
        if (youtubeUrl.isBlank()) return null
        return extractor.extractSingleUrl(youtubeUrl)
    }

    private data class CachedPlaybackSource(
        val source: TrailerPlaybackSource,
        val cachedAt: TimeMark,
    )
}

private val PlaybackCacheTtl = 10.minutes
