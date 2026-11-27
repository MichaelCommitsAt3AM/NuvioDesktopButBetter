package com.nuvio.app.features.datasaver

import android.content.Context
import android.content.SharedPreferences
import com.nuvio.app.core.storage.ProfileScopedKey

actual object DataSaverSettingsStorage {
    private const val preferencesName = "nuvio_data_saver_settings"
    private const val configKey = "data_saver_config"
    private const val playbackKey = "data_saver_playback"

    private var preferences: SharedPreferences? = null

    fun initialize(context: Context) {
        preferences = context.getSharedPreferences(preferencesName, Context.MODE_PRIVATE)
    }

    actual fun loadConfig(): String? = load(configKey)

    actual fun saveConfig(config: String) = save(configKey, config)

    actual fun loadPlaybackConfig(): String? = load(playbackKey)

    actual fun savePlaybackConfig(config: String) = save(playbackKey, config)

    private fun load(key: String): String? =
        preferences?.getString(ProfileScopedKey.of(key), null)

    private fun save(key: String, value: String) {
        preferences
            ?.edit()
            ?.putString(ProfileScopedKey.of(key), value)
            ?.apply()
    }
}
