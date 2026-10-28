package com.nuvio.desktop.bridge

import com.nuvio.desktop.bridge.features.KidsBridge
import com.nuvio.app.features.profiles.forKidsCatalogs

import androidx.compose.ui.graphics.toArgb
import com.nuvio.desktop.bridge.features.ProfilesBridge
import com.nuvio.desktop.bridge.features.AppearanceBridge
import com.nuvio.desktop.bridge.features.BridgeFeatureException
import com.nuvio.desktop.bridge.features.DownloadsBridge
import com.nuvio.desktop.bridge.features.PluginsBridge
import com.nuvio.desktop.bridge.features.PlaybackSettingsBridge
import com.nuvio.desktop.bridge.features.MetadataSettingsBridge
import com.nuvio.desktop.bridge.features.AuthOptionsBridge
import com.nuvio.desktop.bridge.features.IntegrationsBridge
import com.nuvio.desktop.bridge.features.AboutBridge
import com.nuvio.desktop.bridge.features.StreamSelectionBridge
import com.nuvio.desktop.bridge.features.DownloadEnqueueBridgeResult
import com.nuvio.app.features.downloads.DownloadsRepository
import com.nuvio.app.features.downloads.DownloadEnqueueResult
import com.nuvio.app.features.details.MetaVideo
import com.nuvio.app.features.player.desktop.notifyDesktopWindowGainedFocus
import com.nuvio.app.features.debrid.DirectDebridPlaybackResolver
import com.nuvio.app.features.debrid.DirectDebridPlayableResult
import com.nuvio.app.features.catalog.CatalogRepository
import com.nuvio.app.features.search.SearchHistoryRepository
import com.nuvio.app.features.collection.CollectionRepository

import com.nuvio.app.core.auth.AuthRepository
import com.nuvio.app.core.auth.AuthState
import com.nuvio.app.core.auth.isAnonymous
import com.nuvio.app.core.build.AppFeaturePolicy
import com.nuvio.app.core.build.AppVersionPolicy
import com.nuvio.app.core.ui.AppTheme
import com.nuvio.app.core.ui.ThemeColors
import com.nuvio.app.core.sync.SyncManager
import com.nuvio.app.core.network.NetworkStatusRepository
import com.nuvio.app.core.network.NetworkCondition
import com.nuvio.app.core.auth.DeviceSessionRegistration
import com.nuvio.app.features.addons.AddAddonResult
import com.nuvio.app.features.addons.AddonRepository
import com.nuvio.app.features.addons.ManagedAddon
import com.nuvio.app.features.addons.enabledAddons
import com.nuvio.app.features.details.MetaDetails
import com.nuvio.app.features.details.MetaDetailsRepository
import com.nuvio.app.features.home.HomeCatalogSection
import com.nuvio.app.features.home.HomeCatalogSettingsRepository
import com.nuvio.app.features.home.HomeHeroMetaRepository
import com.nuvio.app.features.home.withHeroMeta
import com.nuvio.app.features.home.HomeRepository
import com.nuvio.app.features.home.stableKey
import com.nuvio.app.features.home.MetaPreview
import com.nuvio.app.features.library.LibraryRepository
import com.nuvio.app.features.library.toLibraryItem
import com.nuvio.app.features.membership.MemberAccessRepository
import com.nuvio.app.features.membership.availableAppThemes
import com.nuvio.app.features.profiles.NuvioProfile
import com.nuvio.app.features.profiles.ProfileRepository
import com.nuvio.app.features.plugins.PluginRepository
import com.nuvio.app.features.search.SearchRepository
import com.nuvio.app.features.settings.ThemeSettingsRepository
import com.nuvio.app.features.streams.StreamItem
import com.nuvio.app.features.streams.StreamsRepository
import com.nuvio.app.features.watchprogress.WatchProgressRepository
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.call
import io.ktor.server.application.install
import io.ktor.server.engine.EmbeddedServer
import io.ktor.server.engine.embeddedServer
import io.ktor.server.cio.CIO
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.post
import io.ktor.server.routing.routing
import io.ktor.server.websocket.WebSockets
import io.ktor.server.websocket.webSocket
import io.ktor.server.plugins.contentnegotiation.ContentNegotiation
import io.ktor.serialization.kotlinx.json.json
import io.ktor.websocket.Frame
import io.ktor.websocket.close
import io.ktor.websocket.send
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.withContext
import kotlinx.coroutines.swing.Swing
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.JsonObjectBuilder
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.put
import java.security.MessageDigest
import java.util.concurrent.atomic.AtomicLong

interface BridgePlaybackAdapter {
    suspend fun start(
        stream: StreamItem,
        meta: MetaDetails?,
        videoId: String?,
        startFromBeginning: Boolean = false,
        nativeHostWindow: Long? = null,
        nativeHostFullscreen: Boolean = false,
    ): JsonObject
    suspend fun stop()
    suspend fun shutdown() = stop()
}

/** Delay before warming other profiles' manifest caches after the active profile settles. */
private const val ADDON_MANIFEST_PREFETCH_DELAY_MS = 2_000L

/** Runtime for the local-only bridge consumed by the Tauri shell. */
class DesktopBridgeRuntime {
    private data class StreamRecord(val stream: StreamItem, val meta: MetaDetails?, val videoId: String?)
    private val lifecycle = Mutex()
    private val rpcMutex = Mutex()
    private val eventMutex = Mutex()
    private val revisions = AtomicLong(0)
    private val streamRegistry = mutableMapOf<String, StreamRecord>()
    private val eventClients = java.util.concurrent.CopyOnWriteArraySet<suspend (JsonObject) -> Unit>()
    private var server: EmbeddedServer<*, *>? = null
    private var runtimeScope: CoroutineScope? = null
    private var authToken: String? = null
    private var currentEpoch = AtomicLong(1)
    private var sessionStatus = "loading"
    private var sessionProfilesReady = false
    private var sessionError: String? = null
    private var observedAuthUserId: String? = null
    private var hasObservedAuthUser = false
    private var playbackAdapter: BridgePlaybackAdapter? = NativePlayback { state ->
        runtimeScope?.launch { emit("playback", state) }
    }
    private var loadedVideoId: String? = null
    private var lastDetails: MetaDetails? = null
    @Volatile private var appVisible = true
    private val syncLifecycle = BridgeSyncLifecycle(
        startWatchSource = com.nuvio.app.features.watchprogress.WatchProgressSourceCoordinator::ensureStarted,
        pullProfile = SyncManager::pullAllForProfile,
        startPeriodic = SyncManager::startPeriodicNuvioSyncPull,
        pullForeground = { SyncManager.requestForegroundPull(it) },
        stopPeriodic = SyncManager::stopPeriodicNuvioSyncPull,
    )

    private fun updateProfileSync() {
        val auth = AuthRepository.state.value as? AuthState.Authenticated
        syncLifecycle.update(
            userId = auth?.takeUnless { it.isAnonymous }?.userId,
            profileId = ProfileRepository.state.value.activeProfile?.profileIndex,
            visible = appVisible,
        )
    }
    private val requestJobs = java.util.concurrent.ConcurrentHashMap<String, Job>()
    private val requestQueries = java.util.concurrent.ConcurrentHashMap<String, String>()

    val epoch: Long get() = currentEpoch.get()

    fun setPlaybackAdapter(adapter: BridgePlaybackAdapter?) { playbackAdapter = adapter }

