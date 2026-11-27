package com.nuvio.app.features.downloads

import com.nuvio.app.features.debrid.DirectDebridPlaybackResolver
import com.nuvio.app.features.details.MetaDetails
import com.nuvio.app.features.details.MetaDetailsRepository
import com.nuvio.app.features.streams.StreamItem
import com.nuvio.app.features.streams.StreamsRepository
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withTimeoutOrNull

/** Result of looking up download choices for a title, ready for the details-screen Download picker. */
data class QualityDownloadOptions(
    val meta: MetaDetails,
    val videoId: String,
    val options: List<QualityDownloadOption>,
    /**
     * How many real streams the add-ons returned (see [DownloadQualityOptionsLoader.countSources]),
     * so the UI can tell "nothing found" from "nothing fits".
     */
    val loadedStreams: Int,
    val runtimeKnown: Boolean,
    /** Every downloadable stream found, so a compatible one can replace an unplayable Dolby Vision pick. */
    val streams: List<StreamItem> = emptyList(),
    /** The title's runtime, for the bitrate limits; null when unknown. */
    val runtimeSeconds: Long? = null,
)

/**
 * Shared by the desktop and mobile Download buttons: searches the title's streams, then
 * lets [DownloadQualityPicker] choose the best one per quality within the user's
 * [DownloadFilterConfig]. UI layers only render the options and enqueue the chosen stream.
 */
object DownloadQualityOptionsLoader {
    const val STREAM_SEARCH_TIMEOUT_MS: Long = 30_000

    /**
     * The entries that are actually streams. One that only links to a web page is not: add-ons
     * send their notices that way, e.g. AIOStreams' "Digital Release Filter" and error cards.
     */
    internal fun countSources(streams: List<StreamItem>): Int = streams.count { !it.shouldOpenExternally }

    /**
     * @param videoId the movie id, or the episode video id for a series.
     * @throws IllegalStateException when the title's details cannot be loaded.
     */
    suspend fun load(type: String, id: String, videoId: String = id): QualityDownloadOptions {
        val meta = MetaDetailsRepository.peek(type, id)
            ?: MetaDetailsRepository.fetch(type, id)
            ?: error("Title details are unavailable")
        val video = meta.videos.firstOrNull { it.id == videoId }
        val token = StreamsRepository.requestToken(type, videoId, video?.season, video?.episode, true)
        // Manual mode so no autoplay decision is made; this search only feeds the download menu.
        StreamsRepository.reload(
            type, videoId, id, video?.season, video?.episode,
            manualSelection = true,
            contentTitle = meta.name,
        )
        val state = withTimeoutOrNull(STREAM_SEARCH_TIMEOUT_MS) {
            StreamsRepository.uiState.first { current ->
                current.requestToken == token && !current.isAnyLoading && current.groups.none { it.isLoading }
            }
        } ?: StreamsRepository.uiState.value
        val runtime = DownloadRuntimeResolver.runtimeSeconds(meta, videoId)
        val streams = state.groups.flatMap { it.streams }
        val isDownloadable: (StreamItem) -> Boolean = {
            it.playableDirectUrl != null || DirectDebridPlaybackResolver.shouldResolveToPlayableStream(it)
        }
        val options = DownloadQualityPicker.pick(streams, DownloadFilterSettingsRepository.snapshot(), runtime, isDownloadable)
        return QualityDownloadOptions(
            meta = meta,
            videoId = videoId,
            options = options,
            loadedStreams = countSources(streams),
            runtimeKnown = runtime != null,
            streams = streams.filter(isDownloadable),
            runtimeSeconds = runtime,
        )
    }
}
