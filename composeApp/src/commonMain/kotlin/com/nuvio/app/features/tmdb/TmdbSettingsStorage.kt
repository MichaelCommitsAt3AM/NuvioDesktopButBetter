package com.nuvio.app.features.tmdb

import kotlinx.serialization.json.JsonObject

internal expect object TmdbSettingsStorage {
    fun loadPendingPreferences(profileId: Int): String?
    fun savePendingPreferences(profileId: Int, value: String?)
    fun loadEnabled(): Boolean?
    fun saveEnabled(enabled: Boolean)
    fun loadEnabledForProfile(profileId: Int): Boolean?
    fun loadUseCreditsForProfile(profileId: Int): Boolean?
    fun loadUseProductionsForProfile(profileId: Int): Boolean?
    fun loadUseNetworksForProfile(profileId: Int): Boolean?
    fun saveKidsProfileSettings(profileId: Int, apiKey: String?, enabled: Boolean?, useCredits: Boolean? = null, useProductions: Boolean? = null, useNetworks: Boolean? = null)
    fun loadApiKey(): String?
    fun saveApiKey(apiKey: String)
    fun loadLanguage(): String?
    fun saveLanguage(language: String)
    fun loadUseTrailers(): Boolean?
    fun saveUseTrailers(enabled: Boolean)
    fun loadUseArtwork(): Boolean?
    fun saveUseArtwork(enabled: Boolean)
    fun loadUseBasicInfo(): Boolean?
    fun saveUseBasicInfo(enabled: Boolean)
    fun loadUseDetails(): Boolean?
    fun saveUseDetails(enabled: Boolean)
    fun loadUseCredits(): Boolean?
    fun saveUseCredits(enabled: Boolean)
    fun loadUseProductions(): Boolean?
    fun saveUseProductions(enabled: Boolean)
    fun loadUseNetworks(): Boolean?
    fun saveUseNetworks(enabled: Boolean)
    fun loadUseEpisodes(): Boolean?
    fun saveUseEpisodes(enabled: Boolean)
    fun loadUseSeasonPosters(): Boolean?
    fun saveUseSeasonPosters(enabled: Boolean)
    fun loadUseMoreLikeThis(): Boolean?
    fun saveUseMoreLikeThis(enabled: Boolean)
    fun loadUseCollections(): Boolean?
    fun saveUseCollections(enabled: Boolean)
    fun exportToSyncPayload(): JsonObject
    fun replaceFromSyncPayload(payload: JsonObject)
}