    suspend fun start(token: String): Int = lifecycle.withLock {
        check(server == null) { "Bridge runtime is already started" }
        require(token.length >= 32) { "Bridge token must contain at least 32 characters" }
        authToken = token
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        runtimeScope = scope

        NetworkStatusRepository.ensureStarted()
        scope.launch {
            NetworkStatusRepository.uiState.collect { emit("session", sessionJson()) }
        }
        scope.launch {
            while (isActive) {
                delay(15_000)
                if (NetworkStatusRepository.uiState.value.isOfflineLike) NetworkStatusRepository.requestRefresh()
            }
        }
        scope.startOfflinePlaybackSync(
            contexts = combine(NetworkStatusRepository.uiState, AuthRepository.state, ProfileRepository.state) { network, auth, profiles ->
                OfflinePlaybackSyncContext(
                    online = network.condition == NetworkCondition.Online,
                    accountId = (auth as? AuthState.Authenticated)?.takeUnless { it.isAnonymous }
                        ?.userId?.takeIf(ProfileRepository::hasLoadedProfilesFor),
                    profileIds = profiles.profiles.map { it.profileIndex }.distinct(),
                )
            },
            pushProgress = WatchProgressRepository::pushPendingToCloud,
            pushWatched = com.nuvio.app.features.watched.WatchedRepository::pushPendingToCloud,
            onFailure = { error -> co.touchlab.kermit.Logger.withTag("OfflinePlaybackSync").w(error) { "Pending playback sync will be retried" } },
        )

        // Match AppGate/MainAppContent initialization while keeping ownership in one runtime.
        AuthRepository.initialize()
        ProfileRepository.loadCachedProfiles()
        com.nuvio.app.features.autosync.AutoSyncPreferencesDesktop.initialize()
        ThemeSettingsRepository.ensureLoaded()
        SearchHistoryRepository.ensureLoaded()
        DownloadsRepository.ensureLoaded()
        LibraryRepository.ensureLoaded()
        AddonRepository.initialize()
        CollectionRepository.initialize()
        if (AppFeaturePolicy.pluginsEnabled) PluginRepository.initialize()

        val homeCatalogLifecycle = BridgeHomeCatalogLifecycle(
            syncCatalogs = HomeCatalogSettingsRepository::syncCatalogs,
            syncCollections = { collections, addons -> HomeCatalogSettingsRepository.syncCollections(collections, addons) },
            refreshHome = { HomeRepository.refresh(it) },
        )
        scope.launch {
            combine(AddonRepository.uiState, CollectionRepository.collections, com.nuvio.app.features.servers.ServerRepository.uiState) { _, _, _ -> Unit }
                .collect {
                    rpcMutex.withLock {
                        // Read after acquiring the lock: a profile switch may have
                        // replaced both repositories while this observer waited.
                        homeCatalogLifecycle.update(epoch, AddonRepository.uiState.value.addons, CollectionRepository.collections.value, com.nuvio.app.features.servers.ServerRepository.uiState.value.revision)
                        emit("home", homeJson())
                        emit("appearance", AppearanceBridge.snapshot())
                    }
                }
        }

        scope.launch { observeAuthentication() }
        scope.launch { HomeRepository.uiState.collect { emit("home", homeJson()) } }
        scope.launch {
            combine(
                HomeRepository.uiState,
                com.nuvio.app.features.mdblist.MdbListSettingsRepository.uiState,
                com.nuvio.app.features.tmdb.TmdbSettingsRepository.uiState,
                ProfileRepository.state,
            ) { home, ratings, tmdb, profiles ->
                HeroLoadInput(home.heroItems, ratings, tmdb, profiles.activeProfile?.profileIndex)
            }.distinctUntilChanged().collectLatest { input ->
                HomeHeroMetaRepository.clear()
                if (input.profileId != null && input.items.isNotEmpty()) {
                    delay(400)
                    HomeHeroMetaRepository.load(input.items, input.ratings.takeIf { it.isActive && it.showOnHero })
                }
            }
        }
        scope.launch { HomeHeroMetaRepository.metas.collect { emit("home", homeJson()) } }
        scope.launch { com.nuvio.app.features.details.MetaScreenSettingsRepository.uiState.collect { emit("home", homeJson()) } }

        scope.launch { WatchProgressRepository.uiState.collect { emit("home", homeJson()) } }
        scope.launch { WatchProgressRepository.uiState.collect { emit("homeExtras", HomeBridge.snapshot()) } }
        scope.launch { HomeBridge.updates.collect { emit("homeExtras", HomeBridge.snapshot()) } }
        scope.launch { com.nuvio.app.features.watchprogress.ContinueWatchingPreferencesRepository.uiState.collect { emit("homeExtras", HomeBridge.snapshot()) } }
        scope.launch { com.nuvio.app.features.watched.WatchedRepository.uiState.collect { emit("homeExtras", HomeBridge.snapshot()) } }
        scope.launch { com.nuvio.app.features.player.PlayerSettingsRepository.uiState.collect { emit("playbackSettings", PlaybackSettingsBridge.snapshot()) } }
        scope.launch {
            val preferences = com.nuvio.app.features.autosync.AutoSyncPreferencesRepository
            kotlinx.coroutines.flow.combine(preferences.preferredSubtitleAutoSyncOnStart, preferences.aggressiveMode, preferences.syncToleranceMs) { _, _, _ -> Unit }
                .collect { emit("playbackSettings", PlaybackSettingsBridge.snapshot()) }
        }
        scope.launch { com.nuvio.app.features.details.MetaScreenSettingsRepository.uiState.collect { emit("metadataSettings", MetadataSettingsBridge.snapshot()) } }
        scope.launch { com.nuvio.app.features.p2p.P2pSettingsRepository.uiState.collect { emit("p2p", PlaybackSettingsBridge.p2pSnapshot()) } }
        scope.launch { com.nuvio.app.features.auth.ServerConnectionController.state.collect { emit("authOptions", AuthOptionsBridge.snapshot()) } }
        scope.launch { com.nuvio.app.core.auth.DeviceLinkAuthRepository.state.collect { emit("authOptions", AuthOptionsBridge.snapshot()) } }
        scope.launch { com.nuvio.app.features.tmdb.TmdbSettingsRepository.uiState.collect { emitIntegrations() } }
        scope.launch { com.nuvio.app.features.mdblist.MdbListSettingsRepository.uiState.collect { emitIntegrations() } }
        scope.launch { com.nuvio.app.features.mdblist.MdbListTracker.auth.state.collect { emitIntegrations() } }
        scope.launch { com.nuvio.app.features.mdblist.MdbListTracker.account.status.collect { emitIntegrations() } }
        scope.launch { com.nuvio.app.features.debrid.DebridSettingsRepository.uiState.collect { emitIntegrations() } }
        scope.launch { com.nuvio.app.features.simkl.SimklAuthRepository.uiState.collect { emitIntegrations() } }
        scope.launch { com.nuvio.app.features.tracking.TrackingSettingsRepository.uiState.collect { emitIntegrations() } }
        scope.launch { com.nuvio.app.features.simkl.SimklSyncRepository.state.collect { emitIntegrations() } }
        scope.launch { com.nuvio.app.features.mdblist.MdbListTracker.sync.state.collect { emitIntegrations() } }
        scope.launch { com.nuvio.app.features.watchprogress.WatchProgressSourceCoordinator.uiState.collect { emitIntegrations() } }
        scope.launch { com.nuvio.app.features.collection.CollectionRepository.collections.collect { emit("collections", CollectionsBridge.snapshot("collections")!!) } }
        scope.launch { com.nuvio.app.features.collection.CollectionEditorRepository.uiState.collect { emit("collectionEditor", CollectionsBridge.snapshot("collectionEditor")!!) } }
        scope.launch { com.nuvio.app.features.collection.FolderDetailRepository.uiState.collect { emit("folderDetail", CollectionsBridge.snapshot("folderDetail")!!) } }
        scope.launch { com.nuvio.app.features.servers.ServerRepository.uiState.collect { emit("servers", ServersBridge.snapshot()) } }
        scope.launch { LibraryExtrasBridge.changes.collect { emit("libraryExtras", LibraryExtrasBridge.snapshot()) } }
        scope.launch { LibraryRepository.uiState.collect { emit("library", libraryJson()) } }
        scope.launch { LibraryRepository.uiState.collect { emit("libraryExtras", LibraryExtrasBridge.snapshot()) } }
        scope.launch { com.nuvio.app.features.library.LibraryDisplaySettingsRepository.uiState.collect { emit("libraryExtras", LibraryExtrasBridge.snapshot()) } }
        scope.launch { com.nuvio.app.features.cloud.CloudLibraryRepository.uiState.collect { emit("cloud", LibraryExtrasBridge.cloudSnapshot()) } }
        scope.launch { AddonRepository.uiState.collect { emit("addons", addonsJson()); emit("appearance", AppearanceBridge.snapshot()) } }
        scope.launch { ThemeSettingsRepository.selectedTheme.collect { emit("settings", settingsJson()) } }
        scope.launch { ThemeSettingsRepository.customThemeColors.collect { emit("appearance", AppearanceBridge.snapshot()) } }
        scope.launch { ThemeSettingsRepository.amoledEnabled.collect { emit("appearance", AppearanceBridge.snapshot()) } }
        scope.launch { ThemeSettingsRepository.desktopNavigationLayout.collect { emit("appearance", AppearanceBridge.snapshot()) } }
        scope.launch { ThemeSettingsRepository.navBarStyle.collect { emit("appearance", AppearanceBridge.snapshot()) } }
        scope.launch { ThemeSettingsRepository.navBarGlowEnabled.collect { emit("appearance", AppearanceBridge.snapshot()) } }
        scope.launch { com.nuvio.app.core.ui.PosterCardStyleRepository.uiState.collect { emit("appearance", AppearanceBridge.snapshot()) } }
        scope.launch { com.nuvio.app.core.ui.CardDepthStyleRepository.uiState.collect { emit("appearance", AppearanceBridge.snapshot()) } }
        scope.launch { com.nuvio.app.core.poster.CustomPosterUrlRepository.pattern.collect { emit("appearance", AppearanceBridge.snapshot()) } }
        scope.launch { com.nuvio.app.core.poster.CustomPosterUrlRepository.enabledScreens.collect { emit("appearance", AppearanceBridge.snapshot()) } }
        scope.launch {
            HomeCatalogSettingsRepository.uiState.collect {
                rpcMutex.withLock {
                    HomeRepository.applyCurrentSettings()
                    emit("home", homeJson())
                    emit("appearance", AppearanceBridge.snapshot())
                }
            }
        }
        scope.launch {
            var previousProfile: Int? = null
            var previousPolicy: String? = null
            ProfileRepository.state.collect { profiles ->
            val profile = profiles.activeProfile
            val policy = profile?.let { "${it.kidsEnabled}|${it.kidsMaxRating}|${it.kidsConfigId}|${it.kidsServiceUrl}" }
            if (previousProfile == profile?.profileIndex && previousPolicy != null && previousPolicy != policy) {
                rpcMutex.withLock {
                    playbackAdapter?.stop()
                    advanceEpoch()
                    MetaDetailsRepository.clear()
                    StreamsRepository.clear()
                    lastDetails = null
                    loadedVideoId = null
                    HomeRepository.clear()
                    refreshHomeAfterAddonChange()
                }
            }
            if (previousProfile != profile?.profileIndex) {
                com.nuvio.app.features.autosync.AutoSyncPreferencesRepository.ensureLoaded()
                emit("playbackSettings", PlaybackSettingsBridge.snapshot())
            }
            previousProfile = profile?.profileIndex
            previousPolicy = policy
            emit("profiles", ProfilesBridge.snapshot())
            // The picker uses session profiles; publish cloud changes there too.
            if (sessionStatus == "signedIn" && sessionProfilesReady) emit("session", sessionJson())
        } }
        scope.launch { com.nuvio.app.features.profiles.AvatarRepository.avatars.collect { emit("profiles", ProfilesBridge.snapshot()) } }
        scope.launch { com.nuvio.app.features.membership.ProfileBackgroundRepository.catalog.collect { emit("profiles", ProfilesBridge.snapshot()) } }
        scope.launch { CatalogRepository.uiState.collect { emit("catalog", CatalogBridge.snapshot("catalog")!!) } }
        scope.launch { SearchRepository.discoverUiState.collect { emit("discover", CatalogBridge.snapshot("discover")!!) } }
        scope.launch { SearchHistoryRepository.uiState.collect { emit("searchHistory", CatalogBridge.snapshot("searchHistory")!!) } }
        scope.launch { SearchHistoryRepository.enabled.collect { emit("searchHistory", CatalogBridge.snapshot("searchHistory")!!) } }
        scope.launch { DownloadsRepository.uiState.collect { emit("downloads", DownloadsBridge.snapshot()) } }
        if (AppFeaturePolicy.pluginsEnabled) scope.launch { PluginRepository.uiState.collect { emit("plugins", PluginsBridge.snapshot()) } }
        scope.launch { SearchRepository.uiState.collect { latestRequest["search"]?.let { id -> emit("search", searchJson(id, requestQueries["search"].orEmpty())) } } }
        scope.launch { MetaDetailsRepository.uiState.collect { latestRequest["details"]?.let { id -> emit("details", detailsJson(id)) } } }
        scope.launch {
            StreamsRepository.uiState.collect { state ->
                latestRequest["streams"]?.let { id ->
                    try {
                        emit("streams", streamsJson(id))
                        emit("streamSelection", streamSelectionJson())
                        System.err.println("[StreamsBridge] snapshot request=$id loading=${state.isAnyLoading} groups=${state.groups.size} streams=${state.groups.sumOf { it.streams.size }}")
                    } catch (cancelled: kotlinx.coroutines.CancellationException) {
                        throw cancelled
                    } catch (failure: Throwable) {
                        // Keep this subscription alive so one bad result cannot break future searches.
                        System.err.println("[StreamsBridge] snapshot failed request=$id kind=${failure::class.simpleName}")
                        emit("streams", buildJsonObject {
                            put("requestId", id); put("loading", false)
                            put("error", "Could not display stream results. Please try again.")
                            put("groups", JsonArray(emptyList()))
                        })
                    }
                }
            }
        }
        val running = embeddedServer(CIO, host = "127.0.0.1", port = 0) {
            install(ContentNegotiation) { json(Json { ignoreUnknownKeys = true; encodeDefaults = true }) }
            install(WebSockets)
            routing {
                post("/rpc") {
                    if (!authorized(call.request.headers["Authorization"])) {
                        call.respond(HttpStatusCode.Unauthorized, errorBody(null, epoch, "unauthorized", "Invalid bridge token"))
                        return@post
                    }
                    val request = runCatching { call.receive<JsonObject>() }.getOrElse {
                        call.respond(HttpStatusCode.BadRequest, errorBody(null, epoch, "invalid_request", "Request body must be a JSON object"))
                        return@post
                    }
                    val id = request["id"]?.jsonPrimitive?.contentOrNull
                    val method = request["method"]?.jsonPrimitive?.contentOrNull
                    val params = request["params"] as? JsonObject
                    if (params == null) {
                        call.respond(HttpStatusCode.BadRequest, errorBody(id, epoch, "invalid_request", "params must be a JSON object"))
                        return@post
                    }
                    if (id.isNullOrBlank() || id.length > 128 || method.isNullOrBlank()) {
                        call.respond(HttpStatusCode.BadRequest, errorBody(id, epoch, "invalid_request", "id and method are required"))
                        return@post
                    }
                    val requestEpoch = request["epoch"]?.jsonPrimitive?.longOrNull
                    if (method !in epochOptionalMethods && requestEpoch == null) {
                        call.respond(HttpStatusCode.BadRequest, errorBody(id, epoch, "invalid_request", "epoch is required for this method"))
                        return@post
                    }
                    if (requestEpoch != null && requestEpoch != epoch) {
                        call.respond(HttpStatusCode.Conflict, errorBody(id, epoch, "stale_epoch", "Request epoch is stale"))
                        return@post
                    }
                    val epochAtStart = epoch
                    val playbackStartJob = if (method == "playback.start") currentCoroutineContext()[Job] else null
                    if (playbackStartJob != null) requestJobs.put("playback", playbackStartJob)?.cancel()
                    val result = try { runCatching {
                        if (method == "playback.stop") {
                            // A stop must be able to cancel a start resolving under rpcMutex.
                            // This also cancels starts still queued behind another RPC.
                            requestJobs.remove("playback")?.cancel()
                            KidsBridge.authorize(method, params)
                            dispatch(method, params, id)
                        } else rpcMutex.withLock {
                            if (requestEpoch != null && requestEpoch != epoch) error("STALE_EPOCH")
                            KidsBridge.authorize(method, params)
                            dispatch(method, params, id)
                        }
                    } } finally {
                        if (playbackStartJob != null) requestJobs.remove("playback", playbackStartJob)
                    }
                    result.fold(
                        onSuccess = {
                            if (epochAtStart != epoch && method !in epochChangingMethods) {
                                call.respond(HttpStatusCode.Conflict, errorBody(id, epoch, "stale_epoch", "Request became stale while running"))
                            } else {
                                val committedEpoch = epoch
                                val safeResult = KidsBridge.sanitizeReply(method, it)
                                if (committedEpoch != epoch) call.respond(HttpStatusCode.Conflict, errorBody(id, epoch, "stale_epoch", "Profile changed while checking content"))
                                else call.respond(buildJsonObject { put("id", id); put("epoch", epoch); put("result", safeResult) })
                            }
                        },
                        onFailure = { error ->
                            if (error is CancellationException) throw error
                            val stale = error.message == "STALE_EPOCH"
                            call.respond(if (stale) HttpStatusCode.Conflict else HttpStatusCode.OK,
                                errorBody(id, epoch, if (stale) "stale_epoch" else (error as? BridgeFeatureException)?.code ?: "operation_failed", if (stale) "Request epoch is stale" else safeMessage(error)))
                        },
                    )
                }
                webSocket("/events") {
                    if (!authorized(call.request.headers["Authorization"])) {
                        close()
                        return@webSocket
                    }
                    val sender: suspend (JsonObject) -> Unit = { event -> send(Frame.Text(event.toString())) }
                    try {
                        eventMutex.withLock {
                            sendInitialSnapshots(sender)
                            eventClients += sender
                        }
                        // Keep the session alive; this protocol uses server-pushed events only.
                        for (frame in incoming) if (frame is Frame.Close) break
                    } finally {
                        eventClients -= sender
                    }
                }
            }
        }.start(wait = false)
        server = running
        val connector = running.engine.resolvedConnectors().first()
        connector.port
    }

