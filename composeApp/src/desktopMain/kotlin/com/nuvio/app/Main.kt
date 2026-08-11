package com.nuvio.app

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.window.Window
import androidx.compose.ui.window.WindowPlacement
import androidx.compose.ui.window.WindowPosition
import androidx.compose.ui.window.application
import androidx.compose.ui.window.rememberWindowState
import androidx.compose.ui.unit.dp
import co.touchlab.kermit.Logger
import com.nuvio.app.core.diagnostics.DesktopDiagnostics
import com.nuvio.app.core.diagnostics.KermitFileLogWriter
import com.nuvio.app.core.deeplink.handleAppUrl
import com.nuvio.app.core.diagnostics.SentryInitializer
import com.nuvio.app.core.ui.NuvioFrameTimeProbe
import com.nuvio.app.features.p2p.P2pStreamingEngine
import com.nuvio.app.features.plugins.configureDesktopQuickJsLibrary
import com.nuvio.app.features.player.PlatformPlayerSurface
import com.nuvio.app.features.player.desktop.DesktopAppFullscreenController
import com.nuvio.app.features.player.desktop.DesktopHostOs
import com.nuvio.app.features.player.desktop.DesktopWindowGeometry
import com.nuvio.app.features.player.desktop.DesktopWindowModeStorage
import com.nuvio.app.features.player.desktop.applyNativeDesktopWindowChrome
import com.nuvio.app.features.player.desktop.installDesktopAppFullscreenShortcuts
import com.nuvio.app.features.player.desktop.notifyDesktopWindowGainedFocus
import com.nuvio.app.features.player.desktop.preloadNativePlayerBridgeAsync
import com.nuvio.app.features.player.desktop.registerDesktopAppFullscreenToggle
import com.nuvio.app.features.settings.applyDesktopRendererPreference
import java.awt.Component
import java.awt.Container
import java.awt.Desktop
import java.awt.Window as AwtWindow
import java.awt.Color as AwtColor
import java.awt.event.WindowAdapter
import java.awt.event.WindowEvent
import javax.swing.JComponent

private val NuvioDesktopNativeBackground = AwtColor(0x0D, 0x0D, 0x0D)
private const val NuvioDesktopIconPath = "icons/nuvio-app-icon.png"
private const val MacosDarkAquaAppearance = "NSAppearanceNameDarkAqua"

