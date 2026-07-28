package com.nuvio.app.features.downloads

import com.nuvio.app.features.streams.AddonStreamGroup
import com.nuvio.app.features.streams.StreamBadgeMatcher
import com.nuvio.app.features.streams.StreamItem
import kotlinx.serialization.Serializable

/**
 * Streams-page download filter mode.
 *
 * [BEST_QUALITY] is the default behaviour: every stream the addons returned is
 * shown, highest quality first. [DATA_SAVER] hides streams that exceed the
 * user-configured [DownloadFilterConfig] so the list only surfaces
 * download-friendly options (e.g. WEB-DL up to 1080p instead of 4K remuxes).
 */
enum class DownloadStreamFilterMode {
    BEST_QUALITY,
    DATA_SAVER,
}

/**
 * Coarse resolution tier detected from a stream's title/metadata. [rank] is used
 * for "at most" comparisons (higher rank = larger file / higher resolution).
 * [UNKNOWN] streams are never hidden by resolution so we don't accidentally
 * drop valid small files that simply lack a resolution tag.
 */
@Serializable
enum class StreamResolutionTier(val rank: Int) {
    SD(1),
    HD_720(2),
    FHD_1080(3),
    UHD_4K(4),
    UNKNOWN(0),
}

/**
 * Coarse source/file-type detected from a stream's title/metadata. Ordered from
 * largest/highest fidelity to smallest so that the classifier can pick the most
 * specific match. [UNKNOWN] streams are never hidden by source type.
 */
@Serializable
enum class StreamSourceType {
    REMUX,
    BLURAY,
    WEBDL,
    WEBRIP,
    HDTV,
    DVD,
    CAM,
    UNKNOWN,
}

/**
 * User-customisable "data saver" rules. A stream passes when its detected
 * resolution is at most [maxResolution], its detected source type is in
 * [allowedSources], and its detected file size is at most [maxSizeBytes].
 * Undetected resolution/source always pass; undetected size passes only when
 * [showUnknownSizeStreams] is enabled, since size is the primary signal users
 * rely on to gauge whether a download is "safe" and a silent unknown could
 * otherwise sneak through as a huge file.
 */
@Serializable
data class DownloadFilterConfig(
    val maxResolution: StreamResolutionTier = StreamResolutionTier.FHD_1080,
    val allowedSources: Set<StreamSourceType> = DEFAULT_ALLOWED_SOURCES,
    val maxSizeBytes: Long = DEFAULT_MAX_SIZE_BYTES,
    val showUnknownSizeStreams: Boolean = false,
) {
    fun allows(stream: StreamItem): Boolean {
        val resolution = StreamQualityClassifier.resolutionOf(stream)
        if (resolution != StreamResolutionTier.UNKNOWN && resolution.rank > maxResolution.rank) {
            return false
        }
        val source = StreamQualityClassifier.sourceTypeOf(stream)
        if (source != StreamSourceType.UNKNOWN && source !in allowedSources) {
            return false
        }
        val size = StreamQualityClassifier.sizeOf(stream)
        if (size == null) {
            if (!showUnknownSizeStreams) return false
        } else if (size > maxSizeBytes) {
            return false
        }
        return true
    }

    companion object {
        val DEFAULT_ALLOWED_SOURCES: Set<StreamSourceType> =
            setOf(StreamSourceType.WEBDL, StreamSourceType.WEBRIP)

        const val MIN_MAX_SIZE_BYTES: Long = 1L * 1024 * 1024 * 1024
        const val MAX_MAX_SIZE_BYTES: Long = 20L * 1024 * 1024 * 1024
        const val DEFAULT_MAX_SIZE_BYTES: Long = 8L * 1024 * 1024 * 1024

        val DEFAULT = DownloadFilterConfig()
    }
}

/**
 * Classifies a [StreamItem] into a resolution tier and source type by scanning
 * the same text candidates used for badge matching (filename, parsed metadata,
 * title, description, ...).
 */
object StreamQualityClassifier {
    fun resolutionOf(stream: StreamItem): StreamResolutionTier =
        resolutionOf(haystack(stream))

    fun sourceTypeOf(stream: StreamItem): StreamSourceType =
        sourceTypeOf(haystack(stream))

    /** Detected file size in bytes, or null if no addon reported one. */
    fun sizeOf(stream: StreamItem): Long? {
        val size = stream.behaviorHints.videoSize
            ?: stream.clientResolve?.stream?.raw?.size
            ?: stream.clientResolve?.stream?.raw?.folderSize
            ?: stream.debridCacheStatus?.cachedSize
        return size?.takeIf { it > 0L }
    }

    internal fun resolutionOf(text: String): StreamResolutionTier = when {
        Regex("(2160p|\\b4k\\b|\\buhd\\b|\\b4320p|8k\\b)").containsMatchIn(text) -> StreamResolutionTier.UHD_4K
        Regex("(1080p|1080i|\\bfhd\\b)").containsMatchIn(text) -> StreamResolutionTier.FHD_1080
        Regex("(720p|\\bhd\\b)").containsMatchIn(text) -> StreamResolutionTier.HD_720
        Regex("(576p|540p|480p|360p|240p|\\bsd\\b|dvdrip|dvdscr)").containsMatchIn(text) -> StreamResolutionTier.SD
        else -> StreamResolutionTier.UNKNOWN
    }

    internal fun sourceTypeOf(text: String): StreamSourceType = when {
        Regex("remux").containsMatchIn(text) -> StreamSourceType.REMUX
        Regex("(blu-?ray|bluray|\\bbdrip\\b|\\bbrrip\\b|\\bbd25\\b|\\bbd50\\b|\\bbdmv\\b)").containsMatchIn(text) -> StreamSourceType.BLURAY
        Regex("(web-?dl|web\\.dl|\\bwebdl\\b|\\bhdrip\\b)").containsMatchIn(text) -> StreamSourceType.WEBDL
        Regex("(web-?rip|\\bwebrip\\b|\\bweb\\b)").containsMatchIn(text) -> StreamSourceType.WEBRIP
        Regex("(hdtv|\\bpdtv\\b|\\bdvbrip\\b)").containsMatchIn(text) -> StreamSourceType.HDTV
        Regex("(dvdrip|dvdscr|\\bdvd\\b|\\bxvid\\b)").containsMatchIn(text) -> StreamSourceType.DVD
        Regex("(\\bcam\\b|hdcam|camrip|\\bts\\b|telesync|\\btc\\b|telecine)").containsMatchIn(text) -> StreamSourceType.CAM
        else -> StreamSourceType.UNKNOWN
    }

    private fun haystack(stream: StreamItem): String =
        StreamBadgeMatcher.badgeMatchCandidates(stream)
            .joinToString(separator = " ")
            .lowercase()
}

/** Result of applying a [DownloadFilterConfig] to the visible stream groups. */
data class DownloadFilterResult(
    val groups: List<AddonStreamGroup>,
    val hiddenCount: Int,
) {
    val hasHidden: Boolean get() = hiddenCount > 0
}

/** Removes streams that fall outside the configured data-saver limits. */
object DownloadStreamFilter {
    fun apply(
        groups: List<AddonStreamGroup>,
        config: DownloadFilterConfig,
    ): DownloadFilterResult {
        var hidden = 0
        val filtered = groups.map { group ->
            val kept = group.streams.filter { stream ->
                val keep = config.allows(stream)
                if (!keep) hidden++
                keep
            }
            group.copy(streams = kept)
        }
        return DownloadFilterResult(groups = filtered, hiddenCount = hidden)
    }
}
