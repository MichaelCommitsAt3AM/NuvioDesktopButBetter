package com.nuvio.app.features.addons

import co.touchlab.kermit.Logger
import com.nuvio.app.core.network.SupabaseProvider
import com.nuvio.app.core.auth.AuthRepository
import com.nuvio.app.core.auth.isAnonymous
import com.nuvio.app.core.sync.putSyncOriginClientId
import com.nuvio.app.features.profiles.ProfileRepository
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Order
import io.github.jan.supabase.postgrest.rpc
import kotlinx.atomicfu.locks.SynchronizedObject
import kotlinx.atomicfu.locks.synchronized
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.put
import nuvio.composeapp.generated.resources.*
import org.jetbrains.compose.resources.getString

@Serializable
private data class AddonRow(
    val url: String,
    val name: String? = null,
    val enabled: Boolean = true,
    @SerialName("sort_order") val sortOrder: Int = 0,
)

@Serializable
private data class AddonPushItem(
    val url: String,
    val name: String = "",
    val enabled: Boolean = true,
    @SerialName("sort_order") val sortOrder: Int = 0,
)

object AddonRepository {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val log = Logger.withTag("AddonRepository")
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }
    private val _uiState = MutableStateFlow(AddonsUiState())
    val uiState: StateFlow<AddonsUiState> = _uiState.asStateFlow()

    // Guards initialized/pulledFromServer/currentProfileId/activeRefreshJobs, all of which
    // are read and mutated from multiple call sites (initialize, onProfileChanged,
    // pullFromServer, refreshAddon, ...) invoked concurrently on Dispatchers.Default's
    // multi-threaded pool. Never held across a suspension point.
    private val stateLock = SynchronizedObject()
    private var initialized = false
    private var pulledFromServer = false
    private var currentProfileId: Int = 1
    private val activeRefreshJobs = mutableMapOf<String, Job>()

    fun initialize() {
        val effectiveProfileId = ProfileRepository.activeProfileId
        val shouldProceed = synchronized(stateLock) {
            if (initialized) {
                false
            } else {
                initialized = true
                currentProfileId = effectiveProfileId
                true
            }
        }
        if (!shouldProceed) return
        log.d { "initialize() — loading local addons for profile $currentProfileId" }

        val storedUrls = dedupeManifestUrls(AddonStorage.loadInstalledAddonUrls(currentProfileId))
        val enabledByUrl = loadLocalEnabledStates()
        log.d { "initialize() — local addon count: ${storedUrls.size}" }
        if (storedUrls.isEmpty()) return

        val existingByUrl = _uiState.value.addons.associateBy(ManagedAddon::manifestUrl)
        _uiState.value = AddonsUiState(
            addons = storedUrls.map { manifestUrl ->
                existingByUrl[manifestUrl].toPendingAddon(
                    manifestUrl = manifestUrl,
                    enabled = enabledByUrl[manifestUrl],
                )
            },
        )

        storedUrls.forEach { manifestUrl ->
            val existing = existingByUrl[manifestUrl]
            val addon = _uiState.value.addons.firstOrNull { it.manifestUrl == manifestUrl }
            if (addon?.enabled == true && (existing == null || (addon.manifest == null && !addon.isRefreshing))) {
                refreshAddon(manifestUrl)
            }
        }
    }

    fun onProfileChanged(profileId: Int) {
        val effectiveProfileId = profileId
        val shouldReset = synchronized(stateLock) {
            if (effectiveProfileId == currentProfileId && initialized) {
                false
            } else {
                cancelActiveRefreshesLocked()
                currentProfileId = effectiveProfileId
                initialized = false
                pulledFromServer = false
                true
            }
        }
        if (!shouldReset) return
        _uiState.value = AddonsUiState()
    }

    fun clearLocalState() {
        synchronized(stateLock) {
            cancelActiveRefreshesLocked()
            currentProfileId = 1
            initialized = false
            pulledFromServer = false
        }
        _uiState.value = AddonsUiState()
    }

    // Deleted profile indices get reused by createProfile(), so leftover local addon
    // data must be wiped or it gets "migrated" back to the server for the new profile
    // that inherits the same index (see the local-fallback branch in pullFromServer).
    fun clearLocalDataForDeletedProfile(profileId: Int) {
        AddonStorage.saveInstalledAddonUrls(profileId, emptyList())
        AddonStorage.saveAddonEnabledStates(profileId, emptyMap())
    }

    suspend fun pullFromServer(profileId: Int) {
        val effectiveProfileId = profileId
        val (wasInitialized, wasPulledFromServer) = synchronized(stateLock) {
            currentProfileId = effectiveProfileId
            initialized to pulledFromServer
        }
        log.i { "pullFromServer() — profileId=$profileId, initialized=$wasInitialized, pulledFromServer=$wasPulledFromServer" }
        runCatching {
            val rows = SupabaseProvider.client.postgrest
                .from("addons")
                .select {
                    filter { eq("profile_id", effectiveProfileId) }
                    order("sort_order", Order.ASCENDING)
                }
                .decodeList<AddonRow>()

            val rowsByUrl = linkedMapOf<String, AddonRow>()
            rows.forEach { row ->
                val manifestUrl = ensureManifestSuffix(row.url)
                if (!rowsByUrl.containsKey(manifestUrl)) {
                    rowsByUrl[manifestUrl] = row.copy(url = manifestUrl)
                }
            }

            val urls = rowsByUrl.keys.toList()
            log.i { "pullFromServer() — server returned ${rows.size} addons" }
            urls.forEachIndexed { i, u -> log.d { "  server[$i]: $u" } }

            if (urls.isEmpty() && !wasPulledFromServer) {
                val localUrls = dedupeManifestUrls(AddonStorage.loadInstalledAddonUrls(effectiveProfileId))
                log.i { "pullFromServer() — server empty, local has ${localUrls.size} addons" }
                if (localUrls.isNotEmpty()) {
                    log.i { "pullFromServer() — migrating local addons to server for profile $effectiveProfileId" }
                    initialize()
                    synchronized(stateLock) { pulledFromServer = true }
                    val enabledByUrl = loadLocalEnabledStates()
                    val addons = localUrls.mapIndexed { index, addonUrl ->
                        val manifestUrl = ensureManifestSuffix(addonUrl)
                        AddonPushItem(
                            url = manifestUrl,
                            name = _uiState.value.addons
                                .find { it.manifestUrl == manifestUrl }?.manifest?.name ?: "",
                            enabled = enabledByUrl[manifestUrl]
                                ?: _uiState.value.addons.find { it.manifestUrl == manifestUrl }?.enabled
                                ?: true,
                            sortOrder = index,
                        )
                    }
                    val params = buildJsonObject {
                        put("p_profile_id", effectiveProfileId)
                        put("p_addons", json.encodeToJsonElement(addons))
                        putSyncOriginClientId()
                    }
                    SupabaseProvider.client.postgrest.rpc("sync_push_addons", params)
                    log.i { "pullFromServer() — migration push done (${addons.size} addons)" }
                    return
                }
            }

            if (urls.isEmpty()) {
                val localUrls = dedupeManifestUrls(AddonStorage.loadInstalledAddonUrls(effectiveProfileId))
                if (localUrls.isNotEmpty()) {
                    log.w { "pullFromServer() — remote empty while local has ${localUrls.size} addons; preserving local addons" }
                    val enabledByUrl = loadLocalEnabledStates()
                    val existingByUrl = _uiState.value.addons.associateBy(ManagedAddon::manifestUrl)
                    _uiState.value = AddonsUiState(
                        addons = localUrls.map { url ->
                            existingByUrl[url].toPendingAddon(
                                manifestUrl = url,
                                enabled = enabledByUrl[url],
                            )
                        },
                    )
                    persist()
                    localUrls.forEach { url ->
                        val existing = existingByUrl[url]
                        val addon = _uiState.value.addons.firstOrNull { it.manifestUrl == url }
                        if (addon?.enabled == true && (existing == null || (addon.manifest == null && !addon.isRefreshing))) {
                            refreshAddon(url)
                        }
                    }
                    synchronized(stateLock) {
                        pulledFromServer = true
                        initialized = true
                    }
                    return
                }
            }

            val existingByUrl = _uiState.value.addons.associateBy(ManagedAddon::manifestUrl)
            _uiState.value = AddonsUiState(
                addons = urls.map { url ->
                    val row = rowsByUrl[url]
                    existingByUrl[url].toPendingAddon(
                        manifestUrl = url,
                        userSetName = row?.name?.takeIf { it.isNotBlank() },
                        enabled = row?.enabled,
                    )
                },
            )
            persist()
            urls.forEach { url ->
                val existing = existingByUrl[url]
                val addon = _uiState.value.addons.firstOrNull { it.manifestUrl == url }
                if (addon?.enabled == true && (existing == null || (addon.manifest == null && !addon.isRefreshing))) {
                    refreshAddon(url)
                }
            }
            synchronized(stateLock) {
                pulledFromServer = true
                initialized = true
            }
            log.i { "pullFromServer() — applied ${urls.size} addons to state" }
        }.onFailure { e ->
            log.e(e) { "pullFromServer() — FAILED" }
        }
    }

    suspend fun awaitManifestsLoaded() {
        if (_uiState.value.addons.isEmpty()) return
        uiState.first { state ->
            state.addons.isEmpty() ||
                state.addons.any { it.manifest != null } ||
                state.addons.none { it.isRefreshing }
        }
    }

    suspend fun addAddon(rawUrl: String): AddAddonResult {
        log.i { "addAddon() — rawUrl=$rawUrl" }
        val manifestUrl = try {
            normalizeManifestUrl(rawUrl)
        } catch (error: IllegalArgumentException) {
            return AddAddonResult.Error(error.message ?: getString(Res.string.addon_invalid_url))
        }

        if (_uiState.value.addons.any { it.manifestUrl == manifestUrl }) {
            return AddAddonResult.Error(getString(Res.string.addon_already_installed))
        }

        val manifest = try {
            withContext(Dispatchers.Default) {
                val payload = httpGetText(manifestUrl)
                AddonManifestParser.parse(
                    manifestUrl = manifestUrl,
                    payload = payload,
                )
            }
        } catch (error: Throwable) {
            return AddAddonResult.Error(error.message ?: getString(Res.string.addon_load_manifest_failed))
        }

        _uiState.update { current ->
            current.copy(
                addons = current.addons + ManagedAddon(
                    manifestUrl = manifestUrl,
                    manifest = manifest,
                    isRefreshing = false,
                    errorMessage = null,
                ),
            )
        }
        persist()
        pushToServer()
        return AddAddonResult.Success(manifest)
    }

    fun removeAddon(manifestUrl: String) {
        log.i { "removeAddon() — $manifestUrl" }
        _uiState.update { current ->
            current.copy(
                addons = current.addons.filterNot { it.manifestUrl == manifestUrl },
            )
        }
        persist()
        pushToServer()
    }

    fun moveAddon(fromIndex: Int, toIndex: Int) {
        _uiState.update { current ->
            val addons = current.addons
            if (
                fromIndex !in addons.indices ||
                toIndex !in addons.indices ||
                fromIndex == toIndex
            ) {
                return@update current
            }

            val reordered = addons.toMutableList()
            val movingAddon = reordered.removeAt(fromIndex)
            reordered.add(toIndex, movingAddon)
            current.copy(addons = reordered)
        }
        persist()
        pushToServer()
    }

    fun setAddonEnabled(manifestUrl: String, enabled: Boolean) {
        var shouldRefresh = false
        _uiState.update { current ->
            current.copy(
                addons = current.addons.map { addon ->
                    if (addon.manifestUrl != manifestUrl || addon.enabled == enabled) {
                        addon
                    } else {
                        shouldRefresh = enabled && addon.manifest == null && !addon.isRefreshing
                        addon.copy(enabled = enabled)
                    }
                },
            )
        }
        persist()
        pushToServer()
        if (shouldRefresh) {
            refreshAddon(manifestUrl)
        }
    }

    fun refreshAll() {
        _uiState.value.addons.filter { it.enabled }.distinctBy { it.manifestUrl }.forEach { addon ->
            refreshAddon(addon.manifestUrl)
        }
    }

    fun refreshAddon(manifestUrl: String) {
        // The existing-job check, markRefreshing, launch, and map registration all happen
        // inside one critical section so a concurrent call for the same URL (e.g. from
        // initialize() and pullFromServer() racing at startup) can't slip between the
        // check and the registration and start a second, redundant fetch.
        synchronized(stateLock) {
            val existingJob = activeRefreshJobs[manifestUrl]
            if (existingJob?.isActive == true) return@synchronized

            markRefreshing(manifestUrl)
            var refreshJob: Job? = null
            refreshJob = scope.launch {
                try {
                    var attempt = 0
                    while (true) {
                        attempt++
                        val result = runCatching {
                            val payload = httpGetText(manifestUrl)
                            AddonManifestParser.parse(
                                manifestUrl = manifestUrl,
                                payload = payload,
                            )
                        }

                        val manifest = result.getOrNull()
                        if (manifest != null) {
                            _uiState.update { current ->
                                current.copy(
                                    addons = current.addons.map { addon ->
                                        if (addon.manifestUrl != manifestUrl) {
                                            addon
                                        } else {
                                            addon.copy(manifest = manifest, isRefreshing = false, errorMessage = null)
                                        }
                                    },
                                )
                            }
                            return@launch
                        }

                        // A transient cold-start network hiccup (DNS/connection setup still
                        // warming up, many addons + auth + sync all fetching at once) is the
                        // most likely cause of a manifest fetch failing on the first try — it
                        // shouldn't leave the addon (and thus its home-screen catalogs) stuck
                        // manifest-less for the rest of the session, since nothing else here
                        // ever retries it on its own.
                        val stillEnabled = _uiState.value.addons
                            .firstOrNull { it.manifestUrl == manifestUrl }
                            ?.enabled == true
                        if (!stillEnabled || attempt >= ADDON_REFRESH_MAX_ATTEMPTS) {
                            val error = result.exceptionOrNull()
                            if (stillEnabled) {
                                log.w(error) { "refreshAddon() — giving up on $manifestUrl after $attempt attempts" }
                            }
                            _uiState.update { current ->
                                current.copy(
                                    addons = current.addons.map { addon ->
                                        if (addon.manifestUrl != manifestUrl) {
                                            addon
                                        } else if (stillEnabled) {
                                            addon.copy(
                                                isRefreshing = false,
                                                errorMessage = error?.message ?: getString(Res.string.addon_load_manifest_failed),
                                            )
                                        } else {
                                            addon.copy(isRefreshing = false)
                                        }
                                    },
                                )
                            }
                            return@launch
                        }

                        val backoffMs = addonRefreshBackoffMs(attempt)
                        log.w(result.exceptionOrNull()) {
                            "refreshAddon() — attempt $attempt failed for $manifestUrl, retrying in ${backoffMs}ms"
                        }
                        delay(backoffMs)
                    }
                } finally {
                    synchronized(stateLock) {
                        if (activeRefreshJobs[manifestUrl] === refreshJob) {
                            activeRefreshJobs.remove(manifestUrl)
                        }
                    }
                }
            }
            activeRefreshJobs[manifestUrl] = refreshJob
        }
    }

    private fun pushToServer() {
        scope.launch {
            runCatching {
                val profileId = currentProfileId
                val addons = _uiState.value.addons
                    .distinctBy { it.manifestUrl }
                    .mapIndexed { index, addon ->
                        AddonPushItem(
                            url = addon.manifestUrl,
                            name = addon.userSetName?.takeIf { it.isNotBlank() } ?: addon.manifest?.name ?: "",
                            enabled = addon.enabled,
                            sortOrder = index,
                        )
                    }
                log.d { "pushToServer() — profileId=$profileId, pushing ${addons.size} addons" }
                val params = buildJsonObject {
                    put("p_profile_id", profileId)
                    put("p_addons", json.encodeToJsonElement(addons))
                    putSyncOriginClientId()
                }
                SupabaseProvider.client.postgrest.rpc("sync_push_addons", params)
                log.d { "pushToServer() — success" }
            }.onFailure { e ->
                log.e(e) { "pushToServer() — FAILED" }
            }
        }
    }

    private fun markRefreshing(manifestUrl: String) {
        _uiState.update { current ->
            current.copy(
                addons = current.addons.map { addon ->
                    if (addon.manifestUrl == manifestUrl) {
                        addon.copy(
                            isRefreshing = true,
                            errorMessage = null,
                        )
                    } else {
                        addon
                    }
                },
            )
        }
    }

    private fun persist() {
        val addons = _uiState.value.addons
        AddonStorage.saveInstalledAddonUrls(
            currentProfileId,
            dedupeManifestUrls(addons.map { it.manifestUrl }),
        )
        AddonStorage.saveAddonEnabledStates(
            currentProfileId,
            addons.associate { it.manifestUrl to it.enabled },
        )
    }

    private fun loadLocalEnabledStates(): Map<String, Boolean> =
        AddonStorage.loadAddonEnabledStates(currentProfileId)
            .mapKeys { (url, _) -> ensureManifestSuffix(url) }

    // Callers must already hold stateLock.
    private fun cancelActiveRefreshesLocked() {
        activeRefreshJobs.values.forEach(Job::cancel)
        activeRefreshJobs.clear()
    }

    /**
     * Read-only snapshot of the primary profile's (profile 1) addons, for the
     * "choose specific addons" picker in ProfileEditScreen. Deliberately does not
     * touch currentProfileId/initialized/pulledFromServer/_uiState — must be safe
     * to call while a different profile is the live/active one.
     */
    suspend fun fetchPrimaryAddonsForPicker(): List<PrimaryAddonPickerItem> {
        val fromServer = runCatching {
            SupabaseProvider.client.postgrest
                .from("addons")
                .select {
                    filter { eq("profile_id", 1) }
                    order("sort_order", Order.ASCENDING)
                }
                .decodeList<AddonRow>()
        }.getOrElse { e ->
            log.e(e) { "fetchPrimaryAddonsForPicker() — server fetch failed" }
            emptyList()
        }

        val rows = fromServer.ifEmpty {
            val urls = dedupeManifestUrls(AddonStorage.loadInstalledAddonUrls(1))
            val enabledByUrl = AddonStorage.loadAddonEnabledStates(1).mapKeys { ensureManifestSuffix(it.key) }
            urls.map { url -> AddonRow(url = url, name = null, enabled = enabledByUrl[url] ?: true, sortOrder = 0) }
        }

        val deduped = linkedMapOf<String, AddonRow>()
        rows.forEach { row ->
            val url = ensureManifestSuffix(row.url)
            if (!deduped.containsKey(url)) deduped[url] = row.copy(url = url)
        }
        return deduped.values.map { row ->
            PrimaryAddonPickerItem(
                manifestUrl = row.url,
                displayName = row.name?.takeIf { it.isNotBlank() }
                    ?: row.url.substringBefore("?").substringAfterLast("/").ifBlank { "Addon" },
                enabled = row.enabled,
            )
        }
    }

    /**
     * One-time onboarding convenience: copies the primary profile's addons (or the
     * given subset) into targetProfileId's OWN independent addon list, merging with
     * whatever it already has rather than replacing it. After this call the target
     * profile manages its addons entirely independently — there is no ongoing tie to
     * the primary profile. Safe to call regardless of which profile is currently
     * active; does not touch currentProfileId/initialized/_uiState.
     */
    suspend fun copyPrimaryAddonsToProfile(targetProfileId: Int, allowlist: List<String>?) {
        if (targetProfileId == 1) return
        val primaryItems = fetchPrimaryAddonsForPicker()
        val selected = (if (allowlist == null) primaryItems else primaryItems.filter { it.manifestUrl in allowlist })
        if (selected.isEmpty()) return

        val existingUrls = dedupeManifestUrls(AddonStorage.loadInstalledAddonUrls(targetProfileId))
        val mergedUrls = (existingUrls + selected.map { it.manifestUrl }).distinct()
        AddonStorage.saveInstalledAddonUrls(targetProfileId, mergedUrls)

        val existingEnabled = AddonStorage.loadAddonEnabledStates(targetProfileId)
        val mergedEnabled = existingEnabled + selected.associate { it.manifestUrl to it.enabled }
        AddonStorage.saveAddonEnabledStates(targetProfileId, mergedEnabled)

        if (AuthRepository.state.value.isAnonymous) return
        runCatching {
            val addons = mergedUrls.mapIndexed { index, url ->
                AddonPushItem(
                    url = url,
                    name = selected.find { it.manifestUrl == url }?.displayName ?: "",
                    enabled = mergedEnabled[url] ?: true,
                    sortOrder = index,
                )
            }
            val params = buildJsonObject {
                put("p_profile_id", targetProfileId)
                put("p_addons", json.encodeToJsonElement(addons))
                putSyncOriginClientId()
            }
            SupabaseProvider.client.postgrest.rpc("sync_push_addons", params)
        }.onFailure { e ->
            log.e(e) { "copyPrimaryAddonsToProfile() — server push FAILED for profile $targetProfileId" }
        }
    }
}

