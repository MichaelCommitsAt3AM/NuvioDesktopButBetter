package com.nuvio.app.core.sync

import co.touchlab.kermit.Logger
import com.nuvio.app.isDesktop
import com.nuvio.app.core.auth.AuthRepository
import com.nuvio.app.core.auth.AuthState
import com.nuvio.app.core.network.SupabaseProvider
import com.nuvio.app.features.collection.CollectionMobileSettingsRepository
import com.nuvio.app.features.collection.CollectionMobileSettingsStorage
import com.nuvio.app.features.debrid.DebridSettingsRepository
import com.nuvio.app.features.debrid.DebridSettingsStorage
import com.nuvio.app.features.details.MetaScreenSettingsStorage
import com.nuvio.app.features.details.MetaScreenSettingsRepository
import com.nuvio.app.features.mdblist.MdbListMetadataService
import com.nuvio.app.features.mdblist.MdbListSettingsStorage
import com.nuvio.app.features.mdblist.MdbListSettingsRepository
import com.nuvio.app.features.notifications.EpisodeReleaseNotificationsRepository
import com.nuvio.app.features.p2p.P2pSettingsRepository
import com.nuvio.app.features.player.PlayerSettingsStorage
import com.nuvio.app.features.player.PlayerSettingsRepository
import com.nuvio.app.features.profiles.ProfileRepository
import com.nuvio.app.core.ui.CardDepthStyleRepository
import com.nuvio.app.core.ui.CardDepthStyleStorage
import com.nuvio.app.core.ui.PosterCardStyleRepository
import com.nuvio.app.core.poster.CustomPosterUrlRepository
import com.nuvio.app.core.poster.CustomPosterUrlStorage
import com.nuvio.app.core.ui.PosterCardStyleStorage
import com.nuvio.app.features.settings.ThemeSettingsStorage
import com.nuvio.app.features.settings.ThemeSettingsRepository
import com.nuvio.app.features.streams.StreamBadgeSettingsRepository
import com.nuvio.app.features.streams.StreamBadgeSettingsStorage
import com.nuvio.app.features.tmdb.TmdbSettingsStorage
import com.nuvio.app.features.tmdb.TmdbSettingsRepository
import com.nuvio.app.features.trakt.TraktCommentsStorage
import com.nuvio.app.features.trakt.TraktCommentsSettings
import com.nuvio.app.features.trakt.TraktSettingsStorage
import com.nuvio.app.features.tracking.TrackingSettingsRepository
import com.nuvio.app.features.watchprogress.ContinueWatchingPreferencesStorage
import com.nuvio.app.features.watchprogress.ContinueWatchingPreferencesRepository
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.rpc
import kotlin.concurrent.Volatile
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.put

private const val PUSH_DEBOUNCE_MS = 500L
private const val PRIMARY_PROFILE_ID = 1

object ProfileSettingsSync {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val log = Logger.withTag("ProfileSettingsSync")
    private val syncMutex = Mutex()
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    @Volatile
    private var isApplyingRemoteBlob: Boolean = false

    @Volatile
    private var isServerSyncInFlight: Boolean = false

    @Volatile
    private var skipNextPushSignature: String? = null

    /** Last TMDB preference payload written to (or read from) the kids profile's shared bucket. */
    @Volatile
    private var lastKidsTmdbSignature: String? = null

    private var observeJob: Job? = null

    private val profileSettingsPlatform: String
        get() = if (isDesktop) DESKTOP_SYNC_PLATFORM else MOBILE_SYNC_PLATFORM

    fun startObserving() {
        if (observeJob?.isActive == true) return
        ensureRepositoriesLoaded()
        ProviderCredentialSync.startObserving()
        MediaServerSync.startObserving()
        observeLocalChangesAndPush()
    }

    fun clearAccountState() {
        observeJob?.cancel()
        observeJob = null
        skipNextPushSignature = null
        lastKidsTmdbSignature = null
        ProviderCredentialSync.clearAccountState()
        MediaServerSync.clearAccountState()
    }

