package com.nuvio.app.features.datasaver

import com.nuvio.app.features.downloads.DownloadFilterConfig
import com.nuvio.app.features.downloads.StreamResolutionTier
import com.nuvio.app.features.downloads.bitrateChoicesKbps
import com.nuvio.app.features.downloads.settingTiers

/**
 * Public entry points for the desktop bridge module, which cannot see the shared module's
 * internal helpers. Kept here so the files shared with NuvioMobileButBetter stay unchanged.
 */
object DataSaverDesktopAccess {
    /** The rules the streams list uses in Data Saver mode (see [listFilter]). */
    fun streamListRules(): DownloadFilterConfig =
        DataSaverPlaybackRepository.snapshot().listFilter(DataSaverSettingsRepository.snapshot())

    /** The resolutions the settings pages offer, highest first: 4K, 1080p, 720p. */
    val settingResolutions: List<StreamResolutionTier> get() = settingTiers

    /** The bitrate choices offered for [tier], in kbps, as on mobile. */
    fun bitrateChoices(tier: StreamResolutionTier): List<Int> = bitrateChoicesKbps(tier)
}