    suspend fun stop() = lifecycle.withLock {
        HomeBridge.reset()
        syncLifecycle.stop()
        runCatching { playbackAdapter?.shutdown() }
        server?.stop(250, 1_000)
        server = null
        runtimeScope?.cancel()
        runtimeScope = null
        eventClients.clear()
        synchronized(streamRegistry) { streamRegistry.clear() }
        authToken = null
    }

    private suspend fun observeAuthentication() {
        AuthRepository.state.collect { state ->
            val previous = sessionStatus
            sessionProfilesReady = false
            sessionStatus = when (state) {
                AuthState.Loading -> "loading"
                AuthState.Unauthenticated -> "signedOut"
                is AuthState.Authenticated -> "signedIn"
            }
            val currentUserId = (state as? AuthState.Authenticated)?.userId
            if (hasObservedAuthUser && currentUserId != observedAuthUserId) {
                advanceEpoch()
                HomeRepository.clear()
            }
            observedAuthUserId = currentUserId
            hasObservedAuthUser = true
            if (state is AuthState.Authenticated) {
                runCatching {
                    ProfileRepository.ensureLoaded(state.userId)
                    // Publish the account's local profiles before cloud requests.
                    // A first sign-in with no cache still waits for its profile pull.
                    if (ProfileRepository.state.value.profiles.isNotEmpty()) {
                        sessionProfilesReady = true
                        emit("session", sessionJson())
                    }
                    // Cached profile state is sufficient to schedule cloud sync;
                    // a failed profile/addon request must not prevent progress pulls.
                    updateProfileSync()
                    ProfileRepository.pullProfiles()
                    if ((AuthRepository.state.value as? AuthState.Authenticated)?.userId != state.userId) return@collect
                    sessionProfilesReady = true
                    emit("session", sessionJson())
                    val profiles = ProfileRepository.state.value.profiles
                    val active = ProfileRepository.state.value.activeProfile
                        ?: profiles.firstOrNull { it.profileIndex == ProfileRepository.activeProfileId }
                        ?: profiles.firstOrNull()
                    if (active != null && active.profileIndex != ProfileRepository.activeProfileId) {
                        advanceEpoch()
                        ProfileRepository.switchToProfile(active.profileIndex)
                    }
                    val profileId = active?.profileIndex ?: ProfileRepository.activeProfileId
                    updateProfileSync()
                    rpcMutex.withLock {
                        if (ProfileRepository.activeProfileId != profileId ||
                            (AuthRepository.state.value as? AuthState.Authenticated)?.userId != state.userId
                        ) return@collect
                        AddonRepository.onProfileChanged(profileId)
                    }
                    AddonRepository.pullFromServer(profileId)
                    // Selection can now happen while startup sync is in flight.
                    if (ProfileRepository.activeProfileId != profileId ||
                        (AuthRepository.state.value as? AuthState.Authenticated)?.userId != state.userId
                    ) return@collect
                    // A brand-new main profile has no add-ons yet; install the built-in
                    // defaults so the account is not stuck on an empty Home.
                    AddonRepository.seedDefaultAddonsIfEmpty(profileId)
                    if (AppFeaturePolicy.pluginsEnabled) PluginRepository.onProfileChanged(profileId)
                    val enabledAddons = AddonRepository.uiState.value.addons.enabledAddons().forKidsCatalogs()
                    // Match AppGate/MainAppContent: load the profile's home catalog settings
                    // before refreshing home so the featured hero sources and catalog order
                    // are initialized for the first snapshot.
                    HomeCatalogSettingsRepository.syncCatalogs(enabledAddons)
                    HomeCatalogSettingsRepository.syncCollections(
                        collections = CollectionRepository.collections.value,
                        addons = enabledAddons,
                    )
                    HomeRepository.refresh(enabledAddons)
                    LibraryRepository.ensureLoaded()
                    sessionError = null
                    // Once the active profile has settled, warm every profile's
                    // manifest cache so the next switch can paint Home immediately.
                    runtimeScope?.launch {
                        delay(ADDON_MANIFEST_PREFETCH_DELAY_MS)
                        runCatching {
                            AddonRepository.prefetchManifests(
                                ProfileRepository.state.value.profiles.map { it.profileIndex },
                            )
                        }
                    }
                }.onFailure {
                    sessionProfilesReady = true
                    sessionError = safeMessage(it)
                }
            } else updateProfileSync()
            emit("session", sessionJson())
        }
    }

