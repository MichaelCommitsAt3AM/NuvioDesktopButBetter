package com.nuvio.app.features.datasaver

import com.nuvio.app.features.downloads.DownloadFilterConfig
import com.nuvio.app.features.downloads.DownloadFilterSettingsStorage
import com.nuvio.app.features.downloads.FilterConfigStore
import com.nuvio.app.features.downloads.StreamResolutionTier

/**
 * Data Saver's own rules for filtering the streams list (resolution, file types, bitrate,
 * size), kept apart from the download filter so each can change without the other. Its first
 * load copies the rules both used to share.
 */
object DataSaverSettingsRepository : FilterConfigStore(
    // Data Saver is about smaller files, so it keeps the tighter 8 GB cap the shared rules had.
    defaults = DownloadFilterConfig.DEFAULT.copy(
        maxResolution = StreamResolutionTier.FHD_1080,
        maxSizeBytes = 8L * 1024 * 1024 * 1024,
    ),
    minMaxSizeBytes = 1L * 1024 * 1024 * 1024,
    load = DataSaverSettingsStorage::loadConfig,
    save = DataSaverSettingsStorage::saveConfig,
    loadLegacy = DownloadFilterSettingsStorage::loadConfig,
)