    fun onProfileChanged() {
        if (observeJob?.isActive != true) return
        skipNextPushSignature = currentObservedStateSignature()
        lastKidsTmdbSignature = null
        ProviderCredentialSync.onProfileChanged()
    }

    suspend fun pull(profileId: Int): Boolean {
        ensureRepositoriesLoaded()
        return syncMutex.withLock {
            if (ProfileRepository.activeProfileId != profileId) {
                log.d { "pull(profileId=$profileId) — skipped because profile is no longer active" }
                return@withLock false
            }
            isServerSyncInFlight = true
            try {
                val localBlob = exportSettingsBlob()
                if (ProfileRepository.activeProfileId != profileId) return@withLock false
                val localSignature = buildSignature(localBlob)

                val directRemoteJson = fetchRemoteSettingsJson(profileId)
                if (ProfileRepository.activeProfileId != profileId) return@withLock false
                val inheritedFromPrimary = directRemoteJson == null && profileId != PRIMARY_PROFILE_ID
                val remoteJson = directRemoteJson ?: if (inheritedFromPrimary) {
                    fetchRemoteSettingsJson(PRIMARY_PROFILE_ID)
                } else {
                    null
                }

                if (remoteJson == null) {
                    log.i { "pull(profileId=$profileId) — no remote settings blob found" }
                    return@withLock false
                }
                val effectiveRemoteJson = applyKidsTmdbShare(profileId, remoteJson, inheritedFromPrimary)

                isApplyingRemoteBlob = true
                try {
                    val remoteBlob = runCatching {
                        json.decodeFromJsonElement(MobileProfileSettingsBlob.serializer(), effectiveRemoteJson)
                    }.getOrElse { error ->
                        log.e(error) { "pull(profileId=$profileId) — failed to decode remote settings blob" }
                        return@withLock false
                    }
                    val remoteSignature = buildSignature(remoteBlob)
                    if (remoteSignature == localSignature) {
                        if (inheritedFromPrimary) {
                            pushToRemoteLocked(profileId, remoteBlob)
                            log.i { "pull(profileId=$profileId) — seeded matching settings from primary profile" }
                            return@withLock true
                        }
                        log.d { "pull(profileId=$profileId) — remote matches local" }
                        return@withLock false
                    }

                    if (ProfileRepository.activeProfileId != profileId) return@withLock false
                    applyRemoteBlob(remoteBlob)
                    skipNextPushSignature = currentObservedStateSignature()
                    if (inheritedFromPrimary) {
                        pushToRemoteLocked(profileId, remoteBlob)
                    }
                } finally {
                    isApplyingRemoteBlob = false
                }

                log.i {
                    if (inheritedFromPrimary) {
                        "pull(profileId=$profileId) — inherited and saved primary profile settings"
                    } else {
                        "pull(profileId=$profileId) — applied remote settings blob"
                    }
                }
                true
            } catch (error: Exception) {
                log.e(error) { "pull(profileId=$profileId) — FAILED" }
                false
            } finally {
                isServerSyncInFlight = false
            }
        }
    }

    suspend fun pushCurrentProfileToRemote(): Boolean {
        ensureRepositoriesLoaded()
        return syncMutex.withLock {
            runCatching {
                val profileId = ProfileRepository.activeProfileId
                val blob = exportSettingsBlob()
                if (ProfileRepository.activeProfileId != profileId) return@runCatching false
                pushToRemoteLocked(profileId, blob)
                publishKidsTmdbLocked(profileId)
                true
            }.onFailure { error ->
                log.e(error) { "pushCurrentProfileToRemote() — FAILED" }
            }.getOrDefault(false)
        }
    }

    /**
     * Seeds a newly-created profile with the complete settings snapshot of the
     * profile that is currently active. The destination profile does not need
     * to be selected, which prevents its default values from being observed and
     * pushed before inheritance has completed.
     */
    suspend fun seedProfileFromCurrent(profileId: Int): Boolean =
        seedProfileFrom(ProfileRepository.activeProfileId, profileId)

