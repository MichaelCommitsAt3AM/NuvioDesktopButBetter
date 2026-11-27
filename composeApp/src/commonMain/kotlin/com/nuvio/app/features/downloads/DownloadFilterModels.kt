package com.nuvio.app.features.downloads

import com.nuvio.app.features.details.MetaDetails
import com.nuvio.app.features.details.parseRuntimeMinutes
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
 * Video codec detected from a stream's title/metadata. HEVC and AV1 reach the
 * same visual quality as AVC at a much lower bitrate, so the bitrate ceiling is
 * scaled by codec (see [bitrateFactor]). [UNKNOWN] is treated like AVC, i.e. the
 * strictest (unscaled) ceiling.
 */
@Serializable
enum class StreamCodec(val bitrateFactor: Double) {
    AVC(1.0),
    HEVC(0.6),
    AV1(0.5),
    UNKNOWN(1.0),
}

/**
 * User-customisable "data saver" rules. A stream passes when its detected
 * resolution is at most [maxResolution], its detected source type is in
 * [allowedSources], its detected file size is at most [maxSizeBytes] and, when
 * [bitrateLimitEnabled] is on and the title runtime is known, its average
 * bitrate (size / runtime) is within the [maxBitrateKbps] ceiling.
 *
 * [maxBitrateKbps] is the ceiling for a 1080p AVC stream (Netflix streams 1080p
 * at roughly 5-6 Mbps). It is scaled by resolution tier ([resolutionBitrateFactor])
 * and, when [scaleBitrateByCodec] is on, by codec. The bitrate check needs a
 * runtime, so when none is known only the size cap applies.
 *
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
    val bitrateLimitEnabled: Boolean = true,
    val maxBitrateKbps: Int = DEFAULT_MAX_BITRATE_KBPS,
    val scaleBitrateByCodec: Boolean = true,
    /**
     * Bitrate limits the user set for 4K, 720p or SD. A resolution without one scales from
     * [maxBitrateKbps] (the 1080p limit) by [resolutionBitrateFactor], as before there were rows.
     */
    val bitrateOverridesKbps: Map<StreamResolutionTier, Int> = emptyMap(),
    /** The data use level last chosen for the bitrate limits (see [dataUsePreset]). */
    val dataUse: DataUsePreset = DataUsePreset.BALANCED,
) {
    /** The level the current limits match; Custom when they were set per resolution. */
    fun dataUsePreset(): DataUsePreset = effectivePreset(dataUse, ::tierBitrateKbps, ::defaultTierBitrateKbps)

    /**
     * Every resolution's limit set to [preset]'s level. Custom starts from the Balanced limits,
     * unless the limits are already Custom, which are kept.
     */
    fun withDataUse(preset: DataUsePreset): DownloadFilterConfig {
        if (preset == DataUsePreset.CUSTOM) {
            val start = if (dataUsePreset() == preset) this else withDataUse(DataUsePreset.BALANCED)
            return start.copy(dataUse = preset)
        }
        return copy(
            dataUse = preset,
            maxBitrateKbps = preset.scale(defaultTierBitrateKbps(StreamResolutionTier.FHD_1080)),
            bitrateOverridesKbps = presetTiers
                .filter { it != StreamResolutionTier.FHD_1080 }
                .associateWith { preset.scale(defaultTierBitrateKbps(it)) },
        )
    }

    /** The H.264 bitrate limit for [tier], before the HEVC / AV1 allowance. */
    fun tierBitrateKbps(tier: StreamResolutionTier): Int = when (tier) {
        StreamResolutionTier.FHD_1080, StreamResolutionTier.UNKNOWN -> maxBitrateKbps
        else -> bitrateOverridesKbps[tier] ?: (maxBitrateKbps * resolutionBitrateFactor(tier)).toInt()
    }

    /**
     * @param runtimeSeconds runtime of the title/episode being downloaded, or null
     * when unknown (the bitrate ceiling is then skipped).
     */
    fun allows(stream: StreamItem, runtimeSeconds: Long? = null): Boolean {
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
        if (bitrateLimitEnabled && size != null && runtimeSeconds != null && runtimeSeconds > 0L) {
            val bitrateKbps = StreamQualityClassifier.bitrateKbps(size, runtimeSeconds)
            if (bitrateKbps > bitrateCeilingKbps(resolution, StreamQualityClassifier.codecOf(stream))) {
                return false
            }
        }
        return true
    }

    /** Effective ceiling in kbps for a stream of the given [resolution] and [codec]. */
    fun bitrateCeilingKbps(resolution: StreamResolutionTier, codec: StreamCodec): Double {
        val codecFactor = if (scaleBitrateByCodec) codec.bitrateFactor else 1.0
        return tierBitrateKbps(resolution) * codecFactor
    }

    companion object {
        val DEFAULT_ALLOWED_SOURCES: Set<StreamSourceType> =
            setOf(StreamSourceType.WEBDL, StreamSourceType.WEBRIP)

        const val MIN_MAX_SIZE_BYTES: Long = 3L * 1024 * 1024 * 1024
        const val MAX_MAX_SIZE_BYTES: Long = 20L * 1024 * 1024 * 1024
        const val DEFAULT_MAX_SIZE_BYTES: Long = 15L * 1024 * 1024 * 1024

        /** Roughly Netflix's 1080p average (about 5-6 Mbps, with headroom). */
        const val DEFAULT_MAX_BITRATE_KBPS: Int = 6_000
        const val MIN_MAX_BITRATE_KBPS: Int = 1_000
        const val MAX_MAX_BITRATE_KBPS: Int = 20_000

        /**
         * How much of the 1080p ceiling each resolution tier gets. 4K gets 4.5x because 4K files are nearly always
         * HEVC, which then takes the codec cut: 6 Mbps x 4.5 x 0.6 is about 16 Mbps, Netflix's 4K level. (At 2.5x
         * a 4K HEVC file was held to 9 Mbps and real 4K web releases, typically 15-30 Mbps, never fit.)
         */
        /** The default (Balanced) limit for [tier]: the 1080p default scaled by [resolutionBitrateFactor]. */
        fun defaultTierBitrateKbps(tier: StreamResolutionTier): Int =
            (DEFAULT_MAX_BITRATE_KBPS * resolutionBitrateFactor(tier)).toInt()

        fun resolutionBitrateFactor(tier: StreamResolutionTier): Double = when (tier) {
            StreamResolutionTier.SD -> 0.35
            StreamResolutionTier.HD_720 -> 0.4
            StreamResolutionTier.FHD_1080 -> 1.0
            StreamResolutionTier.UHD_4K -> 4.5
            StreamResolutionTier.UNKNOWN -> 1.0
        }

        /**
         * How much of the size cap each tier gets in the one-tap Download picker, so 4K is not blocked by a 1080p
         * cap (8 GB becomes 20 GB). Kept separate from [resolutionBitrateFactor] so the larger 4K bitrate allowance
         * does not also let 36 GB remuxes through.
         */
        fun resolutionSizeFactor(tier: StreamResolutionTier): Double = when (tier) {
            StreamResolutionTier.UHD_4K -> 2.5
            else -> 1.0
        }

        val DEFAULT = DownloadFilterConfig()
    }
}

