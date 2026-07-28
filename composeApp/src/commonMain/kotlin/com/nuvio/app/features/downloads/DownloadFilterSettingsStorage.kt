package com.nuvio.app.features.downloads

internal expect object DownloadFilterSettingsStorage {
    fun loadConfig(): String?
    fun saveConfig(config: String)
}
