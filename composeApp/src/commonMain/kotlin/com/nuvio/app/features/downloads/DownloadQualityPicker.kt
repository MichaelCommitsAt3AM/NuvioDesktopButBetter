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
    /**
     * True when every stream of this quality is over the user's bitrate budget and this is the smallest of them,
     * offered anyway so the quality is not lost. The UI marks it as a large file.
     */
    val overBudget: Boolean = false,
)

/**
 * Picks, for each of 4K / 1080p / 720p (plus 480p, see below), the stream a user should download without
 * looking at the streams list: the best-looking file that is still within the
 * user's [DownloadFilterConfig] bitrate budget for that resolution. When every stream
 * of a tier is over that budget, the smallest one is offered anyway and marked
 * [QualityDownloadOption.overBudget] (it must still fit the size cap and have a known
 * size). A tier with no stream within the size cap is absent from the result, so the
 * UI never offers a quality that cannot be downloaded.
 *
 * Lower bitrates are always fine (old or low-detail titles encode small); the
 * ceiling only removes bloated files. Among the streams that fit, the highest
 * codec-adjusted bitrate wins, so an HEVC file at 3.4 Mbps and an AVC file at
 * 5.8 Mbps compare as roughly equal quality and the larger budget use is not
 * automatically preferred over a more efficient encode.
 *
 * 4K is picked differently (see [pick4k]): someone choosing 4K has accepted a large
 * file, and a bitrate ceiling there rewards fake or starved "4K" files (a 1.6 GB
 * "2160p" episode next to 9 GB Apple TV releases). So 4K skips implausibly small
 * files and takes the leanest genuine one.
 *
 * 480p ([StreamResolutionTier.SD]) is a smaller-file option offered only when 1080p is
 * the best quality on offer (no 4K option), and only when it is smaller than every
 * higher option. It prefers files tagged 480p, then the closest lower resolution
 * (360p, then 240p), then untagged SD / DVD rips, and only then 540p / 576p. When no
 * SD stream fits, the option is simply absent.
 */
object DownloadQualityPicker {
    val TIERS: List<StreamResolutionTier> = listOf(
        StreamResolutionTier.UHD_4K,
        StreamResolutionTier.FHD_1080,
        StreamResolutionTier.HD_720,
        StreamResolutionTier.SD,
    )

