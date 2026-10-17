package com.nuvio.desktop.bridge

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.awt.ComposeWindow
import androidx.compose.ui.window.WindowState
import com.nuvio.app.core.ui.NuvioTheme
import com.nuvio.app.core.ui.ProvideDesktopWindowInsets
import com.nuvio.app.core.diagnostics.DesktopDiagnostics
import com.nuvio.app.features.debrid.DirectDebridPlaybackResolver
import com.nuvio.app.features.debrid.DirectDebridPlayableResult
import com.nuvio.app.features.details.MetaDetails
import com.nuvio.app.features.player.PlayerScreen
import com.nuvio.app.features.player.desktop.DesktopAppFullscreenController
import com.nuvio.app.features.player.desktop.DesktopHostOs
import com.nuvio.app.features.player.desktop.EmbeddedTauriPlayerHost
import com.nuvio.app.features.player.desktop.DesktopPlayerPictureInPicture
import com.nuvio.app.features.player.desktop.applyNativeDesktopWindowChrome
import com.nuvio.app.features.player.desktop.installDesktopAppFullscreenShortcuts
import com.nuvio.app.features.player.desktop.notifyDesktopWindowGainedFocus
import com.nuvio.app.features.player.desktop.preloadNativePlayerBridgeAsync
import com.nuvio.app.features.player.desktop.registerDesktopAppFullscreenToggle
import com.nuvio.app.features.profiles.ProfileRepository
import com.nuvio.app.features.player.PlayerSettingsRepository
import com.nuvio.app.features.settings.ThemeSettingsRepository
import com.nuvio.app.features.streams.StreamItem
import com.nuvio.app.features.streams.StreamLinkCacheRepository
import com.nuvio.app.features.player.sanitizePlaybackHeaders
import com.nuvio.app.features.player.sanitizePlaybackResponseHeaders
import com.nuvio.app.features.watchprogress.WatchProgressRepository
import com.nuvio.app.features.p2p.P2pSettingsRepository
import com.nuvio.desktop.bridge.features.BridgeFeatureException
import java.awt.Dimension
import java.awt.event.WindowAdapter
import java.awt.event.WindowEvent
import javax.swing.SwingUtilities
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Job
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.job
import kotlinx.coroutines.swing.Swing
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * Transitional player host: reuse the upstream PlayerScreen runtime and JNI host.
 * Browsing is React; video remains native mpv, never HTML <video>. A Tauri-owned
 * cross-platform surface is a separate migration milestone, not assumed JNI interoperability.
 */