data class PrimaryAddonPickerItem(
    val manifestUrl: String,
    val displayName: String,
    val enabled: Boolean,
)

private const val ADDON_REFRESH_MAX_ATTEMPTS = 6
private const val ADDON_REFRESH_INITIAL_BACKOFF_MS = 2_000L
private const val ADDON_REFRESH_MAX_BACKOFF_MS = 30_000L

// Exponential backoff: 2s, 4s, 8s, 16s, 30s (capped) across the retry attempts.
private fun addonRefreshBackoffMs(attempt: Int): Long =
    (ADDON_REFRESH_INITIAL_BACKOFF_MS shl (attempt - 1)).coerceAtMost(ADDON_REFRESH_MAX_BACKOFF_MS)

private fun ManagedAddon?.toPendingAddon(
    manifestUrl: String,
    userSetName: String? = null,
    enabled: Boolean? = null,
): ManagedAddon =
    when {
        this == null -> ManagedAddon(
            manifestUrl = manifestUrl,
            isRefreshing = enabled ?: true,
            userSetName = userSetName,
            enabled = enabled ?: true,
        )
        manifest != null -> copy(
            manifestUrl = manifestUrl,
            isRefreshing = false,
            userSetName = userSetName ?: this.userSetName,
            enabled = enabled ?: this.enabled,
        )
        isRefreshing -> copy(
            manifestUrl = manifestUrl,
            userSetName = userSetName ?: this.userSetName,
            enabled = enabled ?: this.enabled,
        )
        else -> copy(
            manifestUrl = manifestUrl,
            isRefreshing = enabled ?: this.enabled,
            errorMessage = null,
            userSetName = userSetName ?: this.userSetName,
            enabled = enabled ?: this.enabled,
        )
    }

