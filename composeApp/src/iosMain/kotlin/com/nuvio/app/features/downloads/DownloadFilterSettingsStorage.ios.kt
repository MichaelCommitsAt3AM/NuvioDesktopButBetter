package com.nuvio.app.features.downloads

import com.nuvio.app.core.storage.ProfileScopedKey
import platform.Foundation.NSUserDefaults

actual object DownloadFilterSettingsStorage {
    private const val configKey = "download_filter_config"

    actual fun loadConfig(): String? =
        NSUserDefaults.standardUserDefaults.stringForKey(ProfileScopedKey.of(configKey))

    actual fun saveConfig(config: String) {
        NSUserDefaults.standardUserDefaults.setObject(config, forKey = ProfileScopedKey.of(configKey))
    }
}