fun main(args: Array<String>) {
    applyDesktopRendererPreference()
    SentryInitializer.start()

    val startupStartNanos = System.nanoTime()
    val jvmStartupMs = System.currentTimeMillis() -
        java.lang.management.ManagementFactory.getRuntimeMXBean().startTime
    fun markStartup(phase: String) {
        val elapsedMs = (System.nanoTime() - startupStartNanos) / 1_000_000
        DesktopDiagnostics.record("startup_timing", "phase=$phase elapsedMs=$elapsedMs jvmStartupMs=$jvmStartupMs")
    }

    DesktopDiagnostics.initialize()
    Logger.addLogWriter(KermitFileLogWriter())
    markStartup("diagnostics_initialized")
    configureDesktopQuickJsLibrary()
    markStartup("quickjs_library_configured")
    configureDesktopChrome()
    markStartup("chrome_configured")
    // Desktop.getDesktop() triggers native Shell/COM initialization on first touch
    // (multiple seconds observed on Windows) — it must not block the window from
    // appearing, so it's dispatched off the main thread like the native player preload.
    Thread {
        runCatching { installDesktopOpenUriHandler() }
    }.apply {
        name = "nuvio-desktop-uri-handler-install"
        isDaemon = true
        start()
    }
    markStartup("uri_handler_install_dispatched")
    handleDesktopLaunchArgs(args)
    markStartup("launch_args_handled")
    preloadNativePlayerBridgeAsync()
    markStartup("native_preload_dispatched")

    application {
        markStartup("application_lambda_entered")
        val smokePlayerUrl = (
            System.getProperty("nuvio.desktop.smokePlayerUrl")
                ?: System.getenv("NUVIO_DESKTOP_SMOKE_PLAYER_URL")
            )
            ?.takeIf { it.isNotBlank() }
        val wasFullscreenOnLastExit = remember { DesktopWindowModeStorage.loadWasFullscreen() }
        val wasMaximizedOnLastExit = remember { DesktopWindowModeStorage.loadWasMaximized() }
        val savedGeometry = remember { DesktopWindowModeStorage.loadWindowedGeometry() }
        val restoresMaximizedWindowPlacement = DesktopHostOs.current != DesktopHostOs.MACOS
        val windowState = rememberWindowState(
            width = savedGeometry?.width?.dp ?: 1280.dp,
            height = savedGeometry?.height?.dp ?: 820.dp,
            position = savedGeometry?.let { WindowPosition.Absolute(x = it.x.dp, y = it.y.dp) }
                ?: WindowPosition.PlatformDefault,
            // Windows fullscreen is emulated natively (see DesktopAppFullscreenController)
            // rather than driven by WindowPlacement, so it's restored separately below.
            placement = when {
                wasFullscreenOnLastExit && DesktopHostOs.current != DesktopHostOs.WINDOWS -> {
                    WindowPlacement.Fullscreen
                }
                wasMaximizedOnLastExit == false && savedGeometry != null -> {
                    WindowPlacement.Floating
                }
                restoresMaximizedWindowPlacement -> {
                    WindowPlacement.Maximized
                }
                else -> WindowPlacement.Floating
            },
        )
        val fullscreenController = remember { DesktopAppFullscreenController() }
        markStartup("before_window_call")

        Window(
            onCloseRequest = {
                DesktopDiagnostics.record("app_window_close_requested")
                P2pStreamingEngine.shutdown()
                SentryInitializer.close()
                DesktopWindowModeStorage.flushPendingWrites()
                DesktopDiagnostics.record("app_window_close_ready")
                exitApplication()
            },
            title = if (smokePlayerUrl == null) "Nuvio" else "Nuvio Player Smoke",
            state = windowState,
            icon = painterResource(NuvioDesktopIconPath),
        ) {
            LaunchedEffect(Unit) {
                markStartup("window_content_first_composition")
            }
            SideEffect {
                window.background = NuvioDesktopNativeBackground
                window.rootPane.background = NuvioDesktopNativeBackground
                window.contentPane.background = NuvioDesktopNativeBackground
                (window.contentPane as? JComponent)?.isOpaque = true
            }
            LaunchedEffect(window) {
                applyNativeDesktopWindowChrome(window)
                // Windows fullscreen is emulated natively and isn't reflected by
                // WindowPlacement, so it must be re-applied once the window peer exists.
                fullscreenController.applyRestoredFullscreenState(window, windowState, wasFullscreenOnLastExit)
            }
            LaunchedEffect(windowState) {
                // Covers OS-driven placement changes too (e.g. the native macOS
                // green-button fullscreen toggle), not just our own shortcuts.
                if (DesktopHostOs.current != DesktopHostOs.WINDOWS) {
                    snapshotFlow { windowState.placement }
                        .collect { placement ->
                            DesktopWindowModeStorage.saveWasFullscreen(placement == WindowPlacement.Fullscreen)
                        }
                }
            }
            LaunchedEffect(windowState) {
                // Only persist geometry while windowed: fullscreen/native-Windows-fullscreen
                // coordinates aren't a meaningful "windowed position" to restore later.
                snapshotFlow { Triple(windowState.placement, windowState.position, windowState.size) }
                    .collect { (placement, position, size) ->
                        val isFullscreen = fullscreenController.isFullscreen(window, windowState)
                        if (!isFullscreen && restoresMaximizedWindowPlacement) {
                            DesktopWindowModeStorage.saveWasMaximized(placement == WindowPlacement.Maximized)
                        }
                        val isWindowed = placement == WindowPlacement.Floating && !isFullscreen
                        if (isWindowed && position.isSpecified) {
                            DesktopWindowModeStorage.saveWindowedGeometry(
                                DesktopWindowGeometry(
                                    x = position.x.value,
                                    y = position.y.value,
                                    width = size.width.value,
                                    height = size.height.value,
                                ),
                            )
                        }
                    }
            }
            DisposableEffect(window) {
                // Alt-tabbing back to the app (and some OS-driven re-activations) can
                // leave AWT keyboard focus on the frame instead of the Compose surface,
                // so key presses are ignored until the user clicks. Re-focusing the
                // Compose content whenever the window regains focus restores keyboard
                // interaction without needing a mouse click.
                val focusListener = object : WindowAdapter() {
                    override fun windowGainedFocus(event: WindowEvent?) {
                        requestComposeKeyboardFocus(window)
                        // The native player (mpv + embedded webview controls) lives
                        // outside the AWT focus chain the above call restores, so it
                        // needs its own nudge or keyboard shortcuts stay dead until
                        // the user clicks inside the player.
                        notifyDesktopWindowGainedFocus()
                    }
                }
                window.addWindowFocusListener(focusListener)
                onDispose { window.removeWindowFocusListener(focusListener) }
            }
            DisposableEffect(window, windowState) {
                val unregisterFullscreenToggle = registerDesktopAppFullscreenToggle(
                    handler = { targetWindow ->
                        if (targetWindow == null || targetWindow === window) {
                            fullscreenController.toggle(window, windowState)
                            DesktopWindowModeStorage.saveWasFullscreen(
                                fullscreenController.isFullscreen(window, windowState),
                            )
                        }
                    },
                    isFullscreen = { targetWindow ->
                        (targetWindow == null || targetWindow === window) &&
                            fullscreenController.isFullscreen(window, windowState)
                    },
                )
                val uninstallFullscreenShortcuts = installDesktopAppFullscreenShortcuts(window)
                onDispose {
                    fullscreenController.dispose(window)
                    uninstallFullscreenShortcuts()
                    unregisterFullscreenToggle()
                }
            }

            if (smokePlayerUrl == null) {
                NuvioFrameTimeProbe()
                App()
            } else {
                PlatformPlayerSurface(
                    sourceUrl = smokePlayerUrl,
                    modifier = Modifier.fillMaxSize(),
                    onControllerReady = {},
                    onSnapshot = {},
                    onError = {},
                )
            }
        }
    }
}

