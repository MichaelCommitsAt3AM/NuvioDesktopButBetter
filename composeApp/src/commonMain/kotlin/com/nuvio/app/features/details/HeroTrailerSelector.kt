package com.nuvio.app.features.details

internal fun selectHeroTrailer(trailers: List<MetaTrailer>): MetaTrailer? =
    trailers
        .asSequence()
        .filter { it.isPlayableYouTubeTrailerCandidate() }
        .distinctBy { it.key }
        .maxWithOrNull(
            compareBy<MetaTrailer>(
                { it.heroTrailerPriority() },
                { it.publishedAt.orEmpty() },
                { it.size ?: 0 },
                { it.name },
            ),
        )

/**
 * Fork-only (React desktop details hero): same candidate set and type/official
 * priority as [selectHeroTrailer], but the earliest-published trailer wins a
 * tie, so the original "Official Trailer" beats later "Trailer 2" / international
 * cuts. Trailers without a publish date sort last. Within the same type, a name
 * that reads like a real trailer ("Official Trailer") beats one TMDB also tags
 * as a trailer but isn't ("Comic-Con First Look", "Soundtrack Remix").
 */
internal fun selectOriginalTrailer(trailers: List<MetaTrailer>): MetaTrailer? =
    trailers
        .asSequence()
        .filter { it.isPlayableYouTubeTrailerCandidate() }
        .distinctBy { it.key }
        .sortedWith(
            compareByDescending<MetaTrailer> { it.heroTrailerPriority() }
                .thenByDescending { it.trailerNameRank() }
                .then(originalTrailerFirst),
        )
        .firstOrNull()

private val nonTrailerNameMarkers = listOf(
    "first look", "comic-con", "comic con", "teaser", "remix", "soundtrack", "tv spot",
    "sneak peek", "featurette", "behind the scenes", "clip", "promo", "announcement", "recap",
    "reaction", "imax", "blitz", "dolby", "4dx", "screenx", "fan event", "interview", "music video",
)

/** 3: "Official Trailer", 2: "Trailer", 1: unremarkable, 0: special cut/promo. */
private fun MetaTrailer.trailerNameRank(): Int {
    val label = (displayName ?: name).lowercase()
    if (nonTrailerNameMarkers.any { it in label }) return 0
    return when {
        "official trailer" in label -> 3
        "trailer" in label -> 2
        else -> 1
    }
}

/** Oldest first; undated trailers last; name as the stable final tie-break. */
internal val originalTrailerFirst: Comparator<MetaTrailer> =
    compareBy<MetaTrailer>({ it.publishedAt.isNullOrBlank() }, { it.publishedAt.orEmpty() }, { it.name })

internal fun MetaTrailer.youtubePlaybackUrl(): String =
    key.takeIf { it.startsWith("http://") || it.startsWith("https://") }
        ?: "https://www.youtube.com/watch?v=$key"

private fun MetaTrailer.isPlayableYouTubeTrailerCandidate(): Boolean =
    key.isNotBlank() && site.equals("YouTube", ignoreCase = true)

private fun MetaTrailer.heroTrailerPriority(): Int {
    val isSeriesTrailer = seasonNumber != null
    val isTrailerType = type.equals("Trailer", ignoreCase = true)
    return when {
        !isSeriesTrailer && isTrailerType && official -> 70
        !isSeriesTrailer && isTrailerType -> 60
        !isSeriesTrailer && official -> 50
        !isSeriesTrailer -> 40
        isTrailerType && official -> 30
        isTrailerType -> 20
        official -> 10
        else -> 0
    }
}