    /**
     * Copies the complete settings snapshot of [sourceProfileId] onto [profileId]
     * without selecting either profile. This is a one-time copy, not an ongoing
     * link: later changes stay independent.
     *
     * The active profile is exported from local state (including edits not pushed
     * yet). Any other source is read from its last cloud blob, falling back to the
     * primary profile's blob just like [pull] does when a profile has no row.
     */
    suspend fun seedProfileFrom(sourceProfileId: Int, profileId: Int): Boolean {
        ensureRepositoriesLoaded()
        return syncMutex.withLock {
            runCatching {
                if (sourceProfileId == profileId) return@runCatching false
                val blob = loadSourceSettingsBlob(sourceProfileId) ?: return@runCatching false
                pushToRemoteLocked(profileId, blob)
                log.i { "seedProfileFrom(source=$sourceProfileId, target=$profileId) — success" }
                true
            }.onFailure { error ->
                log.e(error) { "seedProfileFrom(source=$sourceProfileId, target=$profileId) — FAILED" }
            }.getOrDefault(false)
        }
    }

    private suspend fun loadSourceSettingsBlob(sourceProfileId: Int): MobileProfileSettingsBlob? {
        if (ProfileRepository.activeProfileId == sourceProfileId) {
            val blob = exportSettingsBlob()
            return blob.takeIf { ProfileRepository.activeProfileId == sourceProfileId }
        }
        val direct = fetchRemoteSettingsJson(sourceProfileId)
        val sourceJson = direct
            ?: if (sourceProfileId != PRIMARY_PROFILE_ID) fetchRemoteSettingsJson(PRIMARY_PROFILE_ID) else null
        if (sourceJson == null) {
            log.i { "seedProfileFrom(source=$sourceProfileId) — no settings blob found" }
            return null
        }
        return runCatching {
            json.decodeFromJsonElement(MobileProfileSettingsBlob.serializer(), sourceJson)
        }.getOrElse { error ->
            log.e(error) { "seedProfileFrom(source=$sourceProfileId) — failed to decode source settings" }
            null
        }
    }

    /**
     * Save the kids setup defaults to a platform-neutral TMDB bucket and to both platform blobs,
     * so desktop and mobile agree without copying either platform's unrelated UI settings.
     * Keys remain device-local or server-side; this bucket contains preferences only.
     */
    suspend fun syncKidsTmdbSettings(profileId: Int) {
        syncMutex.withLock {
            if (!isKidsProfile(profileId)) return@withLock
            val ownPlatform = profileSettingsPlatform
            val otherPlatform = if (ownPlatform == DESKTOP_SYNC_PLATFORM) MOBILE_SYNC_PLATFORM else DESKTOP_SYNC_PLATFORM
            val active = ProfileRepository.activeProfileId == profileId
            val ownBlob = if (active) {
                json.encodeToJsonElement(MobileProfileSettingsBlob.serializer(), exportSettingsBlob()) as JsonObject
            } else {
                fetchPlatformSettingsJson(profileId, ownPlatform)
            }
            val original = ownBlob ?: JsonObject(emptyMap())
            val enabled = kidsTmdbEnabledPreference(TmdbSettingsStorage.loadEnabledForProfile(profileId), original)
            val useCredits = kidsTmdbCreditsPreference(TmdbSettingsStorage.loadUseCreditsForProfile(profileId), original)
            val useProductions = kidsTmdbProductionPreference(TmdbSettingsStorage.loadUseProductionsForProfile(profileId), original, "tmdb_use_productions")
            val useNetworks = kidsTmdbProductionPreference(TmdbSettingsStorage.loadUseNetworksForProfile(profileId), original, "tmdb_use_networks")
            val shared = tmdbSettingsWithPreferences(tmdbSettingsFromProfileBlob(original), enabled, useCredits, useProductions, useNetworks)
            writeSharedKidsTmdb(profileId, shared)
            if (ownBlob != null) pushSettingsBlob(profileId, withSharedTmdbSettings(ownBlob, shared), ownPlatform)
            fetchPlatformSettingsJson(profileId, otherPlatform)?.let { otherBlob ->
                pushSettingsBlob(profileId, withSharedTmdbSettings(otherBlob, shared), otherPlatform)
            }
            TmdbSettingsStorage.saveKidsProfileSettings(profileId, null, enabled, useCredits, useProductions, useNetworks)
            rememberKidsTmdb(shared)
            if (active) TmdbSettingsRepository.onProfileChanged()
        }
    }

