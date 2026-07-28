package com.nuvio.app.features.downloads

import com.nuvio.app.core.storage.DesktopStorage
import com.nuvio.app.core.storage.ProfileScopedKey

internal actual object DownloadFilterSettingsStorage {
    private const val configKey = "download_filter_config"

    private val store = DesktopStorage.store("nuvio_download_filter_settings")

    actual fun loadConfig(): String? = store.getString(ProfileScopedKey.of(configKey))

    actual fun saveConfig(config: String) {
        store.putString(ProfileScopedKey.of(configKey), config)
    }
}