class NativePlayback(
    private val onPlaybackStateChanged: (JsonObject) -> Unit = {},
) : BridgePlaybackAdapter {
    init {
        // The upstream Compose launcher warms WebView2 and extracts player assets
        // during startup. The Tauri bridge has its own entry point, so mirror that
        // initialization before a player window needs the native controls surface.
        preloadNativePlayerBridgeAsync()
    }

    private class Session(val window: ComposeWindow) {
        val resumePrompt = PlaybackResumePrompt()
        val closed = CompletableDeferred<Unit>()
        var requestBack: (() -> Unit)? = null
    }
    private val mutex = Mutex()
    @Volatile private var startingJob: Job? = null
    @Volatile private var session: Session? = null
    @Volatile private var playbackState: String = "idle"
    @Volatile private var playbackPhase: String = "idle"
    @Volatile private var playbackError: String? = null

    fun snapshot(): JsonObject = buildJsonObject {
        put("state", playbackState)
        put("phase", playbackPhase)
        put("active", session != null)
        put("isInPip", session != null && DesktopPlayerPictureInPicture.isEnabled)
        put("error", playbackError?.let({ kotlinx.serialization.json.JsonPrimitive(it) }) ?: kotlinx.serialization.json.JsonNull)
    }

    private fun publishState() = onPlaybackStateChanged(snapshot())

    override suspend fun start(
        stream: StreamItem,
        meta: MetaDetails?,
        videoId: String?,
        startFromBeginning: Boolean,
        nativeHostWindow: Long?,
        nativeHostFullscreen: Boolean,
    ): JsonObject = mutex.withLock {
        val startJob = currentCoroutineContext().job
        startingJob = startJob
        playbackState = "starting"
        playbackPhase = if (DirectDebridPlaybackResolver.shouldResolveToPlayableStream(stream)) "resolving" else "preparing"
        playbackError = null
        publishState()
        try {
        requireNotNull(meta) { "Load matching title details before starting playback." }
        if (stream.shouldOpenExternally) {
            val uri = java.net.URI(requireNotNull(stream.externalOpenUrl))
            require(uri.scheme?.lowercase() in setOf("http", "https") && !uri.host.isNullOrBlank() && uri.userInfo == null) { "Unsupported external stream URL" }
            withContext(Dispatchers.IO) { java.awt.Desktop.getDesktop().browse(uri) }
            playbackState = "external"
            publishState()
            return@withLock buildJsonObject { put("started", true); put("host", "external") }
        }
        val episode = videoId?.let { id -> meta.videos.firstOrNull { it.id == id } }
        val embeddedInTauri = DesktopHostOs.current == DesktopHostOs.WINDOWS && nativeHostWindow != null
        DesktopDiagnostics.record("bridge_playback_start", "embedded=$embeddedInTauri")
        withPreparedPlaybackHost(
            dispatcher = Dispatchers.Swing,
            prepare = { prepareWindow(meta.name, embeddedInTauri) },
            resolve = {
                val playable = if (!DirectDebridPlaybackResolver.shouldResolveToPlayableStream(stream)) stream else when (val resolved = DirectDebridPlaybackResolver.resolveToPlayableStream(stream, episode?.season, episode?.episode)) {
                    is DirectDebridPlayableResult.Success -> resolved.stream
                    DirectDebridPlayableResult.MissingApiKey -> error("Connect the required debrid service before playback.")
                    DirectDebridPlayableResult.NotCached -> error("This stream is not cached by your debrid service.")
                    DirectDebridPlayableResult.Stale -> error("The selected stream expired. Refresh the stream list.")
                    else -> error("The selected stream could not be resolved.")
                }
                if (playbackPhase == "resolving") {
                    playbackPhase = "preparing"
                    publishState()
                }
                playable
            },
            attach = { window, playable ->
                val torrentHash = playable.p2pInfoHash.takeIf { playable.playableDirectUrl == null }
                if (torrentHash != null) {
                    P2pSettingsRepository.ensureLoaded()
                    if (!P2pSettingsRepository.isVisible) throw BridgeFeatureException("CAPABILITY_UNAVAILABLE", "Torrent playback is unavailable in this build.")
                    if (!P2pSettingsRepository.uiState.value.p2pEnabled) throw BridgeFeatureException("P2P_CONSENT_REQUIRED", "Enable peer-to-peer playback before opening this torrent.")
                }
                val url = playable.playableDirectUrl ?: torrentHash?.let { "torrent://$it${playable.p2pFileIdx?.let { index -> "?index=$index" }.orEmpty()}" }
                    ?: throw BridgeFeatureException("UNAVAILABLE", "The selected stream has no playable source.")
                stopLocked()
                val playbackVideoId = videoId ?: meta.defaultVideoId ?: meta.id
                val progress = WatchProgressRepository.progressForVideo(playbackVideoId, meta.id, episode?.season, episode?.episode)
                cacheForReuseIfEnabled(playable, meta, playbackVideoId, episode?.season, episode?.episode)
                val presented = CompletableDeferred<Unit>()
                withContext(Dispatchers.Swing) {
                    val current = Session(window)
                    session = current
                    current.resumePrompt.enter(playbackVideoId)
                    window.title = meta.name
                    if (embeddedInTauri) {
                        // The Compose window keeps the upstream player controller alive offscreen. The
                        // actual mpv + controls HWNDs are created directly under Tauri's HWND; keeping
                        // this transparent host visible to AWT preserves the Canvas peer and player
                        // lifecycle while video is shown in the Tauri window.
                        // Keep this offscreen transparent host visible to AWT so its
                        // Canvas peer and PlayerScreen lifetime survive playback start.
                        // Hiding it after attach triggers removeNotify(), which disposes
                        // the native player hosted in the separate Tauri HWND.
                        EmbeddedTauriPlayerHost.begin(
                            nativeHostWindow,
                            initialFullscreen = nativeHostFullscreen,
                            presented = {
                                DesktopDiagnostics.record("bridge_playback_presented")
                                presented.complete(Unit)
                            },
                            presentationFailed = {
                                presented.completeExceptionally(IllegalStateException("The native player controls could not be initialized. Please restart Nuvio and try again."))
                            },
                            toggleFullscreen = {
                                onPlaybackStateChanged(buildJsonObject {
                                    snapshot().forEach { (key, value) -> put(key, value) }
                                    put("toggleHostFullscreen", true)
                                })
                            },
                        )
                    } else {
                        window.setLocationRelativeTo(null)
                        EmbeddedTauriPlayerHost.begin(null)
                    }
                    window.minimumSize = Dimension(640, 360)
                    window.setSize(1280, 720)
                    window.defaultCloseOperation = javax.swing.WindowConstants.DO_NOTHING_ON_CLOSE
                    window.addWindowListener(object : WindowAdapter() {
                        override fun windowClosing(event: WindowEvent) {
                            // Upstream handles progress persistence and native release before navigation.
                            current.requestBack?.invoke()
                        }
                    })
                    window.addWindowFocusListener(object : WindowAdapter() {
                        override fun windowGainedFocus(event: WindowEvent) = notifyDesktopWindowGainedFocus()
                    })
                    window.setContent {
                        LaunchedEffect(current) {
                            DesktopPlayerPictureInPicture.changes.collect { publishState() }
                        }
                        val theme by ThemeSettingsRepository.selectedTheme.collectAsState()
                        val custom by ThemeSettingsRepository.customThemeColors.collectAsState()
                        val amoled by ThemeSettingsRepository.amoledEnabled.collectAsState()
                        val state = androidx.compose.runtime.remember { WindowState() }
                        val fullscreen = androidx.compose.runtime.remember { DesktopAppFullscreenController() }
                        LaunchedEffect(state.placement) { window.placement = state.placement }
                        DisposableEffect(window) {
                            val unregister = registerDesktopAppFullscreenToggle(
                                handler = { target ->
                                    if (target == null || target === window) {
                                        if (embeddedInTauri) EmbeddedTauriPlayerHost.toggleFullscreen()
                                        else fullscreen.toggle(window, state)
                                    }
                                },
                                isFullscreen = { target ->
                                    (target == null || target === window) &&
                                        if (embeddedInTauri) EmbeddedTauriPlayerHost.isFullscreen()
                                        else fullscreen.isFullscreen(window, state)
                                },
                            )
                            val uninstall = installDesktopAppFullscreenShortcuts(window)
                            onDispose {
                                fullscreen.dispose(window)
                                if (embeddedInTauri) EmbeddedTauriPlayerHost.clear()
                                uninstall()
                                unregister()
                            }
                        }
                        NuvioTheme(appTheme = theme, customThemeColors = custom, amoled = amoled) {
                            ProvideDesktopWindowInsets(isFullscreen = fullscreen.isFullscreen(window, state)) {
                                PlayerScreen(
                                    profileId = ProfileRepository.activeProfileId,
                                    title = meta.name,
                                    sourceUrl = url,
                                    torrentInfoHash = torrentHash,
                                    torrentFileIdx = playable.p2pFileIdx.takeIf { torrentHash != null },
                                    torrentFilename = playable.behaviorHints.filename.takeIf { torrentHash != null },
                                    torrentTrackers = if (torrentHash != null) playable.p2pTrackers else emptyList(),
                                    sourceHeaders = sanitizePlaybackHeaders(playable.behaviorHints.proxyHeaders?.request),
                                    sourceResponseHeaders = sanitizePlaybackResponseHeaders(playable.behaviorHints.proxyHeaders?.response),
                                    externalSubtitles = playable.externalSubtitles,
                                    streamType = playable.streamType,
                                    providerName = playable.addonName,
                                    providerAddonId = playable.addonId,
                                    streamTitle = playable.streamLabel,
                                    streamSubtitle = playable.streamSubtitle,
                                    initialBingeGroup = playable.behaviorHints.bingeGroup,
                                    parentMetaId = meta.id,
                                    parentMetaType = meta.type,
                                    contentType = meta.type,
                                    videoId = playbackVideoId,
                                    logo = meta.logo,
                                    poster = meta.poster,
                                    background = meta.background,
                                    seasonNumber = episode?.season,
                                    episodeNumber = episode?.episode,
                                    episodeTitle = episode?.title,
                                    episodeThumbnail = episode?.thumbnail,
                                    initialPositionMs = if (startFromBeginning) 0L else progress?.takeIf { it.isResumable }?.lastPositionMs ?: 0L,
                                    initialProgressFraction = if (startFromBeginning) null else progress?.takeIf { it.isResumable }?.progressFraction,
                                    contentLanguage = meta.language,
                                    onSystemBackHandlerChanged = { current.requestBack = it },
                                    onOpenExternalUrl = ::openExternalUrl,
                                    onBack = { release ->
                                        current.resumePrompt.exit()
                                        release(
                                            { SwingUtilities.invokeLater {
                                                window.dispose()
                                                if (session === current) {
                                                    session = null
                                                    playbackState = "stopped"
                                                    playbackPhase = "idle"
                                                    publishState()
                                                }
                                                current.closed.complete(Unit)
                                            } },
                                            { message -> current.closed.completeExceptionally(IllegalStateException(message)) },
                                        )
                                    },
                                    modifier = Modifier.fillMaxSize(),
                                )
                            }
                        }
                    }
                    applyNativeDesktopWindowChrome(window)
                    window.isVisible = true
                }
                // Preserve React's artwork until the native loading UI replaces it.
                // Cancellation/failure leaves ownership with withPreparedPlaybackHost,
                // which tears down the partially attached session.
                // A presentation timeout must surface as a regular failure: letting
                // the TimeoutCancellationException escape would cancel the bridge
                // request handler, which answers the RPC with no response at all and
                // leaves the UI stuck on "Building player..." while audio plays.
                try {
                    DesktopDiagnostics.record("bridge_playback_await_presentation", "embedded=$embeddedInTauri")
                    if (embeddedInTauri) withTimeout(20_000) { presented.await() }
                } catch (timeout: TimeoutCancellationException) {
                    DesktopDiagnostics.recordFailure("player_present_timeout", timeout)
                    throw IllegalStateException("The player did not finish loading in time. Please try again.", timeout)
                }
                playbackState = "playing"
                DesktopDiagnostics.record("bridge_playback_handoff_ready")
                playbackPhase = "buffering"
                publishState()
                buildJsonObject { put("started", true); put("host", if (embeddedInTauri) "tauri-window" else "native-window") }
            },
            discard = { window ->
                if (session?.window === window) stopLocked()
                else withContext(Dispatchers.Swing) { window.dispose() }
            },
        )
        } catch (error: Throwable) {
            playbackState = if (error is kotlinx.coroutines.CancellationException) "cancelled" else "failed"
            playbackPhase = "failed"
            playbackError = when (error) {
                is BridgeFeatureException -> error.code
                is kotlinx.coroutines.CancellationException -> "CANCELLED"
                else -> "PLAYBACK_FAILED"
            }
            publishState()
            throw error
        } finally {
            if (startingJob === startJob) startingJob = null
        }
    }

    private fun prepareWindow(title: String, embedded: Boolean): ComposeWindow {
        val window = ComposeWindow()
        try {
            window.title = title
            window.minimumSize = Dimension(640, 360)
            window.setSize(1280, 720)
            if (embedded) {
                window.type = java.awt.Window.Type.UTILITY
                window.focusableWindowState = false
                // If transparency is unavailable, keep the host invisible until handoff.
                val transparent = runCatching { window.opacity = 0f }.isSuccess
                window.setLocation(-32_000, -32_000)
                window.setContent {
                    val theme by ThemeSettingsRepository.selectedTheme.collectAsState()
                    val custom by ThemeSettingsRepository.customThemeColors.collectAsState()
                    val amoled by ThemeSettingsRepository.amoledEnabled.collectAsState()
                    NuvioTheme(appTheme = theme, customThemeColors = custom, amoled = amoled) {
                        Box(Modifier.fillMaxSize())
                    }
                }
                // Start Compose/Skia without creating mpv, loading media or attaching
                // native children to Tauri before stream resolution has succeeded.
                if (transparent) window.isVisible = true
            }
            return window
        } catch (error: Throwable) {
            window.dispose()
            throw error
        }
    }

    override suspend fun stop() {
        startingJob?.cancel()
        mutex.withLock { stopLocked() }
    }

    override suspend fun shutdown() {
        startingJob?.cancel()
        mutex.withLock {
            session?.resumePrompt?.preserveForShutdown()
            stopLocked()
        }
    }

    private suspend fun stopLocked() {
        val current = session ?: return
        playbackState = "stopping"
        playbackPhase = "stopping"
        withContext(Dispatchers.Swing) {
            val back = current.requestBack
            if (back != null) back() else {
                current.resumePrompt.exit()
                current.window.dispose()
                current.closed.complete(Unit)
            }
        }
        withTimeout(15_000) { current.closed.await() }
        if (session === current) session = null
        playbackState = "stopped"
        playbackPhase = "idle"
        publishState()
    }

    private fun cacheForReuseIfEnabled(
        stream: StreamItem,
        meta: MetaDetails,
        videoId: String,
        season: Int?,
        episode: Int?,
    ) {
        PlayerSettingsRepository.ensureLoaded()
        if (!PlayerSettingsRepository.uiState.value.streamReuseLastLinkEnabled) return
        val directUrl = stream.playableDirectUrl
        val infoHash = stream.p2pInfoHash
        if (directUrl == null && infoHash == null) return
        val key = StreamLinkCacheRepository.contentKey(
            type = meta.type,
            videoId = videoId,
            parentMetaId = meta.id,
            season = season,
            episode = episode,
        )
        StreamLinkCacheRepository.save(
            contentKey = key,
            url = directUrl.orEmpty(),
            streamName = stream.streamLabel,
            addonName = stream.addonName,
            addonId = stream.addonId,
            requestHeaders = sanitizePlaybackHeaders(stream.behaviorHints.proxyHeaders?.request),
            responseHeaders = sanitizePlaybackResponseHeaders(stream.behaviorHints.proxyHeaders?.response),
            filename = stream.behaviorHints.filename,
            videoSize = stream.behaviorHints.videoSize,
            infoHash = infoHash,
            fileIdx = stream.p2pFileIdx,
            sources = stream.p2pTrackers,
            bingeGroup = stream.behaviorHints.bingeGroup,
            streamType = stream.streamType,
            contentLanguage = meta.language,
        )
    }

    private fun openExternalUrl(rawUrl: String) {
        val uri = runCatching { java.net.URI(rawUrl) }.getOrNull() ?: return
        if (uri.scheme?.lowercase() !in setOf("http", "https") || uri.host.isNullOrBlank() || uri.userInfo != null) return
        if (java.awt.Desktop.isDesktopSupported()) runCatching { java.awt.Desktop.getDesktop().browse(uri) }
    }
}