    @OptIn(FlowPreview::class)
    private fun observeLocalChangesAndPush() {
        val signatureFlows = listOf(
            ThemeSettingsRepository.selectedThemePreference.map { "theme" },
            ThemeSettingsRepository.customThemePreference.map { "custom_theme_colors" },
            ThemeSettingsRepository.amoledEnabled.map { "amoled" },
            ThemeSettingsRepository.liquidGlassNativeTabBarEnabled.map { "liquid_glass_tab_bar" },
            ThemeSettingsRepository.desktopNavigationLayout.map { "desktop_navigation_layout" },
            ThemeSettingsRepository.navBarGlowEnabled.map { "nav_bar_glow_enabled" },
            ThemeSettingsRepository.navBarStyle.map { "nav_bar_style" },
            PosterCardStyleRepository.uiState.map { "poster_card_style" },
            CustomPosterUrlRepository.pattern.map { "custom_poster_url" },
            CustomPosterUrlRepository.enabledScreens.map { "custom_poster_screens" },
            CardDepthStyleRepository.uiState.map { "card_depth_style" },
            PlayerSettingsRepository.uiState.map { "player" },
            StreamBadgeSettingsRepository.uiState.map { "stream_badges" },
            P2pSettingsRepository.uiState.map { "p2p" },
            DebridSettingsRepository.uiState.map { "debrid" },
            TmdbSettingsRepository.uiState.map { "tmdb" },
            MdbListSettingsRepository.uiState.map { "mdblist" },
            MetaScreenSettingsRepository.uiState.map { "meta" },
            CollectionMobileSettingsRepository.uiState.map { "collection_mobile_settings" },
            ContinueWatchingPreferencesRepository.uiState.map { "continue_watching" },
            TrackingSettingsRepository.uiState.map { "trakt_settings" },
            TraktCommentsSettings.enabled.map { "trakt_comments" },
            EpisodeReleaseNotificationsRepository.uiState.map { "episode_release_alerts" },
        )

        observeJob = scope.launch {
            combine(signatureFlows) { currentObservedStateSignature() }
                .distinctUntilChanged()
                .drop(1)
                .debounce(PUSH_DEBOUNCE_MS)
                .collect { signature ->
                    val authState = AuthRepository.state.value
                    if (authState !is AuthState.Authenticated || authState.isAnonymous) return@collect
                    if (isApplyingRemoteBlob || isServerSyncInFlight) return@collect
                    if (signature != currentObservedStateSignature()) return@collect
                    if (signature == skipNextPushSignature) {
                        skipNextPushSignature = null
                        return@collect
                    }
                    pushCurrentProfileToRemote()
                }
        }
    }

    private suspend fun pushToRemoteLocked(profileId: Int, blob: MobileProfileSettingsBlob) {
        val params = buildJsonObject {
            put("p_profile_id", profileId)
            put("p_platform", profileSettingsPlatform)
            put("p_settings_json", json.encodeToJsonElement(MobileProfileSettingsBlob.serializer(), blob))
            putSyncOriginClientId()
        }
        SupabaseProvider.client.postgrest.rpc("sync_push_profile_settings_blob", params)
        log.d { "pushToRemoteLocked(profileId=$profileId) — success" }
    }

    private suspend fun fetchRemoteSettingsJson(profileId: Int): JsonObject? =
        fetchPlatformSettingsJson(profileId, profileSettingsPlatform)

    private suspend fun fetchPlatformSettingsJson(profileId: Int, platform: String): JsonObject? {
        val params = buildJsonObject {
            put("p_profile_id", profileId)
            put("p_platform", platform)
        }
        val result = SupabaseProvider.client.postgrest.rpc("sync_pull_profile_settings_blob", params)
        return result.decodeList<SettingsBlobResponse>().firstOrNull()?.settingsJson
    }

