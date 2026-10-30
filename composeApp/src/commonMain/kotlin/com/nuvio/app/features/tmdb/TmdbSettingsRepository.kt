package com.nuvio.app.features.tmdb

import com.nuvio.app.core.sync.ProfileSettingsSync
import com.nuvio.app.features.details.MetaDetailsRepository
import com.nuvio.app.features.profiles.ProfileRepository
import com.nuvio.app.features.watchprogress.ContinueWatchingEnrichmentCache
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

object TmdbSettingsRepository {
    private val _uiState = MutableStateFlow(TmdbSettings())
    val uiState: StateFlow<TmdbSettings> = _uiState.asStateFlow()

    private var hasLoaded = false
    private var loadedProfileId: Int? = null

    private var enabled = false
    private var apiKey = ""
    private var language = "en"
    private var useTrailers = true
    private var useArtwork = true
    private var useBasicInfo = true
    private var useDetails = true
    private var useCredits = true
    private var useProductions = true
    private var useNetworks = true
    private var useEpisodes = true
    private var useSeasonPosters = true
    private var useMoreLikeThis = true
    private var useCollections = true

    fun ensureLoaded() {
        if (hasLoaded && loadedProfileId == ProfileRepository.activeProfileId) return
        loadFromDisk()
    }

    fun onProfileChanged() {
        loadFromDisk()
    }

    fun snapshot(): TmdbSettings = ProfileRepository.settingsGuard.withLock {
        ensureLoaded()
        _uiState.value
    }

    /** Called only after KidsScreen has validated the key and saved the kids policy. */
    fun configureKidsProfile(profileId: Int, validatedApiKey: String, enableByDefault: Boolean) {
        if (validatedApiKey.trim().isEmpty()) return
        TmdbSettingsStorage.saveKidsProfileSettings(
            profileId, null,
            enabled = if (enableByDefault) true else null,
            useCredits = if (enableByDefault) false else null,
            useProductions = if (enableByDefault) false else null,
            useNetworks = if (enableByDefault) false else null,
        )
        if (ProfileRepository.activeProfileId == profileId) onProfileChanged()
    }

    fun hasEffectiveAccess(): Boolean = TmdbTransport.hasAccess()

    fun hasProxyAccess(): Boolean = TmdbTransport.hasProxyAccess()

    fun effectiveApiKey(): String = snapshot().apiKey.ifBlank { TmdbConfig.API_KEY }

    fun setEnabled(value: Boolean) = com.nuvio.app.features.profiles.ProfileRepository.settingsGuard.withLock { setEnabledLocked(value) }
    private fun setEnabledLocked(value: Boolean) {
        ensureLoaded()
        if (enabled == value) return
        enabled = value
        TmdbSettingsStorage.saveEnabled(value)
        ProfileSettingsSync.markIntegrationPreferencesChanged()
        publish()
        invalidateMetadata()
    }

    fun setApiKey(value: String) = com.nuvio.app.features.profiles.ProfileRepository.settingsGuard.withLock { setApiKeyLocked(value) }
    private fun setApiKeyLocked(value: String) {
        ensureLoaded()
        val normalized = value.trim()
        if (apiKey == normalized) return
        apiKey = normalized
        TmdbSettingsStorage.saveApiKey(normalized)
        publish()
        invalidateMetadata()
    }

    fun setLanguage(value: String) = com.nuvio.app.features.profiles.ProfileRepository.settingsGuard.withLock { setLanguageLocked(value) }
    private fun setLanguageLocked(value: String) {
        ensureLoaded()
        val normalized = normalizeLanguage(value)
        if (language == normalized) return
        language = normalized
        publish()
        TmdbSettingsStorage.saveLanguage(normalized)
        ProfileSettingsSync.markIntegrationPreferencesChanged()
    }

    fun setUseTrailers(value: Boolean) = setBoolean(
        current = { useTrailers },
        next = value,
        update = { useTrailers = it },
        persist = TmdbSettingsStorage::saveUseTrailers,
    )

    fun setUseArtwork(value: Boolean) = setBoolean(
        current = { useArtwork },
        next = value,
        update = { useArtwork = it },
        persist = TmdbSettingsStorage::saveUseArtwork,
    )

    fun setUseBasicInfo(value: Boolean) = setBoolean(
        current = { useBasicInfo },
        next = value,
        update = { useBasicInfo = it },
        persist = TmdbSettingsStorage::saveUseBasicInfo,
    )

    fun setUseDetails(value: Boolean) = setBoolean(
        current = { useDetails },
        next = value,
        update = { useDetails = it },
        persist = TmdbSettingsStorage::saveUseDetails,
    )

    fun setUseCredits(value: Boolean) = setBoolean(
        current = { useCredits },
        next = value,
        update = { useCredits = it },
        persist = TmdbSettingsStorage::saveUseCredits,
    )

