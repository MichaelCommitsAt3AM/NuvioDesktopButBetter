package com.nuvio.app.features.downloads

import android.content.Context
import android.content.SharedPreferences
import com.nuvio.app.core.storage.ProfileScopedKey

actual object DownloadFilterSettingsStorage {
    private const val preferencesName = "nuvio_download_filter_settings"
    private const val configKey = "download_filter_config"

    private var preferences: SharedPreferences? = null

    fun initialize(context: Context) {
        preferences = context.getSharedPreferences(preferencesName, Context.MODE_PRIVATE)
    }

    actual fun loadConfig(): String? =
        preferences?.getString(ProfileScopedKey.of(configKey), null)

    actual fun saveConfig(config: String) {
        preferences
            ?.edit()
            ?.putString(ProfileScopedKey.of(configKey), config)
            ?.apply()
    }
}