    private fun isKidsProfile(profileId: Int): Boolean =
        ProfileRepository.state.value.profiles.firstOrNull { it.profileIndex == profileId }?.kidsEnabled == true

    private fun rememberKidsTmdb(settings: JsonObject) {
        lastKidsTmdbSignature = settings.toString()
    }

    private suspend fun pushSettingsBlob(profileId: Int, blob: JsonObject, platform: String) {
        SupabaseProvider.client.postgrest.rpc("sync_push_profile_settings_blob", buildJsonObject {
            put("p_profile_id", profileId)
            put("p_platform", platform)
            put("p_settings_json", blob)
            putSyncOriginClientId()
        })
    }

    private suspend fun writeSharedKidsTmdb(profileId: Int, settings: JsonObject) {
        pushSettingsBlob(profileId, sharedTmdbRecord(settings), KIDS_TMDB_SHARED_SYNC_PLATFORM)
    }

    /** Publish explicit kids opt-ins/opt-outs so the other platform agrees on its next pull. */
    private suspend fun publishKidsTmdbLocked(profileId: Int) {
        if (!isKidsProfile(profileId)) return
        val snapshot = TmdbSettingsRepository.snapshot()
        val settings = tmdbSettingsWithPreferences(
            TmdbSettingsStorage.exportToSyncPayload(),
            snapshot.enabled,
            snapshot.useCredits,
        )
        if (settings.toString() == lastKidsTmdbSignature) return
        writeSharedKidsTmdb(profileId, settings)
        rememberKidsTmdb(settings)
    }

    /**
     * Overlay the shared kids TMDB preferences onto this platform's blob. When the shared bucket
     * does not exist yet, migrate legacy platform blobs first: any explicit "on"/"casts off"
     * wins over a copied default from the other platform, and missing preferences use the kids
     * setup defaults (enrichment on, cast/credits off).
     */
    private suspend fun applyKidsTmdbShare(
        profileId: Int,
        remoteJson: JsonObject,
        remoteIsInherited: Boolean,
    ): JsonObject {
        if (!isKidsProfile(profileId)) return remoteJson
        return runCatching {
            val shared = sharedTmdbSettings(fetchPlatformSettingsJson(profileId, KIDS_TMDB_SHARED_SYNC_PLATFORM))
            if (shared != null) {
                rememberKidsTmdb(shared)
                return@runCatching withSharedTmdbSettings(remoteJson, shared)
            }
            val platformBlobs = listOf(DESKTOP_SYNC_PLATFORM, MOBILE_SYNC_PLATFORM).mapNotNull { platform ->
                if (platform == profileSettingsPlatform) {
                    remoteJson.takeUnless { remoteIsInherited }
                } else {
                    fetchPlatformSettingsJson(profileId, platform)
                }
            }
            val (enabled, useCredits) = legacyKidsTmdbPreferences(platformBlobs)
            val migrated = tmdbSettingsWithPreferences(
                tmdbSettingsFromProfileBlob(remoteJson),
                enabled,
                useCredits,
            )
            writeSharedKidsTmdb(profileId, migrated)
            rememberKidsTmdb(migrated)
            log.i { "pull(profileId=$profileId) — migrated kids TMDB preferences to the shared bucket" }
            withSharedTmdbSettings(remoteJson, migrated)
        }.getOrElse { error ->
            log.w(error) { "pull(profileId=$profileId) — kids TMDB shared settings could not be applied" }
            remoteJson
        }
    }