    private val epochChangingMethods = setOf("session.signIn", "session.signUp", "session.guest", "session.signOut", "profiles.select", "profiles.delete")
    private val epochOptionalMethods = setOf("session.snapshot", "session.signIn", "session.signUp", "session.guest", "playback.hostFullscreenChanged")

    private suspend fun dispatch(method: String, params: JsonObject, requestId: String): JsonElement = when (method) {
        "session.snapshot" -> sessionJson()
        "session.signIn" -> {
            requireParam(params, "email"); requireParam(params, "password")
            AuthRepository.signInWithEmail(params.str("email"), params.str("password")).getOrThrow()
            awaitAuthTransition()
            sessionJson()
        }
        "session.signUp" -> {
            requireParam(params, "email"); requireParam(params, "password")
            AuthRepository.signUpWithEmail(params.str("email"), params.str("password")).getOrThrow()
            awaitAuthTransition()
            sessionJson()
        }
        "session.guest" -> { AuthRepository.signInAnonymously(); sessionJson() }
        "session.signOut" -> {
            runCatching { playbackAdapter?.stop() }
            // Local sign-out is authoritative: AuthRepository clears the local
            // session and wipes account data even when it reports a remote
            // failure (e.g. offline). Failing this RPC for that would strand
            // the UI on a stale epoch instead of routing to the login screen.
            runCatching { AuthRepository.signOut() }
            sessionProfilesReady = false
            sessionStatus = "signedOut"
            sessionError = null
            advanceEpoch()
            sessionJson()
        }
        "profiles.select" -> {
            val selected = params.int("id")
            require(ProfileRepository.state.value.profiles.any { it.profileIndex == selected }) { "Profile does not exist" }
            ProfilesBridge.authorizeSelection(selected, params.optionalStr("pin"))
            playbackAdapter?.stop()
            MetaDetailsRepository.clear()
            StreamsRepository.clear()
            lastDetails = null
            loadedVideoId = null
            advanceEpoch()
            // Returning from the editor and choosing the current profile must not
            // clear loaded Home/settings repositories without a real profile change.
            if (ProfileRepository.activeProfileId != selected) ProfileRepository.switchToProfile(selected)
            updateProfileSync()
            // ProfileRepository has already reset profile-scoped state. Let Home
            // reuse matching, fresh catalog entries instead of forcing every
            // catalog request to hit the network on each profile selection.
            refreshHomeAfterAddonChange()
            // Pull this profile's add-ons from the cloud in the background: local
            // storage can be stale, and the switch must not wait on the network.
            runtimeScope?.launch {
                runCatching { AddonRepository.pullFromServer(selected) }
                runCatching { AddonRepository.seedDefaultAddonsIfEmpty(selected) }
            }
            sessionJson()
        }
        "home.snapshot" -> homeJson()
        "home.refresh" -> {
            if (AddonRepository.uiState.value.profileLoadError != null) AddonRepository.pullFromServer(ProfileRepository.activeProfileId)
            HomeRepository.refresh(AddonRepository.uiState.value.addons, force = true)
            homeJson()
        }
        "addons.snapshot" -> addonsJson()
        "addons.install" -> {
            val raw = params.str("url")
            when (val outcome = AddonRepository.addAddon(raw)) {
                is AddAddonResult.Success -> Unit
                is AddAddonResult.Error -> error(outcome.message)
            }
            refreshHomeAfterAddonChange()
            addonsJson()
        }
        "addons.toggle" -> { AddonRepository.setAddonEnabled(params.str("id"), params.bool("enabled")); refreshHomeAfterAddonChange(); addonsJson() }
        "addons.remove" -> { AddonRepository.removeAddon(params.str("id")); refreshHomeAfterAddonChange(); addonsJson() }
        "addons.refresh" -> { AddonRepository.refreshAddon(params.str("id"), forceRefresh = true); refreshHomeAfterAddonChange(); addonsJson() }
        "addons.refreshAll" -> { AddonRepository.refreshAll(); refreshHomeAfterAddonChange(); addonsJson() }
        "addons.move" -> { AddonRepository.moveAddon(params.int("from"), params.int("to")); refreshHomeAfterAddonChange(); addonsJson() }
        "library.snapshot" -> libraryJson()
        "library.add" -> {
            val mediaId = params.str("id")
            val mediaType = params.str("type")
            val d = MetaDetailsRepository.fetch(mediaType, mediaId) ?: error("Media was not found")
            if (!LibraryRepository.isSaved(mediaId, mediaType)) {
                val result = LibraryRepository.toggleSaved(d.toLibraryItem(System.currentTimeMillis()))
                if (result.requiresRemovalConfirmation) error("This item requires removal confirmation")
            }
            libraryJson()
        }
        "library.remove" -> {
            val mediaId = params.str("id")
            val item = LibraryRepository.uiState.value.items.firstOrNull { it.id == mediaId }
            if (item == null) LibraryRepository.remove(mediaId) else {
                val result = LibraryRepository.toggleSaved(item)
                if (result.requiresRemovalConfirmation) error("This item requires removal confirmation")
            }
            libraryJson()
        }
        "settings.snapshot" -> settingsJson()
        "settings.setTheme" -> {
            ThemeSettingsRepository.setTheme(AppTheme.valueOf(params.str("theme").uppercase()))
            settingsJson()
        }
        "search.start" -> {
            val query = params.str("query")
            prepareRequest("search", requestId)
            SearchRepository.search(query, AddonRepository.uiState.value.addons)
            requestQueries["search"] = query
            activateRequest("search", requestId)
            searchJson(requestId, query)
        }
        "details.load" -> {
            val type = params.str("type"); val id = params.str("id")
            loadedVideoId = params.optionalStr("videoId")
            prepareRequest("details", requestId)
            MetaDetailsRepository.load(type, id)
            activateRequest("details", requestId)
            detailsJson(requestId)
        }
        "streams.load" -> {
            val type = params.str("type"); val videoId = params.str("videoId")
            val parentId = params.optionalStr("parentMetaId")
            prepareRequest("streams", requestId)
            val meta = parentId?.let { MetaDetailsRepository.peek(type, it) ?: MetaDetailsRepository.fetch(type, it) }
                ?: lastDetails?.takeIf { it.id == parentId && it.type == type }
            val video = meta?.videos?.firstOrNull { it.id == videoId }
            val season = params.optionalInt("season") ?: video?.season
            val episode = params.optionalInt("episode") ?: video?.episode
            streamContext[requestId] = meta to videoId
            // Every rewrite entry (manual or autoplay) starts a new source search,
            // cancelling the previous one and bypassing unchanged-request reuse.
            StreamsRepository.reload(type, videoId, parentId, season, episode, manualSelection = params["manualSelection"]?.jsonPrimitive?.booleanOrNull ?: false, contentTitle = streamContext[requestId]?.first?.name)
            activateRequest("streams", requestId)
            // Publish after activation so early repository events cannot leave
            // the frontend waiting under the previous request identity.
            val snapshot = streamsJson(requestId)
            emit("streams", snapshot)
            emit("streamSelection", streamSelectionJson())
            snapshot
        }
        "streams.resolve" -> {
            val record = synchronized(streamRegistry) { streamRegistry[params.str("streamId")] } ?: error("Stream is no longer available")
            KidsBridge.requireMedia(record.meta?.type, record.meta?.id)
            resolveStream(params.str("streamId"))
        }
        "playback.start" -> {
            val record = synchronized(streamRegistry) { streamRegistry[params.str("streamId")] }
                ?: error("Stream is no longer available")
            KidsBridge.requireMedia(record.meta?.type, record.meta?.id)
            val result = (playbackAdapter ?: error("Native playback is unavailable"))
                .start(
                    record.stream,
                    record.meta,
                    record.videoId,
                    params["startFromBeginning"]?.jsonPrimitive?.booleanOrNull ?: false,
                    params["tauriHostWindow"]?.jsonPrimitive?.longOrNull,
                    params["tauriHostFullscreen"]?.jsonPrimitive?.booleanOrNull ?: false,
                )
            emit("playback", buildJsonObject {
                put("playing", true)
                put("active", true)
                put("state", "playing")
                put("streamId", params.str("streamId"))
                put("host", result["host"] ?: JsonNull)
                put("result", result)
            })
            result
        }
        "playback.hostFullscreenChanged" -> {
            withContext(Dispatchers.Swing) {
                com.nuvio.app.features.player.desktop.EmbeddedTauriPlayerHost.updateFullscreen(params.bool("fullscreen"))
            }
            JsonObject(emptyMap())
        }
        "playback.stop" -> {
            playbackAdapter?.stop()
            emit("playback", buildJsonObject { put("playing", false); put("active", false); put("state", "stopped") })
            JsonObject(emptyMap())
        }
        "playback.restoreFromPip" -> {
            withContext(Dispatchers.Swing) {
                com.nuvio.app.features.player.desktop.DesktopPlayerPictureInPicture.clear()
            }
            JsonObject(emptyMap())
        }
        "app.openExternal" -> {
            val uri = java.net.URI(params.str("url"))
            require(uri.scheme?.lowercase() in setOf("http", "https") && !uri.host.isNullOrBlank() && uri.userInfo == null) { "Expected a web URL" }
            kotlinx.coroutines.withContext(Dispatchers.IO) { java.awt.Desktop.getDesktop().browse(uri) }
            buildJsonObject { put("opened", true) }
        }
        "posters.resolve" -> {
            val screen = com.nuvio.app.core.poster.CustomPosterScreen.entries.firstOrNull { it.key == params.str("screen") } ?: error("Unknown poster screen")
            val repository = com.nuvio.app.core.poster.CustomPosterUrlRepository
            val id = params.str("id")
            val type = params.str("type")
            val imdbId = LibraryRepository.uiState.value.items.firstOrNull { it.id == id && it.type == type }?.imdbId
                ?: lastDetails?.takeIf { it.id == id && it.type == type }?.imdbId
            val url = AppearanceBridge.resolvePosterPattern(repository.patternForScreen(screen), id, type, params.optionalStr("shape") ?: "poster", imdbId)
            buildJsonObject { putNullable("url", url) }
        }
        "downloads.enqueue" -> enqueueDownload(params)
        "cloud.play" -> {
            val (item, file) = LibraryExtrasBridge.target(params.str("itemKey"), params.str("fileKey"))
            // Cloud files have no verified movie/series identity. Keep the
            // existing fail-closed content rule when opening feature access.
            KidsBridge.requireMedia("cloud", item.stableKey)
            val result = com.nuvio.app.features.cloud.CloudLibraryRepository.resolvePlayback(item, file)
            val playable = result as? com.nuvio.app.features.cloud.CloudLibraryPlaybackResult.Success ?: error("Cloud file could not be resolved")
            val videoId = "${item.stableKey}:${file.stableKey}"
            val meta = MetaDetails(id = item.stableKey, type = "cloud", name = item.name, videos = listOf(MetaVideo(id = videoId, title = file.name)))
            (playbackAdapter ?: error("Native playback unavailable")).start(
                StreamItem(url = playable.url, addonName = item.providerName, addonId = "cloud:${item.providerId}"),
                meta,
                videoId,
                nativeHostWindow = params["tauriHostWindow"]?.jsonPrimitive?.longOrNull,
                nativeHostFullscreen = params["tauriHostFullscreen"]?.jsonPrimitive?.booleanOrNull ?: false,
            )
        }
        "downloads.play" -> {
            val item = DownloadsBridge.getPlayableItem(params.str("id")) ?: error("Downloaded file is unavailable")
            KidsBridge.requireMedia(item.parentMetaType, item.parentMetaId)
            val uri = DownloadsRepository.playableLocalFileUri(item) ?: error("Downloaded file is unavailable")
            val meta = MetaDetailsRepository.peek(item.parentMetaType, item.parentMetaId)
                ?: MetaDetails(id = item.parentMetaId, type = item.parentMetaType, name = item.title, poster = item.poster, background = item.background,
                    videos = listOf(MetaVideo(id = item.videoId, title = item.episodeTitle ?: item.title, season = item.seasonNumber, episode = item.episodeNumber, thumbnail = item.episodeThumbnail)))
            (playbackAdapter ?: error("Native playback is unavailable")).start(
                StreamItem(url = uri, addonName = item.providerName, addonId = "local-download"),
                meta,
                item.videoId,
                nativeHostWindow = params["tauriHostWindow"]?.jsonPrimitive?.longOrNull,
                nativeHostFullscreen = params["tauriHostFullscreen"]?.jsonPrimitive?.booleanOrNull ?: false,
            )
        }
        "app.visibility" -> {
            val visible = params.bool("visible")
            appVisible = visible
            if (visible) {
                // Tauri owns the visible player window; the offscreen Compose host
                // never receives its OS focus events.
                notifyDesktopWindowGainedFocus()
                NetworkStatusRepository.requestForegroundRefresh()
                DeviceSessionRegistration.registerIfAuthenticated()
                MemberAccessRepository.refreshIfStale()
            }
            updateProfileSync()
            buildJsonObject { put("visible", visible) }
        }
        "app.shutdown" -> {
            playbackAdapter?.shutdown()
            runtimeScope?.launch { kotlinx.coroutines.delay(100); stop() }
            JsonObject(emptyMap())
        }
        else -> dispatchFeature(method, params) ?: error("Unknown method: $method")
    }