/**
 * Looks up the runtime (in seconds) of the movie or episode a stream list is
 * for, so [DownloadFilterConfig] can derive bitrate from file size.
 */
object DownloadRuntimeResolver {
    /** Episode runtime when the addon provides one, else the title's runtime. */
    fun runtimeSeconds(meta: MetaDetails?, videoId: String?): Long? {
        if (meta == null) return null
        val episodeMinutes = videoId
            ?.let { id -> meta.videos.firstOrNull { it.id == id } }
            ?.runtime
        val minutes = episodeMinutes?.takeIf { it > 0 }
            ?: parseRuntimeMinutes(meta.runtime)?.takeIf { it > 0 }
            ?: return null
        return minutes * 60L
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
            ?: textSizeOf(stream)
        return size?.takeIf { it > 0L }
    }

    /**
     * The size an add-on wrote into the stream's text when it sends no structured size. Torrentio,
     * for one, only puts it in the title ("👤 4 💾 24.3 GB ⚙️ EXT"); without this every Torrentio
     * stream counts as size-less, so Data Saver and the download filter hide it.
     */
    private fun textSizeOf(stream: StreamItem): Long? = sizeInText(haystack(stream))

    /** "💾 24.3 GB" first, then the first plain size ("1.66 GB", "700 MB"); binary units, as add-ons print them. */
    internal fun sizeInText(text: String): Long? {
        val match = Regex("""💾\s*(\d+(?:[.,]\d+)?)\s*(tib|tb|gib|gb|mib|mb)\b""", RegexOption.IGNORE_CASE).find(text)
            ?: Regex("""(?<![\w.])(\d+(?:[.,]\d+)?)\s*(tib|tb|gib|gb|mib|mb)\b""", RegexOption.IGNORE_CASE).find(text)
            ?: return null
        val amount = match.groupValues[1].replace(',', '.').toDoubleOrNull() ?: return null
        val unit = when (match.groupValues[2].lowercase()) {
            "tib", "tb" -> 1024.0 * 1024 * 1024 * 1024
            "gib", "gb" -> 1024.0 * 1024 * 1024
            else -> 1024.0 * 1024
        }
        return (amount * unit).toLong().takeIf { it > 0L }
    }