private fun dedupeManifestUrls(urls: List<String>): List<String> =
    urls.map(::ensureManifestSuffix).distinct()

private fun ensureManifestSuffix(url: String): String {
    val path = url.substringBefore("?").trimEnd('/')
    val query = url.substringAfter("?", "")
    val withSuffix = if (path.endsWith("/manifest.json")) path else "$path/manifest.json"
    val manifestUrl = if (query.isEmpty()) withSuffix else "$withSuffix?$query"
    return manifestUrl.encodeUnsafeHttpUrlCharacters()
}

private fun normalizeManifestUrl(rawUrl: String): String {
    val trimmed = rawUrl.trim()
    require(trimmed.isNotEmpty()) { runBlocking { getString(Res.string.addons_error_enter_url) } }

    val normalizedScheme = when {
        trimmed.startsWith("http://") || trimmed.startsWith("https://") -> trimmed
        trimmed.startsWith("stremio://") -> "https://${trimmed.removePrefix("stremio://")}"
        else -> "https://$trimmed"
    }

    val withoutFragment = normalizedScheme.substringBefore("#")
    val query = withoutFragment.substringAfter("?", "")
    val path = withoutFragment.substringBefore("?").trimEnd('/')
    val manifestPath = if (path.endsWith("/manifest.json")) {
        path
    } else {
        "$path/manifest.json"
    }

    val manifestUrl = if (query.isEmpty()) manifestPath else "$manifestPath?$query"
    return manifestUrl.encodeUnsafeHttpUrlCharacters()
}