    private suspend fun enqueueDownload(params: JsonObject): JsonObject {
        val record = synchronized(streamRegistry) { streamRegistry[params.str("streamId")] } ?: error("Stream is no longer available")
        val meta = record.meta ?: error("Load title details before downloading")
        KidsBridge.requireMedia(meta.type, meta.id)
        val video = meta.videos.firstOrNull { it.id == record.videoId }
        val stream = if (!DirectDebridPlaybackResolver.shouldResolveToPlayableStream(record.stream)) record.stream else {
            val result = DirectDebridPlaybackResolver.resolveToPlayableStream(record.stream, video?.season, video?.episode)
            (result as? DirectDebridPlayableResult.Success)?.stream ?: error("The stream could not be resolved for download")
        }
        return when (val result = DownloadsBridge.enqueue(stream, meta, video, params["replaceConfirmed"]?.jsonPrimitive?.booleanOrNull == true)) {
            is DownloadEnqueueBridgeResult.RequiresReplacementConfirmation -> buildJsonObject { put("requiresConfirmation", true); put("existing", result.existingDownload) }
            is DownloadEnqueueBridgeResult.Enqueued -> {
                when (result.result) {
                    DownloadEnqueueResult.MissingUrl -> error("This stream has no downloadable URL")
                    DownloadEnqueueResult.UnsupportedFormat -> error("This stream format does not support downloads")
                    else -> Unit
                }
                emit("downloads", result.snapshot)
                buildJsonObject { put("requiresConfirmation", false); put("snapshot", result.snapshot) }
            }
        }
    }

