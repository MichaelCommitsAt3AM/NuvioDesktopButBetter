package com.nuvio.app.features.datasaver

import com.nuvio.app.core.storage.DesktopStorage
import com.nuvio.app.core.storage.ProfileScopedKey

internal actual object DataSaverSettingsStorage {
    private const val configKey = "data_saver_config"
    private const val playbackKey = "data_saver_playback"

    private val store = DesktopStorage.store("nuvio_data_saver_settings")

    actual fun loadConfig(): String? = store.getString(ProfileScopedKey.of(configKey))

    actual fun saveConfig(config: String) {
        store.putString(ProfileScopedKey.of(configKey), config)
    }

    actual fun loadPlaybackConfig(): String? = store.getString(ProfileScopedKey.of(playbackKey))

    actual fun savePlaybackConfig(config: String) {
        store.putString(ProfileScopedKey.of(playbackKey), config)
    }
}
