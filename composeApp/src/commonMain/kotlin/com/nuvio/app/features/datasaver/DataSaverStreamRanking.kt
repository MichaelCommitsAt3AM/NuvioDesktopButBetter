package com.nuvio.app.features.datasaver

import com.nuvio.app.features.downloads.DownloadQualityPicker
import com.nuvio.app.features.downloads.StreamQualityClassifier
import com.nuvio.app.features.downloads.StreamResolutionTier
import com.nuvio.app.features.streams.StreamItem
import kotlin.math.abs

/**
 * Data Saver's order for auto source selection. Only files tagged with Data Saver's maximum
 * resolution or a lower one are considered: untagged files and higher resolutions are left out.
 * The maximum comes first, then each lower resolution in turn. Within each, the file whose
 * average bitrate (size / runtime) is closest to that resolution's target comes first, so:
 * - when every copy is above the target (e.g. Apple TV releases), the leanest one wins;
 * - when every copy is below it (e.g. older films), the best-looking one wins.
 * The target is for H.264; HEVC and AV1 get the same lower share as in the download filter,
 * since they look as good at less bitrate. Files with no size keep their order after the rest.
 */
internal object DataSaverStreamRanking {
    fun order(
        streams: List<StreamItem>,
        targetKbps: (StreamResolutionTier) -> Int,
        runtimeSeconds: Long?,
        maxResolution: StreamResolutionTier,
    ): List<StreamItem> {
        val runtime = runtimeSeconds?.takeIf { it > 0L } ?: DownloadQualityPicker.ASSUMED_RUNTIME_SECONDS
        return streams.withIndex()
            .filter { (_, stream) ->
                val tier = StreamQualityClassifier.resolutionOf(stream)
                tier != StreamResolutionTier.UNKNOWN && tier.rank <= maxResolution.rank
            }
            .sortedWith(
                compareByDescending<IndexedValue<StreamItem>> { StreamQualityClassifier.resolutionOf(it.value).rank }
                    .thenBy { StreamQualityClassifier.sizeOf(it.value) == null }
                    .thenBy {
                        val tier = StreamQualityClassifier.resolutionOf(it.value)
                        distanceFromTarget(it.value, targetKbps(tier), runtime) ?: 0.0
                    }
                    // Equally close: the smaller file.
                    .thenBy { StreamQualityClassifier.sizeOf(it.value) ?: 0L }
                    .thenBy { it.index },
            )
            .map { it.value }
    }

    private fun distanceFromTarget(stream: StreamItem, targetKbps: Int, runtimeSeconds: Long): Double? {
        val size = StreamQualityClassifier.sizeOf(stream) ?: return null
        val kbps = StreamQualityClassifier.bitrateKbps(size, runtimeSeconds)
        val codecTarget = targetKbps * StreamQualityClassifier.codecOf(stream).bitrateFactor
        return abs(kbps - codecTarget)
    }
}
