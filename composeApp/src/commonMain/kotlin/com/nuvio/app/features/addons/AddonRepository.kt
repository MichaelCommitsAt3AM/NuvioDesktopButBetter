package com.nuvio.app.features.addons

import co.touchlab.kermit.Logger
import com.nuvio.app.core.network.SupabaseProvider
import com.nuvio.app.core.auth.AuthState
import com.nuvio.app.core.auth.AuthRepository
import com.nuvio.app.core.auth.isAnonymous
import com.nuvio.app.core.sync.putSyncOriginClientId
import com.nuvio.app.features.profiles.ProfileRepository
import com.nuvio.app.features.profiles.addonGroupMembers
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Order
import io.github.jan.supabase.postgrest.rpc
import kotlinx.atomicfu.locks.SynchronizedObject
import kotlinx.atomicfu.locks.synchronized
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
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
data class AddonRow(
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

private const val ADDON_PUSH_DEBOUNCE_MS = 500L

object AddonRepository {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val log = Logger.withTag("AddonRepository")
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }
    private val _uiState = MutableStateFlow(AddonsUiState(profileLoadPending = true))
    val uiState: StateFlow<AddonsUiState> = _uiState.asStateFlow()

    // Guards initialized/currentProfileId/activeRefreshJobs, all of which
    // are read and mutated from multiple call sites (initialize, onProfileChanged,
    // pullFromServer, refreshAddon, ...) invoked concurrently on Dispatchers.Default's
    // multi-threaded pool. Never held across a suspension point.
    private val stateLock = SynchronizedObject()
    private var initialized = false
    private var currentProfileId: Int = 1
    private val activeRefreshJobs = mutableMapOf<String, Job>()
    private val pushJobsByProfile = mutableMapOf<Int, Job>()

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

        AddonManifestCache.ensureLoaded()
        val storedEnabled = loadLocalEnabledStates()
        val localRows = dedupeManifestUrls(AddonStorage.loadInstalledAddonUrls(currentProfileId)).mapIndexed { index, url ->
            AddonRow(url, enabled = storedEnabled[url] ?: true, sortOrder = index)
        }
        val reconciledRows = reconcileManagedProfileAddons(localRows, ProfileRepository.state.value.activeProfile)
        val storedUrls = reconciledRows.map { it.url }
        val enabledByUrl = reconciledRows.associate { it.url to it.enabled }
        log.d { "initialize() — local addon count: ${storedUrls.size}" }
        val awaitingCloud = AuthRepository.state.value.let { it is AuthState.Loading || (it is AuthState.Authenticated && !it.isAnonymous) }
        if (storedUrls.isEmpty()) {
            _uiState.update { it.copy(profileLoadPending = awaitingCloud, profileLoadError = null) }
            return
        }

        val existingByUrl = _uiState.value.addons.associateBy(ManagedAddon::manifestUrl)
        val seeded = storedUrls.count { url -> existingByUrl[url]?.manifest != null || AddonManifestCache.manifest(url) != null }
        _uiState.value = AddonsUiState(
            // Local addons are enough to render: the remaining wait is per-addon
            // manifest resolution, which `hasPendingEnabledManifests` already
            // reports. Keeping this flag set until the cloud pull returned made
            // Home stay in its loading state for the whole profile session.
            profileLoadPending = false,
            addons = storedUrls.map { manifestUrl ->
                existingByUrl[manifestUrl].toPendingAddon(
                    manifestUrl = manifestUrl,
                    enabled = enabledByUrl[manifestUrl],
                )
            },
        )
        log.i { "initialize() - local=${storedUrls.size} cached=$seeded profile=$currentProfileId" }

        storedUrls.forEach { manifestUrl ->
            val addon = _uiState.value.addons.firstOrNull { it.manifestUrl == manifestUrl } ?: return@forEach
            if (!addon.enabled) return@forEach
            val needsManifest = addon.needsInitialManifestFetch()
            val needsRevalidate = addon.manifest != null && AddonManifestCache.isStale(manifestUrl)
            if (needsManifest || needsRevalidate) refreshAddon(manifestUrl)
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
                true
            }
        }
        if (!shouldReset) return
        _uiState.value = AddonsUiState(profileLoadPending = true)
    }

    fun clearLocalState() {
        synchronized(stateLock) {
            cancelActiveRefreshesLocked()
            pushJobsByProfile.values.forEach(Job::cancel)
            pushJobsByProfile.clear()
            currentProfileId = 1
            initialized = false
        }
        _uiState.value = AddonsUiState()
        // Account data is being wiped; the manifest cache can key on addon URLs
        // that embed per-account configuration tokens.
        AddonManifestCache.clear()
    }

    // Deleted profile indices get reused by createProfile(), so leftover local addon
    // data must be wiped or the new profile that inherits the same index would load
    // the deleted profile's stale addons before its first pullFromServer() completes.
    fun clearLocalDataForDeletedProfile(profileId: Int) {
        AddonStorage.saveInstalledAddonUrls(profileId, emptyList())
        AddonStorage.saveAddonEnabledStates(profileId, emptyMap())
    }

    suspend fun pullFromServer(profileId: Int) {
        val effectiveProfileId = profileId
        val accountAtStart = AuthRepository.state.value
        val wasInitialized = synchronized(stateLock) {
            if (ProfileRepository.activeProfileId != effectiveProfileId) return
            currentProfileId = effectiveProfileId
            initialized
        }
        log.i { "pullFromServer() — profileId=$profileId, initialized=$wasInitialized" }
        runCatching {
            val rows = SupabaseProvider.client.postgrest
                .from("addons")
                .select {
                    filter { eq("profile_id", effectiveProfileId) }
                    order("sort_order", Order.ASCENDING)
                }
                .decodeList<AddonRow>()

            val rowsByUrl = linkedMapOf<String, AddonRow>()
            reconcileManagedProfileAddons(rows, ProfileRepository.state.value.profiles.firstOrNull { it.profileIndex == effectiveProfileId }).forEach { row ->
                val manifestUrl = ensureManifestSuffix(row.url)
                if (!rowsByUrl.containsKey(manifestUrl)) {
                    rowsByUrl[manifestUrl] = row.copy(url = manifestUrl)
                }
            }

            val urls = rowsByUrl.keys.toList()
            log.i { "pullFromServer() — server returned ${rows.size} addons" }
            urls.forEachIndexed { i, u -> log.d { "  server[$i]: $u" } }

            synchronized(stateLock) {
                // The rewrite can show cached profiles while this request is pending.
                // Discard a response for an account/profile that is no longer active.
                if (currentProfileId != effectiveProfileId ||
                    ProfileRepository.activeProfileId != effectiveProfileId ||
                    AuthRepository.state.value != accountAtStart
                ) return@runCatching
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
                    val addon = _uiState.value.addons.firstOrNull { it.manifestUrl == url } ?: return@forEach
                    if (!addon.enabled) return@forEach
                    val needsManifest = addon.needsInitialManifestFetch()
                    val needsRevalidate = addon.manifest != null && AddonManifestCache.isStale(url)
                    if (needsManifest || needsRevalidate) refreshAddon(url)
                }
                initialized = true
                log.i { "pullFromServer() — applied ${urls.size} addons to state" }
            }
        }.onFailure { e ->
            log.e(e) { "pullFromServer() — FAILED" }
            synchronized(stateLock) {
                if (currentProfileId == effectiveProfileId && ProfileRepository.activeProfileId == effectiveProfileId && AuthRepository.state.value == accountAtStart) {
                    _uiState.update { it.copy(profileLoadPending = false, profileLoadError = "Could not load this profile's add-ons. Check your connection and try again.") }
                }
            }
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

    /**
     * Warm the manifest cache for every profile's installed add-ons so an
     * upcoming profile switch can render Home without a manifest round-trip.
     * Best effort: it never touches [_uiState], ignores failures, and only
     * fetches URLs that are missing or past their TTL. The active profile is
     * skipped because its own load is already fetching those manifests.
     */
    suspend fun prefetchManifests(profileIds: List<Int>) {
        AddonManifestCache.ensureLoaded()
        val targets = profileIds.distinct().filter { it != currentProfileId }
        if (targets.isEmpty()) return
        val urls = coroutineScope {
            targets.map { profileId -> async { profileAddonUrlsForPrefetch(profileId) } }.awaitAll()
        }.flatten().distinct().filter { AddonManifestCache.isStale(it) }
        if (urls.isEmpty()) return
        log.i { "prefetchManifests() — warming ${urls.size} manifest(s) for ${targets.size} profile(s)" }
        urls.chunked(MANIFEST_PREFETCH_CONCURRENCY).forEach { chunk ->
            coroutineScope {
                chunk.map { url ->
                    async {
                        runCatching {
                            val payload = withContext(Dispatchers.Default) { fetchAddonResponseText(url) }
                            AddonManifestCache.record(url, payload)
                        }
                    }
                }.awaitAll()
            }
        }
    }

    /**
     * A profile's add-on URLs without touching the live state. The cloud list is
     * authoritative for signed-in accounts and is cached locally so the next
     * switch can start from it immediately; the local list is the fallback.
     */
    private suspend fun profileAddonUrlsForPrefetch(profileId: Int): List<String> {
        val local = dedupeManifestUrls(AddonStorage.loadInstalledAddonUrls(profileId))
        if (AuthRepository.state.value.isAnonymous) return local
        val rows = runCatching { readProfileAddonSnapshot(profileId) }.getOrNull().orEmpty()
        if (rows.isEmpty()) return local
        val ordered = rows.sortedBy { it.sortOrder }
            .map { it.copy(url = ensureManifestSuffix(it.url)) }
            .distinctBy { it.url }
        AddonStorage.saveInstalledAddonUrls(profileId, ordered.map { it.url })
        AddonStorage.saveAddonEnabledStates(profileId, ordered.associate { it.url to it.enabled })
        return (ordered.map { it.url } + local).distinct()
    }

    /**
     * Installs the built-in [DEFAULT_ADDON_URLS] for a brand-new main profile so
     * a fresh account has content without the user adding anything. Runs at most
     * once per profile ([AddonStorage] tracks it), so deliberately removing every
     * add-on is not undone on the next launch.
     */
    suspend fun seedDefaultAddonsIfEmpty(profileId: Int) {
        if (profileId != MAIN_PROFILE_ID) return
        if (profileId != currentProfileId) return
        if (AddonStorage.isAddonDefaultsSeeded(profileId)) return
        val state = _uiState.value
        // Only act once the add-on list is settled: a slow or failed cloud pull
        // must not be mistaken for "this account has no add-ons".
        if (state.profileLoadPending) return
        if (!AuthRepository.state.value.isAnonymous && state.profileLoadError != null) return
        AddonStorage.markAddonDefaultsSeeded(profileId)
        if (state.addons.isNotEmpty()) return
        log.i { "seedDefaultAddonsIfEmpty() — installing ${DEFAULT_ADDON_URLS.size} default add-on(s) for profile $profileId" }
        DEFAULT_ADDON_URLS.forEach { url ->
            when (val outcome = addAddon(url)) {
                is AddAddonResult.Success -> Unit
                is AddAddonResult.Error -> log.w {
                    "seedDefaultAddonsIfEmpty() — ${manifestLogLabel(url)} failed: ${outcome.message}"
                }
            }
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

        var manifestPayload: String? = null
        val manifest = try {
            withContext(Dispatchers.Default) {
                val payload = fetchAddonResponseText(manifestUrl)
                manifestPayload = payload
                AddonManifestParser.parse(
                    manifestUrl = manifestUrl,
                    payload = payload,
                )
            }
        } catch (error: Throwable) {
            return AddAddonResult.Error(error.message ?: getString(Res.string.addon_load_manifest_failed))
        }
        manifestPayload?.let { AddonManifestCache.record(manifestUrl, it) }

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
        var changed = false
        _uiState.update { current ->
            val updatedAddons = current.addons.filterNot { it.manifestUrl == manifestUrl }
            changed = updatedAddons.size != current.addons.size
            if (changed) current.copy(addons = updatedAddons) else current
        }
        if (!changed) return
        persist()
        pushToServer()
    }

    fun moveAddon(fromIndex: Int, toIndex: Int) {
        var changed = false
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
            changed = true
            current.copy(addons = reordered)
        }
        if (!changed) return
        persist()
        pushToServer()
    }

    fun setAddonEnabled(manifestUrl: String, enabled: Boolean) {
        var shouldRefresh = false
        var changed = false
        _uiState.update { current ->
            current.copy(
                addons = current.addons.map { addon ->
                    if (addon.manifestUrl != manifestUrl || addon.enabled == enabled) {
                        addon
                    } else {
                        changed = true
                        shouldRefresh = enabled && addon.manifest == null
                        addon.copy(enabled = enabled)
                    }
                },
            )
        }
        if (!changed) return
        persist()
        pushToServer()
        if (shouldRefresh) {
            refreshAddon(manifestUrl)
        }
    }

    fun refreshAll() {
        _uiState.value.addons.filter { it.enabled }.distinctBy { it.manifestUrl }.forEach { addon ->
            refreshAddon(
                manifestUrl = addon.manifestUrl,
                forceRefresh = true,
            )
        }
    }

    fun refreshAddon(
        manifestUrl: String,
        forceRefresh: Boolean = false,
    ) {
        // The existing-job check, markRefreshing, launch, and map registration all happen
        // inside one critical section so a concurrent call for the same URL (e.g. from
        // initialize() and pullFromServer() racing at startup) can't slip between the
        // check and the registration and start a second, redundant fetch.
        synchronized(stateLock) {
            // UI pending state is seeded before a request exists. Only the job
            // registry can establish that a manifest request is already running.
            val existingJob = activeRefreshJobs[manifestUrl]
            if (existingJob?.isActive == true) return@synchronized

            markRefreshing(manifestUrl)
            var refreshJob: Job? = null
            refreshJob = scope.launch {
                try {
                    var attempt = 0
                    while (true) {
                        attempt++
                        val startedAtMs = kotlin.time.Clock.System.now().toEpochMilliseconds()
                        var payload: String? = null
                        val result = runCatching {
                            val fetched = fetchAddonResponseText(
                                url = manifestUrl,
                                forceRefresh = forceRefresh,
                            )
                            payload = fetched
                            AddonManifestParser.parse(
                                manifestUrl = manifestUrl,
                                payload = fetched,
                            )
                        }

                        val manifest = result.getOrNull()
                        if (manifest != null) {
                            payload?.let { AddonManifestCache.record(manifestUrl, it) }
                            log.d {
                                "refreshAddon() — ${manifestLogLabel(manifestUrl)} resolved in " +
                                    "${kotlin.time.Clock.System.now().toEpochMilliseconds() - startedAtMs}ms (attempt=$attempt)"
                            }
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
        // A newer edit on another group member supersedes this device's older
        // debounced snapshot too; otherwise quick switches can undo the edit.
        addonGroupMembers(ProfileRepository.state.value.profiles, profileId).forEach {
            pushJobsByProfile[it]?.cancel()
        }
        var pushJob: Job? = null
        pushJob = scope.launch {
            try {
                delay(ADDON_PUSH_DEBOUNCE_MS)
                log.d { "pushToServer() — profileId=$profileId, pushing ${addons.size} addons" }
                val params = buildJsonObject {
                    put("p_profile_id", profileId)
                    put("p_addons", json.encodeToJsonElement(addons))
                    putSyncOriginClientId()
                }
                SupabaseProvider.client.postgrest.rpc("sync_push_addons", params)
                log.d { "pushToServer() — success" }
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                log.e(error) { "pushToServer() — FAILED" }
            } finally {
                if (pushJobsByProfile[profileId] === pushJob) {
                    pushJobsByProfile.remove(profileId)
                }
            }
        }
        pushJobsByProfile[profileId] = pushJob
    }

    private fun markRefreshing(manifestUrl: String) {
        _uiState.update { current ->
            current.copy(
                addons = current.addons.map { addon ->
                    if (addon.manifestUrl == manifestUrl) {
                        addon.copy(
                            // A resolved manifest revalidates silently: flipping
                            // isRefreshing would change catalog cache keys and hold
                            // Home in its loading state for a manifest we already have.
                            isRefreshing = addon.manifest == null,
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
        addonGroupMembers(ProfileRepository.state.value.profiles, currentProfileId).forEach { profileId ->
            AddonStorage.saveInstalledAddonUrls(
                profileId,
                dedupeManifestUrls(addons.map { it.manifestUrl }),
            )
            AddonStorage.saveAddonEnabledStates(
                profileId,
                addons.associate { it.manifestUrl to it.enabled },
            )
        }
    }

    suspend fun flushPendingPushes() {
        pushJobsByProfile.values.toList().forEach { it.join() }
    }

    suspend fun readProfileAddonSnapshot(profileId: Int): List<AddonRow> {
        if (!AuthRepository.state.value.isAnonymous) {
            return SupabaseProvider.client.postgrest.from("addons").select {
                filter { eq("profile_id", profileId) }
                order("sort_order", Order.ASCENDING)
            }.decodeList<AddonRow>()
        }
        val enabled = AddonStorage.loadAddonEnabledStates(profileId)
        return AddonStorage.loadInstalledAddonUrls(profileId).mapIndexed { index, url ->
            AddonRow(url, enabled = enabled[url] ?: true, sortOrder = index)
        }
    }

    fun applyProfileAddonSnapshot(profileIds: List<Int>, rows: List<AddonRow>) {
        val normalized = rows.sortedBy { it.sortOrder }.map { it.copy(url = ensureManifestSuffix(it.url)) }.distinctBy { it.url }
        profileIds.forEach { profileId ->
            AddonStorage.saveInstalledAddonUrls(profileId, normalized.map { it.url })
            AddonStorage.saveAddonEnabledStates(profileId, normalized.associate { it.url to it.enabled })
        }
        if (currentProfileId in profileIds) {
            synchronized(stateLock) {
                cancelActiveRefreshesLocked()
                val existing = _uiState.value.addons.associateBy { it.manifestUrl }
                _uiState.value = AddonsUiState(addons = normalized.map { row ->
                    existing[row.url].toPendingAddon(row.url, row.name, row.enabled).copy(isRefreshing = false)
                })
                initialized = true
            }
            _uiState.value.addons.forEach { addon ->
                if (!addon.enabled) return@forEach
                val needsManifest = addon.needsInitialManifestFetch()
                val needsRevalidate = addon.manifest != null && AddonManifestCache.isStale(addon.manifestUrl)
                if (needsManifest || needsRevalidate) refreshAddon(addon.manifestUrl)
            }
        }
    }

    /** Import into an independent target without losing its order or existing settings. */
    suspend fun importProfileAddons(profileId: Int, imported: List<AddonRow>) {
        flushPendingPushes()
        val existing = readProfileAddonSnapshot(profileId)
        saveIndependentProfileAddons(profileId, mergeProfileAddonImport(existing, imported))
    }

    /** Persist a one-time selection after the caller has removed the target's live link. */
    suspend fun saveIndependentProfileAddons(profileId: Int, rows: List<AddonRow>) {
        flushPendingPushes()
        check(ProfileRepository.state.value.profiles.first { it.profileIndex == profileId }.addonSyncProfileId == null)
        val ordered = rows.distinctBy { it.url }.mapIndexed { index, row -> row.copy(sortOrder = index) }
        if (!AuthRepository.state.value.isAnonymous) {
            SupabaseProvider.client.postgrest.rpc("sync_push_addons", buildJsonObject {
                put("p_profile_id", profileId)
                put("p_addons", json.encodeToJsonElement(ordered.map { AddonPushItem(it.url, it.name.orEmpty(), it.enabled, it.sortOrder) }))
                putSyncOriginClientId()
            })
        }
        applyProfileAddonSnapshot(addonGroupMembers(ProfileRepository.state.value.profiles, profileId), ordered)
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
     * touch currentProfileId/initialized/_uiState — must be safe
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
private const val MANIFEST_PREFETCH_CONCURRENCY = 4
private const val MAIN_PROFILE_ID = 1

/**
 * Add-ons installed automatically for a brand-new main profile. Neither needs any
 * user configuration:
 *  - Cinemeta is Stremio's keyless public catalog add-on.
 *  - AIOMetadata is a hosted metadata add-on whose URL embeds a saved configuration
 *    (`/stremio/<config-id>/manifest.json`); a config-free URL does not exist, so this
 *    fork deliberately ships the owner's configuration id
 *    `72194dd9-57a2-4c60-a4b1-462adfd81eae` as the shared default. Replace it here to
 *    point new accounts at a different AIOMetadata configuration.
 */
private val DEFAULT_ADDON_URLS = listOf(
    "https://v3-cinemeta.strem.io/manifest.json",
    "https://aiometadata.elfhosted.com/stremio/72194dd9-57a2-4c60-a4b1-462adfd81eae/manifest.json",
)

/** Log-safe manifest reference: strips any configuration token in the query. */
private fun manifestLogLabel(manifestUrl: String): String = manifestUrl.substringBefore("?")

// Exponential backoff: 2s, 4s, 8s, 16s, 30s (capped) across the retry attempts.
private fun addonRefreshBackoffMs(attempt: Int): Long =
    (ADDON_REFRESH_INITIAL_BACKOFF_MS shl (attempt - 1)).coerceAtMost(ADDON_REFRESH_MAX_BACKOFF_MS)

internal fun ManagedAddon?.toPendingAddon(
    manifestUrl: String,
    userSetName: String? = null,
    enabled: Boolean? = null,
): ManagedAddon {
    val existing = this
    val resolvedEnabled = enabled ?: existing?.enabled ?: true
    if (existing?.manifest != null) {
        return existing.copy(
            manifestUrl = manifestUrl,
            isRefreshing = false,
            userSetName = userSetName ?: existing.userSetName,
            enabled = resolvedEnabled,
        )
    }
    // Seed from the URL-keyed manifest cache so a profile switch can reuse a
    // manifest fetched earlier this session or persisted by a previous run,
    // instead of starting every addon as an unresolved network fetch.
    val cached = AddonManifestCache.manifest(manifestUrl)
    if (cached != null) {
        return ManagedAddon(
            manifestUrl = manifestUrl,
            manifest = cached,
            isRefreshing = false,
            errorMessage = null,
            userSetName = userSetName ?: existing?.userSetName,
            enabled = resolvedEnabled,
        )
    }
    if (existing == null) {
        return ManagedAddon(
            manifestUrl = manifestUrl,
            isRefreshing = resolvedEnabled,
            userSetName = userSetName,
            enabled = resolvedEnabled,
        )
    }
    if (existing.isRefreshing) {
        return existing.copy(
            manifestUrl = manifestUrl,
            userSetName = userSetName ?: existing.userSetName,
            enabled = resolvedEnabled,
        )
    }
    return existing.copy(
        manifestUrl = manifestUrl,
        isRefreshing = resolvedEnabled,
        errorMessage = null,
        userSetName = userSetName ?: existing.userSetName,
        enabled = resolvedEnabled,
    )
}

private fun dedupeManifestUrls(urls: List<String>): List<String> =
    urls.map(::ensureManifestSuffix).distinct()

internal fun ensureManifestSuffix(url: String): String {
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