    private fun p2pJson(): JsonObject {
        com.nuvio.app.features.p2p.P2pSettingsRepository.ensureLoaded()
        val state = com.nuvio.app.features.p2p.P2pSettingsRepository.uiState.value
        return buildJsonObject {
            put("enabled", state.p2pEnabled); put("uploadEnabled", state.enableUpload)
            put("hideTorrentStats", state.hideTorrentStats); put("torrentProfile", state.torrentProfile.name.lowercase())
            put("cacheSize", state.cacheSize.name.lowercase()); put("available", com.nuvio.app.features.p2p.P2pSettingsRepository.isVisible)
        }
    }

    private suspend fun dispatchFeature(method: String, params: JsonObject): JsonElement? {
        val previousProfile = ProfileRepository.activeProfileId
        if (method == "profiles.delete" && params.optionalInt("id") == previousProfile) playbackAdapter?.stop()
        val result = ProfilesBridge.dispatch(method, params)
            ?: AppearanceBridge.dispatch(method, params)
            ?: CatalogBridge.dispatch(method, params)
            ?: DownloadsBridge.dispatch(method, params)
            ?: PluginsBridge.dispatch(method, params)
            ?: DetailsExtrasBridge.dispatch(method, params)
            ?: ServersBridge.dispatch(method, params)
            ?: LibraryExtrasBridge.dispatch(method, params)
            ?: PlaybackSettingsBridge.dispatch(method, params)
            ?: MetadataSettingsBridge.dispatch(method, params)
            ?: HomeBridge.dispatch(method, params)
            ?: AuthOptionsBridge.dispatch(method, params)
            ?: IntegrationsBridge.dispatch(method, params)
            ?: CollectionsBridge.dispatch(method, params)
            ?: AboutBridge.dispatch(method, params)
            ?: StreamSelectionBridge.dispatch(method, params) { id -> synchronized(streamRegistry) { streamRegistry[id]?.stream } }
            ?: return null
        if (previousProfile != ProfileRepository.activeProfileId) {
            updateProfileSync()
            advanceEpoch()
            HomeRepository.clear()
            AppearanceBridge.synchronizeHomeCatalogs()
            HomeRepository.refresh(AddonRepository.uiState.value.addons, force = true)
        }
        val topic = when {
            method.startsWith("streams.") -> "streamSelection"
            method.startsWith("collections.editor.") -> "collectionEditor"
            method.startsWith("collections.folder.") -> "folderDetail"
            method.startsWith("search.history") -> "searchHistory"
            else -> method.substringBefore('.')
        }
        val snapshot = when (topic) {
            "profiles" -> ProfilesBridge.snapshot()
            "appearance" -> AppearanceBridge.snapshot()
            "posters" -> AppearanceBridge.posterSnapshot()
            "homePreferences" -> AppearanceBridge.homePreferencesSnapshot()
            "continueWatching" -> AppearanceBridge.continueWatchingSnapshot()
            "downloads" -> DownloadsBridge.snapshot()
            "plugins" -> PluginsBridge.snapshot()
            "cloud" -> LibraryExtrasBridge.cloudSnapshot()
            "servers" -> ServersBridge.snapshot()
            "library" -> LibraryExtrasBridge.snapshot()
            "playbackSettings" -> PlaybackSettingsBridge.snapshot()
            "metadataSettings" -> MetadataSettingsBridge.snapshot()
            "p2p" -> PlaybackSettingsBridge.p2pSnapshot()
            "home" -> HomeBridge.snapshot()
            "authOptions" -> AuthOptionsBridge.snapshot()
            "integrations" -> IntegrationsBridge.snapshot()
            "tmdb" -> IntegrationsBridge.tmdbSnapshot()
            "mdblist" -> IntegrationsBridge.mdbSnapshot()
            "debrid" -> IntegrationsBridge.debridSnapshot()
            "simkl" -> IntegrationsBridge.simklSnapshot()
            "trackingSettings" -> IntegrationsBridge.trackingSnapshot()
            "about" -> AboutBridge.snapshot()
            "advanced" -> AboutBridge.advancedSnapshot()
            "streamSelection" -> streamSelectionJson()
            else -> CatalogBridge.snapshot(topic) ?: CollectionsBridge.snapshot(topic)
        }
        snapshot?.let { emit(when(topic) { "library" -> "libraryExtras"; "home" -> "homeExtras"; else -> topic }, it) }
        if (topic in setOf("appearance", "posters", "homePreferences", "continueWatching")) {
            emit("appearance", AppearanceBridge.snapshot())
            emit("settings", settingsJson())
            emit("home", homeJson())
        }
        return result
    }

    private suspend fun refreshHomeAfterAddonChange() {
        AddonRepository.initialize()
        val enabledAddons = AddonRepository.uiState.value.addons.enabledAddons().forKidsCatalogs()
        HomeCatalogSettingsRepository.syncCatalogs(enabledAddons)
        HomeCatalogSettingsRepository.syncCollections(
            collections = CollectionRepository.collections.value,
            addons = enabledAddons,
        )
        HomeRepository.refresh(enabledAddons)
    }

    private val latestRequest = java.util.concurrent.ConcurrentHashMap<String, String>()
    private val streamContext = java.util.concurrent.ConcurrentHashMap<String, Pair<MetaDetails?, String?>>()
    private fun prepareRequest(feature: String, requestId: String) {
        require(requestId.isNotBlank())
        requestJobs.remove(feature)?.cancel()
        if (feature == "streams") {
            synchronized(streamRegistry) { streamRegistry.clear() }
            streamContext.clear()
        }
    }

    private fun activateRequest(feature: String, requestId: String) {
        latestRequest[feature] = requestId
    }

    private suspend fun awaitAuthTransition() {
        repeat(40) {
            if (AuthRepository.state.value is AuthState.Authenticated) return
            kotlinx.coroutines.delay(50)
        }
    }

    private fun advanceEpoch(): Long {
        val next = currentEpoch.incrementAndGet()
        latestRequest.clear()
        requestQueries.clear()
        streamContext.clear()
        requestJobs.values.forEach(Job::cancel)
        requestJobs.clear()
        synchronized(streamRegistry) { streamRegistry.clear() }
        CatalogBridge.reset()
        HomeBridge.reset()
        IntegrationsBridge.reset()
        CollectionsBridge.reset()
        emit("session", sessionJson())
        return next
    }

    private fun authorized(header: String?): Boolean {
        val supplied = header?.removePrefix("Bearer ") ?: return false
        val expected = authToken ?: return false
        return MessageDigest.isEqual(supplied.toByteArray(Charsets.UTF_8), expected.toByteArray(Charsets.UTF_8))
    }

