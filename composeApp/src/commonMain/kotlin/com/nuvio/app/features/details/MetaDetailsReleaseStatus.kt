package com.nuvio.app.features.details

import com.nuvio.app.core.time.EpisodeReleaseDatePlatform
import com.nuvio.app.core.time.isEpisodeReleaseAired
import com.nuvio.app.core.time.parseEpisodeReleaseEpochMs

/** TMDB statuses for titles that have not come out yet (movies and series). */
private val preReleaseStatuses = setOf("planned", "rumored", "in production", "post production", "pilot")

private val releasedStatuses = setOf("released", "returning series", "ended", "canceled", "cancelled")

private val yearRegex = Regex("""\b(19|20)\d{2}\b""")

/**
 * Whether the details screen should mark this title as not out yet: `true` unreleased,
 * `false` released, `null` when the loaded data can't tell (only the current year, or nothing).
 *
 * Uses only data the details screen already loaded: an exact release date wins, then an
 * already-aired episode, then the TMDB/add-on status, then a full date or the year in
 * `releaseInfo`.
 */
internal fun MetaDetails.isUnreleased(
    todayIsoDate: String,
    nowEpochMs: Long = EpisodeReleaseDatePlatform.nowEpochMs(),
): Boolean? {
    isEpisodeReleaseAired(released, nowEpochMs)?.let { aired -> return !aired }

    if (videos.any { video -> isEpisodeReleaseAired(video.released, nowEpochMs) == true }) return false

    val normalizedStatus = status?.trim()?.lowercase()
    if (normalizedStatus in preReleaseStatuses) return true
    if (normalizedStatus in releasedStatuses) return false

    val info = releaseInfo?.trim()?.takeIf(String::isNotEmpty) ?: return null
    isEpisodeReleaseAired(info, nowEpochMs)?.let { aired -> return !aired }
    val releaseYear = yearRegex.find(info)?.value?.toIntOrNull() ?: return null
    val currentYear = todayIsoDate.take(4).toIntOrNull() ?: return null
    return when {
        releaseYear > currentYear -> true
        releaseYear < currentYear -> false
        else -> null
    }
}

/** What the details hero shows beside the age rating. */
enum class MetaReleaseState { UNRELEASED, IN_CINEMAS, RELEASED }

/** A film with a past cinema date but no known at-home date counts as available after this. */
internal const val CINEMA_ONLY_WINDOW_MS: Long = 120L * 24 * 60 * 60 * 1000

/**
 * The release state for the details hero, or `null` to show only the age rating.
 *
 * Shown only when TMDB details enrichment ran ([MetaDetails.tmdbReleaseWindow] is set). For
 * movies, TMDB's at-home date (digital, physical or TV) decides RELEASED; a past cinema date
 * without one is IN_CINEMAS, until [CINEMA_ONLY_WINDOW_MS] has passed with no at-home date
 * recorded. Series and movies without TMDB dates fall back to [isUnreleased].
 */
internal fun MetaDetails.releaseState(
    todayIsoDate: String,
    nowEpochMs: Long = EpisodeReleaseDatePlatform.nowEpochMs(),
): MetaReleaseState? {
    val window = tmdbReleaseWindow ?: return null
    val isMovie = type.trim().lowercase() == "movie"
    if (isMovie && (window.theatrical != null || window.digital != null)) {
        val atHomeAired = isEpisodeReleaseAired(window.digital, nowEpochMs)
        if (atHomeAired == true) return MetaReleaseState.RELEASED
        val cinemaDate = window.theatrical ?: released
        val cinemaEpochMs = parseEpisodeReleaseEpochMs(cinemaDate)
        if (cinemaEpochMs != null && cinemaEpochMs <= nowEpochMs) {
            return if (atHomeAired == false || nowEpochMs - cinemaEpochMs < CINEMA_ONLY_WINDOW_MS) {
                MetaReleaseState.IN_CINEMAS
            } else {
                MetaReleaseState.RELEASED
            }
        }
        if (cinemaEpochMs != null || atHomeAired == false) return MetaReleaseState.UNRELEASED
    }
    return when (isUnreleased(todayIsoDate, nowEpochMs)) {
        true -> MetaReleaseState.UNRELEASED
        false -> MetaReleaseState.RELEASED
        null -> null
    }
}
