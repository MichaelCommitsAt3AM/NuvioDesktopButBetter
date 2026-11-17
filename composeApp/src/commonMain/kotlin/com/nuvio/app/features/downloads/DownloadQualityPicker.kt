package com.nuvio.app.features.downloads

import com.nuvio.app.features.streams.StreamItem

/** One ready-to-download choice offered by the "Download" button, e.g. the best 1080p stream. */
data class QualityDownloadOption(
    val tier: StreamResolutionTier,
    val stream: StreamItem,
    val sizeBytes: Long?,
    /** Average bitrate of the file in kbps, or null when no size is known. */
    val bitrateKbps: Int?,
    val codec: StreamCodec,
    val source: StreamSourceType,
    /** True for HDR10 / HDR10+ / HLG / Dolby Vision files. The UI labels the 4K option with it. */
    val hdr: Boolean = false,
)

/**
 * Picks, for each of 4K / 1080p / 720p, the stream a user should download without
 * looking at the streams list: the best-looking file that is still within the
 * user's [DownloadFilterConfig] bitrate budget for that resolution. A tier with no
 * suitable stream is simply absent from the result, so the UI never offers a
 * quality that cannot be downloaded.
 *
 * Lower bitrates are always fine (old or low-detail titles encode small); the
 * ceiling only removes bloated files. Among the streams that fit, the highest
 * codec-adjusted bitrate wins, so an HEVC file at 3.4 Mbps and an AVC file at
 * 5.8 Mbps compare as roughly equal quality and the larger budget use is not
 * automatically preferred over a more efficient encode.
 */
object DownloadQualityPicker {
    val TIERS: List<StreamResolutionTier> = listOf(
        StreamResolutionTier.UHD_4K,
        StreamResolutionTier.FHD_1080,
        StreamResolutionTier.HD_720,
    )

    /** Used for the bitrate maths when the title's runtime is unknown. */
    const val ASSUMED_RUNTIME_SECONDS: Long = 100L * 60

    fun pick(
        streams: List<StreamItem>,
        config: DownloadFilterConfig,
        runtimeSeconds: Long?,
        isDownloadable: (StreamItem) -> Boolean = { true },
    ): List<QualityDownloadOption> {
        val runtime = runtimeSeconds?.takeIf { it > 0L } ?: ASSUMED_RUNTIME_SECONDS
        val downloadable = streams.filter(isDownloadable)
        return TIERS.mapNotNull { tier -> pickForTier(downloadable, tier, config, runtime) }
    }

    private fun pickForTier(
        streams: List<StreamItem>,
        tier: StreamResolutionTier,
        config: DownloadFilterConfig,
        runtimeSeconds: Long,
    ): QualityDownloadOption? {
        // Everything except cam/telesync rips is allowed here: the bitrate ceiling already
        // rejects remuxes and other oversized files, and old titles often only exist as Blu-ray
        // or HDTV encodes. The size cap scales with the tier so 4K is not blocked by a 1080p cap.
        val tierConfig = config.copy(
            maxResolution = tier,
            allowedSources = StreamSourceType.entries.toSet() - StreamSourceType.CAM,
            maxSizeBytes = (config.maxSizeBytes * DownloadFilterConfig.resolutionBitrateFactor(tier))
                .toLong().coerceAtLeast(config.maxSizeBytes),
            bitrateLimitEnabled = true,
        )
        return streams
            .filter { StreamQualityClassifier.resolutionOf(it) == tier }
            .filter { tierConfig.allows(it, runtimeSeconds) }
            .map { stream -> candidate(stream, tier, config, runtimeSeconds) }
            .maxWithOrNull(compareBy<Candidate> { it.hasSize }.thenBy { it.score })
            ?.option
    }

    private class Candidate(val option: QualityDownloadOption, val hasSize: Boolean, val score: Double)

    private fun candidate(
        stream: StreamItem,
        tier: StreamResolutionTier,
        config: DownloadFilterConfig,
        runtimeSeconds: Long,
    ): Candidate {
        val size = StreamQualityClassifier.sizeOf(stream)
        val codec = StreamQualityClassifier.codecOf(stream)
        val bitrate = size?.let { StreamQualityClassifier.bitrateKbps(it, runtimeSeconds) }
        val codecFactor = if (config.scaleBitrateByCodec) codec.bitrateFactor else 1.0
        return Candidate(
            option = QualityDownloadOption(
                tier = tier,
                stream = stream,
                sizeBytes = size,
                bitrateKbps = bitrate?.toInt(),
                codec = codec,
                source = StreamQualityClassifier.sourceTypeOf(stream),
                hdr = StreamQualityClassifier.isHdr(stream),
            ),
            hasSize = size != null,
            // Dividing by the codec factor credits efficient codecs with the quality they deliver.
            score = (bitrate ?: 0.0) / codecFactor,
        )
    }
}