    private suspend fun sendInitialSnapshots(sender: suspend (JsonObject) -> Unit) {
        val snapshotEpoch = epoch
        listOf(
            "session" to sessionJson(), "home" to homeJson(), "library" to libraryJson(),
            "addons" to addonsJson(), "settings" to settingsJson(), "search" to searchJson("idle-${epoch}", ""),
            "details" to detailsJson("idle-${epoch}"), "streams" to streamsJson("idle-${epoch}"),
            "playback" to buildJsonObject { put("playing", false) },
            "profiles" to ProfilesBridge.snapshot(), "appearance" to AppearanceBridge.snapshot(),
            "downloads" to DownloadsBridge.snapshot(),
            "plugins" to PluginsBridge.snapshot(),
            "servers" to ServersBridge.snapshot(), "libraryExtras" to LibraryExtrasBridge.snapshot(), "cloud" to LibraryExtrasBridge.cloudSnapshot(),
            "homeExtras" to HomeBridge.snapshot(),
            "authOptions" to AuthOptionsBridge.snapshot(),
            "catalog" to CatalogBridge.snapshot("catalog")!!, "discover" to CatalogBridge.snapshot("discover")!!,
            "searchHistory" to CatalogBridge.snapshot("searchHistory")!!,
        ).forEach { (topic, data) ->
            val safeData = KidsBridge.sanitizeTopic(topic, data)
            if (snapshotEpoch != epoch) return
            sender(eventJson(topic, safeData))
        }
    }

    private fun emit(topic: String, data: JsonObject) {
        val emittedEpoch = epoch
        runtimeScope?.launch {
            eventMutex.withLock {
                if (emittedEpoch != epoch) return@withLock
                val safeData = KidsBridge.sanitizeTopic(topic, data)
                if (emittedEpoch != epoch) return@withLock
                val message = eventJson(topic, safeData)
                eventClients.forEach { client ->
                    try {
                        client(message)
                    } catch (cancelled: CancellationException) {
                        throw cancelled
                    } catch (failure: Throwable) {
                        System.err.println("[BridgeEvents] delivery failed topic=$topic kind=${failure::class.simpleName}")
                        if (topic == "streams") {
                            val fallback = buildJsonObject {
                                put("requestId", data["requestId"] ?: JsonPrimitive("idle"))
                                put("loading", false); put("error", "Could not display stream results. Please try again.")
                                put("groups", JsonArray(emptyList()))
                            }
                            runCatching { client(eventJson(topic, fallback)) }
                        }
                    }
                }
            }
        }
    }

    private fun emitIntegrations() {
        val snapshot = IntegrationsBridge.snapshot()
        emit("integrations", snapshot)
        mapOf("tmdb" to "tmdb", "mdblist" to "mdblist", "debrid" to "debrid", "simkl" to "simkl", "trackingSettings" to "tracking").forEach { (topic, key) ->
            (snapshot[key] as? JsonObject)?.let { emit(topic, it) }
        }
    }

    private fun eventJson(topic: String, data: JsonObject) = buildJsonObject {
        put("topic", topic); put("epoch", epoch); put("revision", revisions.incrementAndGet()); put("data", data)
    }

    private fun sessionJson(): JsonObject {
        val auth = AuthRepository.state.value as? AuthState.Authenticated
        val profile = ProfileRepository.state.value
        return buildJsonObject {
            put("status", if (sessionStatus == "signedIn" && !sessionProfilesReady) "loading" else sessionStatus); putNullable("email", auth?.email); put("version", versionName())
            if (auth != null && profile.activeProfile != null) put("activeProfile", profile.activeProfile!!.profileIndex) else put("activeProfile", JsonNull)
            put("profiles", JsonArray(profile.profiles.map(::profileJson)))
            put("capabilities", JsonArray(listOf("auth", "profiles", "home", "library", "addons", "settings", "search", "details", "streams").map(::JsonPrimitive)))
            putNullable("error", sessionError ?: AuthRepository.error.value)
            put("networkCondition", NetworkStatusRepository.uiState.value.condition.name)
        }
    }

    private fun profileJson(profile: NuvioProfile) = buildJsonObject {
        put("id", profile.profileIndex); put("name", profile.name); putNullable("avatarUrl", profile.avatarUrl)
        put("color", profile.avatarColorHex); put("kidsEnabled", profile.kidsEnabled); put("kidsMaxRating", profile.kidsMaxRating)
        put("locked", profile.pinEnabled)
    }

    private data class HeroLoadInput(
        val items: List<MetaPreview>,
        val ratings: com.nuvio.app.features.mdblist.MdbListSettings,
        val tmdb: com.nuvio.app.features.tmdb.TmdbSettings,
        val profileId: Int?,
    )

    private fun homeJson() = buildJsonObject {
        val state = HomeRepository.uiState.value
        val addons = AddonRepository.uiState.value
        put("loading", isHomeContentLoading(state.isLoading, addons)); putNullable("error", homeContentError(state.errorMessage, addons, state.sections.isNotEmpty() || state.heroItems.isNotEmpty()))
        val ratings = com.nuvio.app.features.mdblist.MdbListSettingsRepository.uiState.value
        val showRating = com.nuvio.app.features.details.MetaScreenSettingsRepository.uiState.value.showOverallRatings
        put("hero", JsonArray(state.heroItems.map { item ->
            val enriched = HomeHeroMetaRepository.metas.value[item.stableKey()]?.let(item::withHeroMeta) ?: item
            mediaJson(enriched.copy(
                imdbRating = enriched.imdbRating.takeIf { showRating },
                externalRatings = enriched.externalRatings.takeIf { ratings.isActive && ratings.showOnHero }.orEmpty(),
            ))
        }))
        put("shelves", JsonArray(state.sections.map(::shelfJson)))
        put("continueWatching", JsonArray(WatchProgressRepository.continueWatching().map { entry -> buildJsonObject {
            put("id", entry.parentMetaId); put("type", entry.parentMetaType); put("name", entry.episodeTitle ?: entry.title)
            putNullable("poster", entry.episodeThumbnail ?: entry.poster); putNullable("background", entry.background)
            putNullable("logo", entry.logo); putNullable("description", entry.pauseDescription); putNullable("releaseInfo", null as String?)
            putNullable("rating", null as String?); put("genres", JsonArray(emptyList()))
        } }))
    }

    private fun shelfJson(section: HomeCatalogSection) = buildJsonObject {
        put("key", section.key); put("title", section.title); put("subtitle", section.subtitle)
        put("items", JsonArray(section.items.map(::mediaJson))); put("hasMore", section.hasMore || section.availableItemCount > section.items.size)
    }

    private fun mediaJson(item: MetaPreview) = buildJsonObject {
        put("id", item.id); put("type", item.type); put("name", item.name); putNullable("poster", item.poster); putNullable("rawPoster", item.rawPosterUrl)
        putNullable("background", item.banner ?: item.landscapePoster); putNullable("logo", item.logo)
        putNullable("description", item.description); putNullable("releaseInfo", item.releaseInfo)
        putNullable("rating", item.imdbRating); put("genres", JsonArray(item.genres.map(::JsonPrimitive)))
        putNullable("runtime", item.runtime); putNullable("status", item.status)
        putNullable("ageRating", item.ageRating); putNullable("language", item.language)
        put("externalRatings", JsonArray(item.externalRatings.map { rating -> buildJsonObject {
            put("source", rating.source); put("value", rating.value)
        } }))
    }

    private fun libraryJson() = buildJsonObject {
        val state = LibraryRepository.uiState.value
        put("loading", state.isLoading); putNullable("error", state.errorMessage)
        put("items", JsonArray(state.items.map { item -> buildJsonObject {
            put("id", item.id); put("type", item.type); put("name", item.name); putNullable("poster", item.poster); putNullable("rawPoster", item.rawPosterUrl)
            putNullable("background", item.banner ?: item.landscapePoster); putNullable("logo", item.logo)
            putNullable("description", item.description); putNullable("releaseInfo", item.releaseInfo)
            putNullable("rating", item.imdbRating); put("genres", JsonArray(item.genres.map(::JsonPrimitive)))
        } }))
    }

    private fun addonsJson() = buildJsonObject {
        put("items", JsonArray(AddonRepository.uiState.value.addons.map(::addonJson)))
    }
    private fun addonJson(addon: ManagedAddon) = buildJsonObject {
        put("id", addon.manifestUrl); put("name", addon.displayTitle)
        put("manifestUrl", addon.manifestUrl); put("enabled", addon.enabled)
        putNullable("description", addon.manifest?.description); putNullable("logo", addon.manifest?.logoUrl)
        put("refreshing", addon.isRefreshing); putNullable("error", addon.errorMessage)
        put("configurable", addon.manifest?.behaviorHints?.let { it.configurable || it.configurationRequired } ?: false)
        addon.manifest?.let { manifest ->
            put("version", manifest.version)
            put("resources", JsonArray(manifest.resources.map { resource -> buildJsonObject {
                put("name", resource.name)
                put("types", JsonArray(resource.types.map(::JsonPrimitive)))
                put("idPrefixes", JsonArray(resource.idPrefixes.map(::JsonPrimitive)))
            } }))
            put("catalogCount", manifest.catalogs.size)
            put("types", JsonArray(manifest.types.map(::JsonPrimitive)))
        }
    }