    fun codecOf(stream: StreamItem): StreamCodec =
        codecOf(haystack(stream))

    /** Average bitrate in kbps for a file of [sizeBytes] lasting [runtimeSeconds]. */
    fun bitrateKbps(sizeBytes: Long, runtimeSeconds: Long): Double =
        sizeBytes * 8.0 / runtimeSeconds / 1000.0

    /** True for HDR10 / HDR10+ / HLG / Dolby Vision streams, from the title and metadata. */
    fun isHdr(stream: StreamItem): Boolean = isHdr(haystack(stream))

    internal fun isHdr(text: String): Boolean =
        Regex("(\\bhdr10\\+?|\\bhdr\\b|\\bhlg\\b|dolby[ .-]?vision|\\bdv\\b)").containsMatchIn(text)

    internal fun codecOf(text: String): StreamCodec = when {
        Regex("(\\bx265\\b|\\bh\\.?265\\b|\\bhevc\\b)").containsMatchIn(text) -> StreamCodec.HEVC
        Regex("\\bav1\\b").containsMatchIn(text) -> StreamCodec.AV1
        Regex("(\\bx264\\b|\\bh\\.?264\\b|\\bavc\\b)").containsMatchIn(text) -> StreamCodec.AVC
        else -> StreamCodec.UNKNOWN
    }

    /**
     * The tagged line count of a standard-definition stream (576, 540, 480, 360 or 240), or null when the file is
     * only tagged "SD" / "DVDRip" or is not SD at all. Lets the 480p download option prefer real 480p files.
     */
    fun sdHeightOf(stream: StreamItem): Int? = sdHeightOf(haystack(stream))

    internal fun sdHeightOf(text: String): Int? =
        Regex("(576|540|480|360|240)p").find(text)?.groupValues?.get(1)?.toInt()

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
        runtimeSeconds: Long? = null,
    ): DownloadFilterResult {
        var hidden = 0
        val filtered = groups.map { group ->
            val kept = group.streams.filter { stream ->
                val keep = config.allows(stream, runtimeSeconds)
                if (!keep) hidden++
                keep
            }
            group.copy(streams = kept)
        }
        return DownloadFilterResult(groups = filtered, hiddenCount = hidden)
    }
}
