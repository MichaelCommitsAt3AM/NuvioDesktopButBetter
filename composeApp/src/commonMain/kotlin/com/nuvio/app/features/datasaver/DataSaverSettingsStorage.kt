package com.nuvio.app.features.datasaver

internal expect object DataSaverSettingsStorage {
    /** The streams list filter rules, a serialized [com.nuvio.app.features.downloads.DownloadFilterConfig]. */
    fun loadConfig(): String?
    fun saveConfig(config: String)

    /** The on/off switch and target bitrate, a serialized [DataSaverPlaybackConfig]. */
    fun loadPlaybackConfig(): String?
    fun savePlaybackConfig(config: String)
}
