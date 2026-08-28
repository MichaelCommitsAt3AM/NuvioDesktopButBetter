package com.nuvio.app.features.home

import co.touchlab.kermit.Logger
import com.nuvio.app.core.auth.AuthRepository
import com.nuvio.app.core.auth.AuthState
import com.nuvio.app.core.network.SupabaseProvider
import com.nuvio.app.core.sync.HOME_CATALOG_SHARED_SYNC_PLATFORM
import com.nuvio.app.core.sync.putSyncOriginClientId
import com.nuvio.app.features.profiles.ProfileRepository
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.rpc
import kotlin.concurrent.Volatile
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put

@Serializable
data class SyncCatalogItem(
    @SerialName("addon_id") val addonId: String,
    val type: String,
    @SerialName("catalog_id") val catalogId: String,
    val enabled: Boolean = true,
    val order: Int = 0,
    @SerialName("custom_title") val customTitle: String = "",
    @SerialName("is_collection") val isCollection: Boolean = false,
    @SerialName("collection_id") val collectionId: String = "",
    val key: String = "",
)

@Serializable
data class SyncHomeCatalogPayload(
    @SerialName("show_catalog_type") val showCatalogType: Boolean = true,
    @SerialName("hide_unreleased_content") val hideUnreleasedContent: Boolean = false,
    val items: List<SyncCatalogItem> = emptyList(),
)

@Serializable
private data class SupabaseHomeCatalogSettingsBlob(
    @SerialName("profile_id") val profileId: Int = 1,
    @SerialName("settings_json") val settingsJson: JsonObject = buildJsonObject { },
)

private data class PullToken(
    val userId: String,
    val profileId: Int,
)

private data class CachedSharedSettings(
    val token: PullToken,
    val settingsJson: JsonObject,
)

internal fun mergeHomeCatalogSettingsJson(
    remoteJson: JsonObject?,
    localJson: JsonObject,
): JsonObject = buildJsonObject {
    remoteJson?.forEach { (key, value) -> put(key, value) }
    localJson.forEach { (key, value) -> put(key, value) }
}

object HomeCatalogSettingsSyncService {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val log = Logger.withTag("HomeCatalogSettingsSyncService")
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    private const val HIDE_UNRELEASED_CONTENT_KEY = "hide_unreleased_content"
    private const val SHOW_CATALOG_TYPE_KEY = "show_catalog_type"
    private const val PRIMARY_PROFILE_ID = 1

    @Volatile
    var isSyncingFromRemote: Boolean = false

    private var pushJob: Job? = null

    @Volatile
    private var completedInitialPull: PullToken? = null

    @Volatile
    private var cachedSharedSettings: CachedSharedSettings? = null

    suspend fun pullFromServer(profileId: Int) {
        runCatching {
            val pullToken = currentPullToken(profileId) ?: return
            val localPayload = HomeCatalogSettingsRepository.exportToSyncPayload()
            val directBlob = fetchRemoteBlob(profileId)
            cachedSharedSettings = CachedSharedSettings(
                token = pullToken,
                settingsJson = directBlob?.settingsJson ?: buildJsonObject { },
            )
            // A secondary profile with no home-catalog row of its own yet inherits the primary
            // profile's layout and seeds its own row with it, instead of falling back to stock
            // defaults. Same intent as ProfileSettingsSync.seedProfileFromCurrent, but this also
            // covers profiles created before the seeding path existed.
            val inheritedFromPrimary = directBlob == null && profileId != PRIMARY_PROFILE_ID
            val remoteBlob = directBlob
                ?: if (inheritedFromPrimary) fetchRemoteBlob(PRIMARY_PROFILE_ID) else null
            val remotePayload = remoteBlob?.let { blob ->
                decodePayloadPreservingLocalDefaults(blob.settingsJson, localPayload)
            }

            if (remoteBlob == null) {
                log.i { "pullFromServer — no remote home catalog settings found; preserving local" }
                markInitialPullComplete(pullToken)
                return
            }

            if (remotePayload == null) {
                log.w { "pullFromServer — failed to parse remote home catalog settings" }
                markInitialPullComplete(pullToken)
                return
            }

            if (remotePayload.items.isEmpty()) {
                log.i { "pullFromServer — remote has empty items, preserving local catalog order" }
                applyRemotePayload(remotePayload)
                if (inheritedFromPrimary) seedInheritedPayload(pullToken, remotePayload)
                markInitialPullComplete(pullToken)
                return
            }

            applyRemotePayload(remotePayload)
            if (inheritedFromPrimary) {
                seedInheritedPayload(pullToken, remotePayload)
                log.i { "pullFromServer — inherited ${remotePayload.items.size} items from primary profile" }
            } else {
                log.i { "pullFromServer — applied ${remotePayload.items.size} items from remote" }
            }
            markInitialPullComplete(pullToken)
        }.onFailure { e ->
            isSyncingFromRemote = false
            log.e(e) { "pullFromServer — FAILED" }
        }
    }

    fun triggerPush() {
        val requestedToken = currentPullToken()
        if (requestedToken == null || !hasCompletedInitialPull(requestedToken)) {
            log.d { "triggerPush — skipped before initial home catalog pull completed" }
            return
        }
        pushJob?.cancel()
        pushJob = scope.launch {
            delay(500)
            if (isSyncingFromRemote) return@launch
            if (currentPullToken() != requestedToken) return@launch
            pushToRemote(requestedToken)
        }
    }