    fun setUseProductions(value: Boolean) = setBoolean(
        current = { useProductions },
        next = value,
        update = { useProductions = it },
        persist = TmdbSettingsStorage::saveUseProductions,
    )

    fun setUseNetworks(value: Boolean) = setBoolean(
        current = { useNetworks },
        next = value,
        update = { useNetworks = it },
        persist = TmdbSettingsStorage::saveUseNetworks,
    )

    fun setUseEpisodes(value: Boolean) = setBoolean(
        current = { useEpisodes },
        next = value,
        update = { useEpisodes = it },
        persist = TmdbSettingsStorage::saveUseEpisodes,
    )

    fun setUseSeasonPosters(value: Boolean) = setBoolean(
        current = { useSeasonPosters },
        next = value,
        update = { useSeasonPosters = it },
        persist = TmdbSettingsStorage::saveUseSeasonPosters,
    )

    fun setUseMoreLikeThis(value: Boolean) = setBoolean(
        current = { useMoreLikeThis },
        next = value,
        update = { useMoreLikeThis = it },
        persist = TmdbSettingsStorage::saveUseMoreLikeThis,
    )

    fun setUseCollections(value: Boolean) = setBoolean(
        current = { useCollections },
        next = value,
        update = { useCollections = it },
        persist = TmdbSettingsStorage::saveUseCollections,
    )

    private fun setBoolean(
        current: () -> Boolean,
        next: Boolean,
        update: (Boolean) -> Unit,
        persist: (Boolean) -> Unit,
    ) = ProfileRepository.settingsGuard.withLock {
        ensureLoaded()
        if (current() == next) return@withLock
        update(next)
        persist(next)
        ProfileSettingsSync.markIntegrationPreferencesChanged()
        publish()
    }

    private fun loadFromDisk() {
        val wasLoaded = hasLoaded
        val previousApiKey = apiKey
        val previousEnabled = enabled
        val previousUseCredits = useCredits
        hasLoaded = true
        loadedProfileId = ProfileRepository.activeProfileId
        enabled = TmdbSettingsStorage.loadEnabled() ?: (ProfileRepository.state.value.activeProfile?.kidsEnabled == true)
        apiKey = TmdbSettingsStorage.loadApiKey()?.trim().orEmpty()
        val storedLanguage = TmdbSettingsStorage.loadLanguage()
        language = if (storedLanguage == null) "en" else normalizeLanguage(storedLanguage)
        useTrailers = TmdbSettingsStorage.loadUseTrailers() ?: true
        useArtwork = TmdbSettingsStorage.loadUseArtwork() ?: true
        useBasicInfo = TmdbSettingsStorage.loadUseBasicInfo() ?: true
        useDetails = TmdbSettingsStorage.loadUseDetails() ?: true
        useCredits = TmdbSettingsStorage.loadUseCredits() ?: (ProfileRepository.state.value.activeProfile?.kidsEnabled != true)
        useProductions = TmdbSettingsStorage.loadUseProductions() ?: (ProfileRepository.state.value.activeProfile?.kidsEnabled != true)
        useNetworks = TmdbSettingsStorage.loadUseNetworks() ?: (ProfileRepository.state.value.activeProfile?.kidsEnabled != true)
        useEpisodes = TmdbSettingsStorage.loadUseEpisodes() ?: true
        useSeasonPosters = TmdbSettingsStorage.loadUseSeasonPosters() ?: true
        useMoreLikeThis = TmdbSettingsStorage.loadUseMoreLikeThis() ?: true
        useCollections = TmdbSettingsStorage.loadUseCollections() ?: true
        publish()
        if (wasLoaded && (previousApiKey != apiKey || previousEnabled != enabled || previousUseCredits != useCredits)) {
            invalidateMetadata()
        }
    }

    private fun publish() {
        _uiState.value = TmdbSettings(
            enabled = enabled,
            apiKey = apiKey,
            language = language,
            useTrailers = useTrailers,
            useArtwork = useArtwork,
            useBasicInfo = useBasicInfo,
            useDetails = useDetails,
            useCredits = useCredits,
            useProductions = useProductions,
            useNetworks = useNetworks,
            useEpisodes = useEpisodes,
            useSeasonPosters = useSeasonPosters,
            useMoreLikeThis = useMoreLikeThis,
            useCollections = useCollections,
        )
    }

    private fun invalidateMetadata() {
        MetaDetailsRepository.clear()
        ContinueWatchingEnrichmentCache.clearAll(ProfileRepository.activeProfileId)
    }
}

internal fun normalizeLanguage(value: String?): String {
    val trimmed = value?.trim()?.replace('_', '-') ?: return ""
    return trimmed.takeIf { it.isNotBlank() } ?: ""
}