    private fun exportSettingsBlob(): MobileProfileSettingsBlob {
        ensureRepositoriesLoaded()
        return MobileProfileSettingsBlob(
            features = MobileProfileSettingsFeatures(
                themeSettings = ThemeSettingsStorage.exportToSyncPayload(),
                posterCardStyleSettingsPayload = PosterCardStyleStorage.loadPayload().orEmpty().trim(),
                customPosterUrlPattern = CustomPosterUrlStorage.loadPattern().orEmpty().trim(),
                customPosterEnabledScreens = CustomPosterUrlStorage.loadEnabledScreens()
                    ?.joinToString(",").orEmpty(),
                cardDepthStyleSettingsPayload = CardDepthStyleStorage.loadPayload().orEmpty().trim(),
                playerSettings = withoutProfileCredentials(
                    PROFILE_PLAYER_SETTINGS_FEATURE,
                    PlayerSettingsStorage.exportToSyncPayload(),
                ),
                streamBadgeSettings = StreamBadgeSettingsStorage.exportToSyncPayload(),
                p2pSettings = P2pSettingsPayload.from(P2pSettingsRepository.uiState.value),
                debridSettings = withoutProfileCredentials(
                    PROFILE_DEBRID_SETTINGS_FEATURE,
                    DebridSettingsStorage.exportToSyncPayload(),
                ),
                tmdbSettings = withoutProfileCredentials(
                    PROFILE_TMDB_SETTINGS_FEATURE,
                    TmdbSettingsStorage.exportToSyncPayload(),
                ),
                mdbListSettings = withoutProfileCredentials(
                    PROFILE_MDBLIST_SETTINGS_FEATURE,
                    MdbListSettingsStorage.exportToSyncPayload(),
                ),
                metaScreenSettingsPayload = MetaScreenSettingsStorage.loadPayload().orEmpty().trim(),
                collectionMobileSettingsPayload = CollectionMobileSettingsStorage.loadPayload().orEmpty().trim(),
                continueWatchingSettingsPayload = ContinueWatchingPreferencesStorage.loadPayload().orEmpty().trim(),
                traktSettingsPayload = TraktSettingsStorage.loadPayload().orEmpty().trim(),
                traktCommentsSettings = TraktCommentsStorage.exportToSyncPayload(),
                notificationsSettings = NotificationsSettingsPayload(
                    episodeReleaseAlertsEnabled = EpisodeReleaseNotificationsRepository.uiState.value.isEnabled,
                ),
            ),
        )
    }

    private fun applyRemoteBlob(blob: MobileProfileSettingsBlob) {
        ThemeSettingsStorage.replaceFromSyncPayload(blob.features.themeSettings)
        ThemeSettingsRepository.onProfileChanged()

        PosterCardStyleStorage.savePayload(blob.features.posterCardStyleSettingsPayload)
        PosterCardStyleRepository.onProfileChanged()

        CustomPosterUrlStorage.savePattern(blob.features.customPosterUrlPattern.ifBlank { null })
        val remoteScreenKeys = blob.features.customPosterEnabledScreens
            .takeIf { it.isNotBlank() }
            ?.split(",")
            ?.toSet()
        CustomPosterUrlStorage.saveEnabledScreens(remoteScreenKeys)
        CustomPosterUrlRepository.onProfileChanged()
        com.nuvio.app.features.home.HomeRepository.applyCurrentSettings()

        CardDepthStyleStorage.savePayload(blob.features.cardDepthStyleSettingsPayload)
        CardDepthStyleRepository.onProfileChanged()

        val localPlayerSettings = PlayerSettingsStorage.exportToSyncPayload()
        val localIntroDbApiKey = PlayerSettingsStorage.loadIntroDbApiKey()
        PlayerSettingsStorage.replaceFromSyncPayload(
            preservingLocalProfileCredentials(
                PROFILE_PLAYER_SETTINGS_FEATURE,
                blob.features.playerSettings,
                localPlayerSettings,
            ),
        )
        localIntroDbApiKey?.let(PlayerSettingsStorage::saveIntroDbApiKey)
        PlayerSettingsRepository.onProfileChanged()

        StreamBadgeSettingsStorage.replaceFromSyncPayload(blob.features.streamBadgeSettings)
        StreamBadgeSettingsRepository.onProfileChanged()

        blob.features.p2pSettings?.let { settings ->
            P2pSettingsRepository.setP2pEnabled(settings.p2pEnabled)
            P2pSettingsRepository.setEnableUpload(settings.enableUpload)
            P2pSettingsRepository.setHideTorrentStats(settings.hideTorrentStats)
        }

        DebridSettingsStorage.replaceFromSyncPayload(
            preservingLocalProfileCredentials(
                PROFILE_DEBRID_SETTINGS_FEATURE,
                blob.features.debridSettings,
                DebridSettingsStorage.exportToSyncPayload(),
            ),
        )
        DebridSettingsRepository.onProfileChanged()

        TmdbSettingsStorage.replaceFromSyncPayload(
            preservingLocalProfileCredentials(
                PROFILE_TMDB_SETTINGS_FEATURE,
                blob.features.tmdbSettings,
                TmdbSettingsStorage.exportToSyncPayload(),
            ),
        )
        TmdbSettingsRepository.onProfileChanged()

        MdbListSettingsStorage.replaceFromSyncPayload(
            preservingLocalProfileCredentials(
                PROFILE_MDBLIST_SETTINGS_FEATURE,
                blob.features.mdbListSettings,
                MdbListSettingsStorage.exportToSyncPayload(),
            ),
        )
        MdbListMetadataService.clearCache()
        MdbListSettingsRepository.onProfileChanged()

        MetaScreenSettingsStorage.savePayload(blob.features.metaScreenSettingsPayload)
        MetaScreenSettingsRepository.onProfileChanged()

        CollectionMobileSettingsStorage.savePayload(blob.features.collectionMobileSettingsPayload)
        CollectionMobileSettingsRepository.onProfileChanged()

        ContinueWatchingPreferencesStorage.savePayload(blob.features.continueWatchingSettingsPayload)
        ContinueWatchingPreferencesRepository.onProfileChanged()

        TraktSettingsStorage.savePayload(blob.features.traktSettingsPayload)
        TrackingSettingsRepository.onProfileChanged()

        TraktCommentsStorage.replaceFromSyncPayload(blob.features.traktCommentsSettings)
        TraktCommentsSettings.onProfileChanged()

        EpisodeReleaseNotificationsRepository.applyFromSyncEnabled(blob.features.notificationsSettings.episodeReleaseAlertsEnabled)
    }