    /**
     * Seeds a newly-created profile with the home catalog layout of the profile that is
     * currently active, so it doesn't start on stock defaults. The destination profile does
     * not need to be selected. Mirrors ProfileSettingsSync.seedProfileFromCurrent.
     */
    suspend fun seedProfileFromCurrent(profileId: Int): Boolean = runCatching {
        val sourceProfileId = ProfileRepository.activeProfileId
        if (sourceProfileId == profileId || currentPullToken(sourceProfileId) == null) {
            return@runCatching false
        }

        val payload = HomeCatalogSettingsRepository.exportToSyncPayload()
        if (ProfileRepository.activeProfileId != sourceProfileId) return@runCatching false
        pushPayloadToRemote(profileId, payload)
        log.i { "seedProfileFromCurrent(source=$sourceProfileId, target=$profileId) — success" }
        true
    }.onFailure { error ->
        log.e(error) { "seedProfileFromCurrent(profileId=$profileId) — FAILED" }
    }.getOrDefault(false)

    private suspend fun seedInheritedPayload(token: PullToken, payload: SyncHomeCatalogPayload) {
        // Refresh the cache with what was actually written, so the next triggerPush for this
        // profile merges against its now-populated row instead of the empty blob recorded when
        // the pull found nothing.
        val seeded = pushPayloadToRemote(token.profileId, payload)
        cachedSharedSettings = CachedSharedSettings(token = token, settingsJson = seeded)
    }

    /**
     * Pushes to an arbitrary profile's row. Deliberately re-fetches that profile's blob rather
     * than reusing [cachedSharedSettings], which belongs to the *active* profile's pull — merging
     * the active profile's foreign keys into another profile's row would cross-contaminate them.
     */
    private suspend fun pushPayloadToRemote(
        profileId: Int,
        payload: SyncHomeCatalogPayload,
    ): JsonObject {
        val localJson = json.encodeToJsonElement(SyncHomeCatalogPayload.serializer(), payload).jsonObject
        val remoteJson = fetchRemoteBlob(profileId)?.settingsJson
        val jsonElement = mergeHomeCatalogSettingsJson(remoteJson = remoteJson, localJson = localJson)
        val params = buildJsonObject {
            put("p_profile_id", profileId)
            put("p_platform", HOME_CATALOG_SHARED_SYNC_PLATFORM)
            put("p_settings_json", jsonElement)
            putSyncOriginClientId()
        }
        SupabaseProvider.client.postgrest.rpc("sync_push_home_catalog_settings", params)
        return jsonElement
    }

    private suspend fun pushToRemote(token: PullToken) {
        runCatching {
            val payload = HomeCatalogSettingsRepository.exportToSyncPayload()
            val jsonElement = mergedSharedPayloadJson(token, payload)

            val params = buildJsonObject {
                put("p_profile_id", token.profileId)
                put("p_platform", HOME_CATALOG_SHARED_SYNC_PLATFORM)
                put("p_settings_json", jsonElement)
                putSyncOriginClientId()
            }
            SupabaseProvider.client.postgrest.rpc("sync_push_home_catalog_settings", params)
            cachedSharedSettings = CachedSharedSettings(token = token, settingsJson = jsonElement)
            log.d { "pushToRemote — success" }
        }.onFailure { e ->
            log.e(e) { "pushToRemote — FAILED" }
        }
    }

    private fun currentPullToken(profileId: Int = ProfileRepository.activeProfileId): PullToken? {
        val authState = AuthRepository.state.value
        if (authState !is AuthState.Authenticated || authState.isAnonymous) return null
        return PullToken(
            userId = authState.userId,
            profileId = profileId,
        )
    }

    private fun hasCompletedInitialPull(token: PullToken): Boolean =
        completedInitialPull == token

    private fun markInitialPullComplete(token: PullToken) {
        completedInitialPull = token
    }

    private fun applyRemotePayload(
        payload: SyncHomeCatalogPayload,
    ) {
        isSyncingFromRemote = true
        try {
            HomeCatalogSettingsRepository.applyFromRemote(payload)
        } finally {
            isSyncingFromRemote = false
        }
    }

    private suspend fun fetchRemoteBlob(
        profileId: Int,
    ): SupabaseHomeCatalogSettingsBlob? {
        val params = buildJsonObject {
            put("p_profile_id", profileId)
            put("p_platform", HOME_CATALOG_SHARED_SYNC_PLATFORM)
        }
        val result = SupabaseProvider.client.postgrest.rpc("sync_pull_home_catalog_settings", params)
        return result.decodeList<SupabaseHomeCatalogSettingsBlob>().firstOrNull()
    }

    private fun decodePayloadPreservingLocalDefaults(
        settingsJson: JsonObject,
        localPayload: SyncHomeCatalogPayload,
    ): SyncHomeCatalogPayload? = runCatching {
        val decoded = json.decodeFromJsonElement(SyncHomeCatalogPayload.serializer(), settingsJson)
        decoded.copy(
            showCatalogType = if (settingsJson.containsKey(SHOW_CATALOG_TYPE_KEY)) {
                decoded.showCatalogType
            } else {
                localPayload.showCatalogType
            },
            hideUnreleasedContent = if (settingsJson.containsKey(HIDE_UNRELEASED_CONTENT_KEY)) {
                decoded.hideUnreleasedContent
            } else {
                localPayload.hideUnreleasedContent
            },
        )
    }.getOrNull()

    private fun mergedSharedPayloadJson(
        token: PullToken,
        payload: SyncHomeCatalogPayload,
    ): JsonObject {
        val localJson = json.encodeToJsonElement(SyncHomeCatalogPayload.serializer(), payload).jsonObject
        val remoteJson = cachedSharedSettings
            ?.takeIf { cached -> cached.token == token }
            ?.settingsJson
        return mergeHomeCatalogSettingsJson(remoteJson = remoteJson, localJson = localJson)
    }
}
