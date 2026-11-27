package com.nuvio.app.features.datasaver

import com.nuvio.app.features.downloads.DownloadFilterConfig
import com.nuvio.app.features.downloads.StreamResolutionTier
import com.nuvio.app.features.downloads.presetTiers

/** How far over its resolution's target a file can be and still show in the Data Saver list. */
internal const val DATA_SAVER_LIST_HEADROOM = 1.5

/**
 * The rules the streams list uses in Data Saver mode: [base]'s resolution, file types and size,
 * with bitrate limits taken from these targets instead of set separately, so one set of
 * numbers drives both auto-pick and the list. A file over [DATA_SAVER_LIST_HEADROOM] times its
 * resolution's target is hidden.
 */
internal fun DataSaverPlaybackConfig.listFilter(base: DownloadFilterConfig): DownloadFilterConfig {
    fun limit(tier: StreamResolutionTier) = (targetFor(tier) * DATA_SAVER_LIST_HEADROOM).toInt()
    return base.copy(
        bitrateLimitEnabled = true,
        maxBitrateKbps = limit(StreamResolutionTier.FHD_1080),
        bitrateOverridesKbps = presetTiers
            .filter { it != StreamResolutionTier.FHD_1080 }
            .associateWith(::limit),
    )
}