    /** Preference order of tagged SD line counts for the 480p option; null is a file tagged only "SD" / "DVDRip". */
    private val SD_HEIGHT_PREFERENCE: List<Int?> = listOf(480, 360, 240, null, 540, 576)

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
        val options = TIERS.mapNotNull { tier -> pickForTier(downloadable, tier, config, runtime) }
        // A real 4K file is never smaller than the 1080p one offered beside it.
        val fhdSize = options.firstOrNull { it.tier == StreamResolutionTier.FHD_1080 }?.sizeBytes
        val withoutFake4k = options.filterNot { option ->
            option.tier == StreamResolutionTier.UHD_4K && fhdSize != null &&
                option.sizeBytes != null && option.sizeBytes < fhdSize
        }
        return withoutSurplusSd(withoutFake4k)
    }

    /**
     * 480p only appears when 1080p is the top option (no 4K), and only as a genuinely smaller file: it is dropped
     * when it is not smaller than every higher option of known size.
     */
    private fun withoutSurplusSd(options: List<QualityDownloadOption>): List<QualityDownloadOption> {
        val sd = options.firstOrNull { it.tier == StreamResolutionTier.SD } ?: return options
        val higher = options.filter { it.tier != StreamResolutionTier.SD }
        val fhdIsTop = higher.firstOrNull()?.tier == StreamResolutionTier.FHD_1080
        val smallestHigher = higher.mapNotNull { it.sizeBytes }.minOrNull()
        val notSmaller = sd.sizeBytes != null && smallestHigher != null && sd.sizeBytes >= smallestHigher
        return if (!fhdIsTop || notSmaller) higher else options
    }

    /** Below this average bitrate (HEVC; scaled for other codecs) a "4K" file is treated as fake or starved. */
    const val MIN_4K_HEVC_KBPS: Double = 8_000.0

    /** With at least [MIN_4K_PEERS] sized 4K copies, one under this share of their median size is skipped. */
    const val MIN_4K_SHARE_OF_MEDIAN: Double = 0.5
    const val MIN_4K_PEERS: Int = 3

    /**
     * 4K: no bitrate ceiling (the tier's size cap still keeps remuxes out), but skip implausible files, those under
     * [MIN_4K_HEVC_KBPS] or, among enough copies, under half the median size, then take the leanest that remains.
     * Files without a known size are skipped, since they cannot be checked. Returns null when nothing is plausible.
     */
    private fun pick4k(
        streams: List<StreamItem>,
        tierConfig: DownloadFilterConfig,
        config: DownloadFilterConfig,
        runtimeSeconds: Long,
    ): QualityDownloadOption? {
        val sizeOnly = tierConfig.copy(bitrateLimitEnabled = false)
        val sized = streams
            .filter { StreamQualityClassifier.sizeOf(it) != null && sizeOnly.allows(it, runtimeSeconds) }
            .map { stream -> candidate(stream, StreamResolutionTier.UHD_4K, config, runtimeSeconds) }
        val median = sized.mapNotNull { it.option.sizeBytes }.sorted().takeIf { it.size >= MIN_4K_PEERS }
            ?.let { sizes -> if (sizes.size % 2 == 1) sizes[sizes.size / 2].toDouble() else (sizes[sizes.size / 2 - 1] + sizes[sizes.size / 2]) / 2.0 }
        return sized
            // The floor scales with the file's codec (AVC needs about 13 Mbps, AV1 about 6.7), whatever the user's
            // codec-scaling setting: this judges whether the file is plausible, not whether it suits the user.
            // An untagged 4K file is assumed HEVC, as 4K releases nearly always are.
            .filter { (it.option.bitrateKbps ?: 0) >= MIN_4K_HEVC_KBPS * fourKCodec(it.option.codec).bitrateFactor / StreamCodec.HEVC.bitrateFactor }
            .filter { median == null || it.option.sizeBytes!! >= median * MIN_4K_SHARE_OF_MEDIAN }
            .minByOrNull { it.score }
            ?.option
    }

    /**
     * The filter rules for one quality: everything except cam/telesync rips is allowed, since the
     * bitrate ceiling already rejects remuxes and other oversized files and old titles often only
     * exist as Blu-ray or HDTV encodes. The size cap scales with the tier so 4K is not blocked by a
     * 1080p cap.
     */
    private fun tierConfig(config: DownloadFilterConfig, tier: StreamResolutionTier): DownloadFilterConfig =
        config.copy(
            maxResolution = tier,
            allowedSources = StreamSourceType.entries.toSet() - StreamSourceType.CAM,
            maxSizeBytes = (config.maxSizeBytes * DownloadFilterConfig.resolutionSizeFactor(tier))
                .toLong().coerceAtLeast(config.maxSizeBytes),
            bitrateLimitEnabled = true,
        )

    /**
     * Whether [stream] fits the user's filter limits for its own quality, as the quality options do
     * within budget: size cap and source rules always, the bitrate budget for all but 4K (which,
     * as in [pick4k], only has the size cap).
     */
    fun fitsLimits(stream: StreamItem, config: DownloadFilterConfig, runtimeSeconds: Long?): Boolean {
        val tier = StreamQualityClassifier.resolutionOf(stream)
        val runtime = runtimeSeconds?.takeIf { it > 0L } ?: ASSUMED_RUNTIME_SECONDS
        val rules = if (tier == StreamResolutionTier.UNKNOWN) {
            config.copy(allowedSources = StreamSourceType.entries.toSet() - StreamSourceType.CAM, bitrateLimitEnabled = true)
        } else {
            tierConfig(config, tier).let { if (tier == StreamResolutionTier.UHD_4K) it.copy(bitrateLimitEnabled = false) else it }
        }
        return rules.allows(stream, runtime)
    }

    private fun pickForTier(
        streams: List<StreamItem>,
        tier: StreamResolutionTier,
        config: DownloadFilterConfig,
        runtimeSeconds: Long,
    ): QualityDownloadOption? {
        val tierConfig = tierConfig(config, tier)
        val ofTier = streams.filter { StreamQualityClassifier.resolutionOf(it) == tier }
        if (tier == StreamResolutionTier.UHD_4K) return pick4k(ofTier, tierConfig, config, runtimeSeconds)
        // 480p tries each SD line count in preference order, so a real 480p file beats a 576p one. All groups are
        // tried within budget before any over-budget fallback, so an in-budget 360p beats an over-budget 480p.
        val groups = if (tier != StreamResolutionTier.SD) listOf(ofTier) else {
            val byHeight = ofTier.groupBy { StreamQualityClassifier.sdHeightOf(it) }
            SD_HEIGHT_PREFERENCE.mapNotNull { byHeight[it] }
        }
        groups.firstNotNullOfOrNull { pickWithinBudget(it, tier, tierConfig, config, runtimeSeconds) }?.let { return it }
        return groups.firstNotNullOfOrNull { pickOverBudget(it, tier, tierConfig, config, runtimeSeconds) }
    }

    private fun pickWithinBudget(
        streams: List<StreamItem>,
        tier: StreamResolutionTier,
        tierConfig: DownloadFilterConfig,
        config: DownloadFilterConfig,
        runtimeSeconds: Long,
    ): QualityDownloadOption? = streams
        .filter { tierConfig.allows(it, runtimeSeconds) }
        .map { stream -> candidate(stream, tier, config, runtimeSeconds) }
        .maxWithOrNull(compareBy<Candidate> { it.hasSize }.thenBy { it.score })
        ?.option

    /**
     * Nothing fits the bitrate budget (e.g. Apple TV 4K at 25-30 Mbps): offer the smallest file that still passes the
     * size cap and source rules, marked as over budget so the user can choose it knowingly.
     */
    private fun pickOverBudget(
        streams: List<StreamItem>,
        tier: StreamResolutionTier,
        tierConfig: DownloadFilterConfig,
        config: DownloadFilterConfig,
        runtimeSeconds: Long,
    ): QualityDownloadOption? {
        val sizeOnly = tierConfig.copy(bitrateLimitEnabled = false)
        return streams
            .filter { StreamQualityClassifier.sizeOf(it) != null && sizeOnly.allows(it, runtimeSeconds) }
            .map { stream -> candidate(stream, tier, config, runtimeSeconds) }
            .minByOrNull { it.score }
            ?.option?.copy(overBudget = true)
    }

    private fun fourKCodec(codec: StreamCodec) = if (codec == StreamCodec.UNKNOWN) StreamCodec.HEVC else codec

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