    private fun ensureRepositoriesLoaded() {
        ThemeSettingsRepository.ensureLoaded()
        PosterCardStyleRepository.ensureLoaded()
        CustomPosterUrlRepository.ensureLoaded()
        CardDepthStyleRepository.ensureLoaded()
        PlayerSettingsRepository.ensureLoaded()
        StreamBadgeSettingsRepository.ensureLoaded()
        P2pSettingsRepository.ensureLoaded()
        DebridSettingsRepository.ensureLoaded()
        TmdbSettingsRepository.ensureLoaded()
        MdbListSettingsRepository.ensureLoaded()
        MetaScreenSettingsRepository.ensureLoaded()
        CollectionMobileSettingsRepository.ensureLoaded()
        ContinueWatchingPreferencesRepository.ensureLoaded()
        TrackingSettingsRepository.ensureLoaded()
        TraktCommentsSettings.ensureLoaded()
        EpisodeReleaseNotificationsRepository.ensureLoaded()
    }

    private fun buildSignature(blob: MobileProfileSettingsBlob): String =
        json.encodeToString(MobileProfileSettingsBlob.serializer(), blob)

    private fun currentObservedStateSignature(): String = listOf(
        "theme=${ThemeSettingsRepository.selectedThemePreference.value?.name}",
        "custom_theme_colors=${ThemeSettingsRepository.customThemePreference.value}",
        "amoled=${ThemeSettingsRepository.amoledEnabled.value}",
        "liquid_glass_tab_bar=${ThemeSettingsRepository.liquidGlassNativeTabBarEnabled.value}",
        "desktop_navigation_layout=${ThemeSettingsRepository.desktopNavigationLayout.value.name}",
        "nav_bar_glow_enabled=${ThemeSettingsRepository.navBarGlowEnabled.value}",
        "nav_bar_style=${ThemeSettingsRepository.navBarStyle.value.key}",
        "poster_card_style=${PosterCardStyleRepository.uiState.value}",
        "custom_poster_url=${CustomPosterUrlRepository.pattern.value}",
        "card_depth_style=${CardDepthStyleRepository.uiState.value}",
        "player=${PlayerSettingsRepository.uiState.value}",
        "stream_badges=${StreamBadgeSettingsRepository.uiState.value}",
        "p2p=${P2pSettingsRepository.uiState.value}",
        "debrid=${DebridSettingsRepository.uiState.value}",
        "tmdb=${TmdbSettingsRepository.uiState.value}",
        "mdblist=${MdbListSettingsRepository.uiState.value}",
        "meta=${MetaScreenSettingsRepository.uiState.value}",
        "collection_mobile_settings=${CollectionMobileSettingsRepository.uiState.value}",
        "continue=${ContinueWatchingPreferencesRepository.uiState.value}",
        "trakt_settings=${TrackingSettingsRepository.uiState.value}",
        "trakt_comments=${TraktCommentsSettings.enabled.value}",
        "episode_release_alerts=${EpisodeReleaseNotificationsRepository.uiState.value.isEnabled}",
    ).joinToString(separator = "||")

}

