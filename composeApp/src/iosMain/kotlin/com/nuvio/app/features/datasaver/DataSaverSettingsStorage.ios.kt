package com.nuvio.app.features.datasaver

import com.nuvio.app.core.storage.ProfileScopedKey
import platform.Foundation.NSUserDefaults

actual object DataSaverSettingsStorage {
    private const val configKey = "data_saver_config"
    private const val playbackKey = "data_saver_playback"

    actual fun loadConfig(): String? = load(configKey)

    actual fun saveConfig(config: String) = save(configKey, config)

    actual fun loadPlaybackConfig(): String? = load(playbackKey)

    actual fun savePlaybackConfig(config: String) = save(playbackKey, config)

    private fun load(key: String): String? =
        NSUserDefaults.standardUserDefaults.stringForKey(ProfileScopedKey.of(key))

    private fun save(key: String, value: String) {
        NSUserDefaults.standardUserDefaults.setObject(value, forKey = ProfileScopedKey.of(key))
    }
}