private fun configureDesktopChrome() {
    if (System.getProperty("os.name").contains("mac", ignoreCase = true)) {
        System.setProperty("apple.awt.application.appearance", MacosDarkAquaAppearance)
    }
}

private fun installDesktopOpenUriHandler() {
    if (!Desktop.isDesktopSupported()) return
    val desktop = runCatching { Desktop.getDesktop() }.getOrNull() ?: return
    if (!desktop.isSupported(Desktop.Action.APP_OPEN_URI)) return

    runCatching {
        desktop.setOpenURIHandler { event ->
            event.uri
                ?.toString()
                ?.trim()
                ?.takeIf(::isDesktopAppUrl)
                ?.let(::handleAppUrl)
        }
    }
}

private fun handleDesktopLaunchArgs(args: Array<String>) {
    args.asSequence()
        .map(String::trim)
        .filter(::isDesktopAppUrl)
        .forEach(::handleAppUrl)
}

private fun isDesktopAppUrl(value: String): Boolean =
    value.startsWith("nuvio://", ignoreCase = true) ||
        value.startsWith("stremio://", ignoreCase = true)

private fun requestComposeKeyboardFocus(window: AwtWindow) {
    val target = findKeyboardFocusTarget(window) ?: window
    if (!target.requestFocusInWindow()) {
        window.requestFocus()
    }
}

/**
 * Depth-first search for the deepest focusable, showing component — the Compose
 * (Skia) surface that actually receives key events. Mirrors what a mouse click
 * does so keyboard input works immediately after the window regains focus.
 */
private fun findKeyboardFocusTarget(component: Component): Component? {
    if (component is Container) {
        for (child in component.components) {
            findKeyboardFocusTarget(child)?.let { return it }
        }
    }
    return component.takeIf { it.isFocusable && it.isShowing && it.isEnabled }
}