@Serializable
private data class MobileProfileSettingsBlob(
    val version: Int = 4,
    val features: MobileProfileSettingsFeatures = MobileProfileSettingsFeatures(),
)

@Serializable
private data class MobileProfileSettingsFeatures(
    @SerialName("theme_settings") val themeSettings: JsonObject = JsonObject(emptyMap()),
    @SerialName("poster_card_style_settings_payload") val posterCardStyleSettingsPayload: String = "",
    @SerialName("custom_poster_url_pattern") val customPosterUrlPattern: String = "",
    @SerialName("custom_poster_enabled_screens") val customPosterEnabledScreens: String = "",
    @SerialName("card_depth_style_settings_payload") val cardDepthStyleSettingsPayload: String = "",
    @SerialName("player_settings") val playerSettings: JsonObject = JsonObject(emptyMap()),
    @SerialName("stream_badge_settings") val streamBadgeSettings: JsonObject = JsonObject(emptyMap()),
    @SerialName("p2p_settings") val p2pSettings: P2pSettingsPayload? = null,
    @SerialName("debrid_settings") val debridSettings: JsonObject = JsonObject(emptyMap()),
    @SerialName("tmdb_settings") val tmdbSettings: JsonObject = JsonObject(emptyMap()),
    @SerialName("mdblist_settings") val mdbListSettings: JsonObject = JsonObject(emptyMap()),
    @SerialName("meta_screen_settings_payload") val metaScreenSettingsPayload: String = "",
    @SerialName("collection_mobile_settings_payload") val collectionMobileSettingsPayload: String = "",
    @SerialName("continue_watching_settings_payload") val continueWatchingSettingsPayload: String = "",
    @SerialName("trakt_settings_payload") val traktSettingsPayload: String = "",
    @SerialName("trakt_comments_settings") val traktCommentsSettings: JsonObject = JsonObject(emptyMap()),
    @SerialName("notifications_settings") val notificationsSettings: NotificationsSettingsPayload = NotificationsSettingsPayload(),
)

@Serializable
private data class P2pSettingsPayload(
    @SerialName("p2p_enabled") val p2pEnabled: Boolean = false,
    @SerialName("enable_upload") val enableUpload: Boolean = true,
    @SerialName("hide_torrent_stats") val hideTorrentStats: Boolean = true,
) {
    companion object {
        fun from(settings: com.nuvio.app.features.p2p.P2pSettingsUiState): P2pSettingsPayload =
            P2pSettingsPayload(
                p2pEnabled = settings.p2pEnabled,
                enableUpload = settings.enableUpload,
                hideTorrentStats = settings.hideTorrentStats,
            )
    }
}

@Serializable
private data class NotificationsSettingsPayload(
    @SerialName("episode_release_alerts_enabled") val episodeReleaseAlertsEnabled: Boolean = false,
)

@Serializable
private data class SettingsBlobResponse(
    @SerialName("profile_id") val profileId: Int = 0,
    @SerialName("settings_json") val settingsJson: JsonObject? = null,
    @SerialName("updated_at") val updatedAt: String? = null,
)
