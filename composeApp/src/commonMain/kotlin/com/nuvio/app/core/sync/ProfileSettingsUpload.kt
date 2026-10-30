package com.nuvio.app.core.sync

import kotlinx.serialization.json.JsonObject

/** Both RPCs must use the same captured profile and settings, across suspension. */
internal suspend fun <T> uploadProfileSettingsSnapshot(
    profileId: Int,
    settings: T,
    captureTmdb: () -> JsonObject,
    pushSettings: suspend (Int, T) -> Unit,
    pushTmdb: suspend (Int, JsonObject) -> Unit,
) {
    val tmdb = captureTmdb()
    pushSettings(profileId, settings)
    pushTmdb(profileId, tmdb)
}