    private fun settingsJson() = buildJsonObject {
        val theme = ThemeSettingsRepository.selectedTheme.value
        put("theme", theme.name.lowercase())
        put("themes", JsonArray(availableAppThemes(MemberAccessRepository.access.value.entitlements).map { choice ->
            val palette = ThemeColors.getColorPalette(choice, ThemeSettingsRepository.customThemeColors.value)
            buildJsonObject {
            put("id", choice.name.lowercase()); put("label", choice.name.replace('_', ' ').lowercase().replaceFirstChar(Char::uppercase))
            put("background", palette.background.hex()); put("accent", palette.secondary.hex()); put("surface", palette.backgroundCard.hex()); put("settingsSurface", palette.backgroundElevated.hex())
            put("accentVariant", palette.secondaryVariant.hex())
            put("onAccent", palette.onSecondary.hex()); put("onAccentVariant", palette.onSecondaryVariant.hex())
            put("focusRing", palette.focusRing.hex()); put("focusBackground", palette.focusBackground.hex())
            put("accentGradient", JsonArray(palette.accentGradient.map { JsonPrimitive(it.hex()) }))
            put("nativeAccent", "#${palette.nativeAccentHex.removePrefix("#")}".uppercase())
        } }))
    }

    private fun searchJson(requestId: String?, query: String) = buildJsonObject {
        put("requestId", requestId ?: "idle-${epoch}")
        put("query", query); val state = SearchRepository.uiState.value
        put("loading", state.isLoading); putNullable("error", state.errorMessage)
        put("shelves", JsonArray(state.sections.map(::shelfJson)))
    }

    private fun detailsJson(requestId: String?) = buildJsonObject {
        put("requestId", requestId ?: "idle-${epoch}")
        val state = MetaDetailsRepository.uiState.value
        lastDetails = state.meta
        put("loading", state.isLoading); putNullable("error", state.errorMessage)
        put("loadingSections", JsonArray(state.loadingSections.map { section -> JsonPrimitive(section.name) }))
        val meta = state.meta
        put("media", meta?.let(::mediaJson) ?: JsonNull)
        put("episodes", JsonArray(meta?.videos.orEmpty().map { video -> buildJsonObject {
            put("id", video.id); put("title", video.title); putNullable("season", video.season); putNullable("episode", video.episode)
            putNullable("thumbnail", video.thumbnail); putNullable("overview", video.overview)
        } }))
        put("cast", JsonArray(meta?.cast.orEmpty().map { person -> buildJsonObject { put("name", person.name); putNullable("photo", person.photo) } }))
        put("related", JsonArray(meta?.moreLikeThis.orEmpty().map(::mediaJson)))
    }

    private fun mediaJson(meta: MetaDetails) = buildJsonObject {
        put("id", meta.id); put("type", meta.type); put("name", meta.name); putNullable("poster", meta.poster)
        putNullable("background", meta.background); putNullable("logo", meta.logo); putNullable("description", meta.description)
        putNullable("releaseInfo", meta.releaseInfo); putNullable("rating", meta.imdbRating)
        put("genres", JsonArray(meta.genres.map(::JsonPrimitive)))
    }

    private fun streamsJson(requestId: String?) = buildJsonObject {
        put("requestId", requestId ?: "idle-${epoch}")
        val state = StreamsRepository.uiState.value
        val groups = if (state.downloadFilterMode == com.nuvio.app.features.downloads.DownloadStreamFilterMode.DATA_SAVER) {
            com.nuvio.app.features.downloads.DownloadStreamFilter.apply(state.groups, com.nuvio.app.features.downloads.DownloadFilterSettingsRepository.snapshot()).groups
        } else state.groups
        synchronized(streamRegistry) {
            streamRegistry.clear()
            put("loading", state.isAnyLoading); putNullable("error", null as String?)
            put("groups", JsonArray(groups.map { group -> buildJsonObject {
                put("id", group.addonId); put("name", group.addonName); put("loading", group.isLoading); putNullable("error", group.error)
                put("streams", JsonArray(group.streams.map { stream ->
                    val digest = MessageDigest.getInstance("SHA-256").digest(stream.toString().toByteArray(Charsets.UTF_8)).take(12).joinToString("") { "%02x".format(it) }
                    val streamId = "s-${requestId ?: epoch}-$digest"
                    val (meta, videoId) = requestId?.let(streamContext::get) ?: (lastDetails to loadedVideoId)
                    streamRegistry[streamId] = StreamRecord(stream, meta, videoId)
                    buildJsonObject {
                        put("id", streamId); put("name", stream.streamLabel); put("description", stream.description.orEmpty())
                        put("url", JsonNull); put("source", stream.addonName)
                        put("headers", JsonObject(emptyMap()))
                        put("playable", stream.playableDirectUrl != null || stream.p2pInfoHash != null || DirectDebridPlaybackResolver.shouldResolveToPlayableStream(stream))
                        put("downloadable", stream.p2pInfoHash == null || DirectDebridPlaybackResolver.shouldResolveToPlayableStream(stream))
                        putNullable("infoHash", stream.p2pInfoHash); putNullable("fileIndex", stream.p2pFileIdx)
                        put("presentation", StreamSelectionBridge.present(streamId, stream))
                    }
                }))
            } }))
        }
    }

    private fun streamSelectionJson(): JsonObject {
        val candidate = StreamsRepository.uiState.value.autoPlayStream
        val id = synchronized(streamRegistry) { streamRegistry.entries.firstOrNull { it.value.stream == candidate }?.key }
        return JsonObject(StreamSelectionBridge.snapshot() + ("autoPlayStreamId" to (id?.let(::JsonPrimitive) ?: JsonNull)))
    }

    private fun resolveStream(id: String): JsonObject = synchronized(streamRegistry) {
        val original = streamRegistry[id]?.stream ?: error("Stream is no longer available")
        buildJsonObject {
            put("streamId", id); put("source", original.addonName); putNullable("url", original.playableDirectUrl)
            putNullable("infoHash", original.p2pInfoHash); putNullable("fileIndex", original.p2pFileIdx)
            putNullable("externalUrl", original.externalOpenUrl)
            put("headers", JsonObject(emptyMap()))
        }
    }

    private fun versionName(): String = AppVersionPolicy.displayVersionName

    private fun safeMessage(error: Throwable): String = error.message?.take(500)?.ifBlank { null } ?: "Operation failed"
    private fun androidx.compose.ui.graphics.Color.hex(): String = "#%06X".format(toArgb() and 0xFFFFFF)
    private fun requireParam(params: JsonObject, key: String) { require(!params[key].isNullOrBlank()) { "$key is required" } }
    private fun JsonObject.str(key: String): String = this[key]?.jsonPrimitive?.contentOrNull ?: error("$key is required")
    private fun JsonObject.optionalStr(key: String): String? = this[key]?.takeUnless { it == JsonNull }?.jsonPrimitive?.contentOrNull
    private fun JsonObject.int(key: String): Int = this[key]?.jsonPrimitive?.intOrNull ?: error("$key must be an integer")
    private fun JsonObject.optionalInt(key: String): Int? = this[key]?.takeUnless { it == JsonNull }?.jsonPrimitive?.intOrNull
    private fun JsonObject.bool(key: String): Boolean = this[key]?.jsonPrimitive?.booleanOrNull ?: error("$key must be a boolean")
    private fun JsonElement?.isNullOrBlank(): Boolean = this == null || this == JsonNull || (this as? JsonPrimitive)?.contentOrNull.isNullOrBlank()
    private fun JsonObjectBuilder.putNullable(key: String, value: String?) { put(key, value?.let(::JsonPrimitive) ?: JsonNull) }
    private fun JsonObjectBuilder.putNullable(key: String, value: Int?) { put(key, value?.let(::JsonPrimitive) ?: JsonNull) }
    private fun JsonObjectBuilder.putNullable(key: String, value: Double?) { put(key, value?.let(::JsonPrimitive) ?: JsonNull) }

    private fun errorBody(id: String?, epoch: Long, code: String, message: String) = buildJsonObject {
        put("id", id ?: "")
        put("epoch", epoch); put("error", buildJsonObject { put("code", code); put("message", message) })
    }
}

