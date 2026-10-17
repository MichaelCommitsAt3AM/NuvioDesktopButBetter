package com.nuvio.app.features.player.desktop

import androidx.compose.ui.unit.IntSize
import co.touchlab.kermit.Logger
import com.nuvio.app.core.diagnostics.DesktopDiagnostics
import com.nuvio.app.features.settings.AppIconRepository
import java.awt.GraphicsEnvironment
import java.awt.KeyboardFocusManager
import java.awt.Rectangle
import java.awt.Window
import javax.imageio.ImageIO
import javax.swing.SwingUtilities
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** Coordinates the independent PiP window without moving the Compose/AWT Canvas. */
internal object DesktopPlayerPictureInPicture {
    private val log = Logger.withTag("DesktopPlayerPiP")
    private val _changes = MutableStateFlow(0)
    val changes: StateFlow<Int> = _changes.asStateFlow()

    @Volatile
    var isEnabled: Boolean = false
        private set

    private var host: NativePlayerHost? = null
    private var controller: NativePlayerController? = null
    internal var pipWindow: DesktopPlayerPipWindow? = null
    private var windowTitle = ""
    private var lastVideoSize = IntSize.Zero
    private var transition = false
    private var nativePipEnabled = false
    private var lastToggleAtMs = 0L

    fun setHost(value: NativePlayerHost) = onEdt {
        host = value
    }

    fun setController(value: NativePlayerController) = onEdt {
        controller = value
    }

    fun setWindowTitle(title: String) = onEdt {
        windowTitle = title
        pipWindow?.updateWindowTitle(title)
        if (nativePipEnabled) controller?.updateNativePictureInPicture(title, videoAspectRatio())
    }

    fun update(isPlaying: Boolean, videoSize: IntSize) = onEdt {
        lastVideoSize = videoSize
        if (nativePipEnabled) controller?.updateNativePictureInPicture(windowTitle, videoAspectRatio())
        pipWindow?.let { window ->
            if (videoSize.width > 0 && videoSize.height > 0) {
                val ratio = videoSize.width.toFloat() / videoSize.height.toFloat()
                window.aspectRatio = ratio
                runCatching {
                    val windowPointer = AwtNativeViewResolver.resolveNativeViewPointer(window)
                    NativePlayerBridge.setWindowAspectRatio(windowPointer, ratio)
                }
                window.revalidate()
            }
        }
    }

    fun toggle() = onEdt {
        if (!isSupportedHost()) return@onEdt
        if (transition) return@onEdt
        val now = System.currentTimeMillis()
        if (now - lastToggleAtMs < 300L) return@onEdt
        lastToggleAtMs = now
        log.d { "toggle enabled=$isEnabled host=${host != null} controller=${controller != null}" }
        if (isEnabled) restoreOnEdt() else enterOnEdt()
    }

    fun clear() = onEdt {
        if (transition || !isEnabled) return@onEdt
        restoreOnEdt()
    }

    fun release() = onEdt {
        transition = true
        val window = pipWindow
        pipWindow = null
        isEnabled = false
        // Native player shutdown owns disposal of its PiP HWND and video child.
        nativePipEnabled = false
        window?.dispose()
        host = null
        controller = null
        transition = false
        notifyChanged()
    }

    private fun enterOnEdt() {
        val mainHost = host ?: return
        val player = controller ?: return
        if (!mainHost.isDisplayable) return

        transition = true
        if (DesktopHostOs.current == DesktopHostOs.WINDOWS) {
            nativePipEnabled = player.enterNativePictureInPicture(windowTitle, videoAspectRatio())
            isEnabled = nativePipEnabled
            DesktopDiagnostics.record("pip_native_enter", "ok=$nativePipEnabled")
            transition = false
            if (isEnabled) notifyChanged()
            return
        }
        val owner = currentWindow() ?: SwingUtilities.getWindowAncestor(mainHost)
        val window = DesktopPlayerPipWindow(
            ownerWindow = null,
            onCloseRequested = ::clear,
            onResized = { controller?.layoutNativeSubviews() },
            onFocusGained = { controller?.requestKeyboardFocus() },
        ).apply {
            aspectRatio = videoAspectRatio()
            updateWindowTitle(windowTitle)
            bounds = computeDefaultBounds(owner, aspectRatio)
            isAlwaysOnTop = true
            isVisible = true
            AppIconRepository.ensureLoaded()
            val iconKey = AppIconRepository.state.value.selected.key
            runCatching {
                val iconPath = "icons/app-icon-${iconKey}-transparent.png"
                val stream = Thread.currentThread().contextClassLoader.getResourceAsStream(iconPath)
                stream?.use { ImageIO.read(it) }?.let { image -> iconImages = listOf(image) }
            }.onFailure { error -> log.w(error) { "failed to set PiP window icon key=$iconKey" } }
        }
        pipWindow = window

        runCatching {
            val windowPointer = AwtNativeViewResolver.resolveNativeViewPointer(window)
            NativePlayerBridge.setWindowAspectRatio(windowPointer, window.aspectRatio)
            NativePlayerBridge.setWindowResizable(windowPointer, true)
            window.validate()
        }.onFailure { error -> log.w(error) { "failed to enable PiP native resize" } }

        val pipHost = window.videoHolderPanel
        log.d { "created window displayable=${window.isDisplayable} visible=${window.isVisible} pipHostDisplayable=${pipHost.isDisplayable}" }
        if (!pipHost.isDisplayable) {
            window.dispose()
            pipWindow = null
            transition = false
            return
        }
        if (!player.reparentSurface(pipHost)) {
            log.w { "native surface reparent failed; closing PiP window" }
            DesktopDiagnostics.record("pip_native_reparent", "ok=false stage=enter")
            window.dispose()
            pipWindow = null
            transition = false
            return
        }
        DesktopDiagnostics.record("pip_native_reparent", "ok=true stage=enter")
        // The surface changed homes; force-apply the PiP size instead of
        // trusting whatever the layout cache holds from the main window.
        player.layoutNativeSubviews()
        isEnabled = true
        log.d { "PiP entered" }
        transition = false
        notifyChanged()
        window.toFront()
        window.requestFocus()
    }

    private fun restoreOnEdt() {
        if (nativePipEnabled) {
            val player = controller ?: return
            transition = true
            val restored = player.restoreSurface()
            DesktopDiagnostics.record("pip_native_reparent", "ok=$restored stage=restore")
            if (restored) {
                player.closeNativePictureInPicture()
                nativePipEnabled = false
                isEnabled = false
                player.requestKeyboardFocus()
                notifyChanged()
            }
            transition = false
            return
        }
        val window = pipWindow ?: return
        val mainHost = host
        val player = controller

        transition = true
        if (mainHost != null && mainHost.isDisplayable && player != null) {
            val restored = player.restoreSurface()
            log.d { "restoring PiP native surface success=$restored" }
            DesktopDiagnostics.record("pip_native_reparent", "ok=$restored stage=restore")
            if (!restored) {
                transition = false
                return
            }
            player.layoutNativeSubviews()
            player.requestKeyboardFocus()
        }
        runCatching {
            val windowPointer = AwtNativeViewResolver.resolveNativeViewPointer(window)
            NativePlayerBridge.setWindowResizable(windowPointer, false)
        }
        window.isVisible = false
        window.dispose()
        pipWindow = null
        isEnabled = false
        transition = false
        notifyChanged()
    }

    private fun isSupportedHost(): Boolean =
        DesktopHostOs.current == DesktopHostOs.WINDOWS ||
            DesktopHostOs.current == DesktopHostOs.MACOS

    private fun videoAspectRatio(): Float =
        if (lastVideoSize.width > 0 && lastVideoSize.height > 0) {
            lastVideoSize.width.toFloat() / lastVideoSize.height.toFloat()
        } else {
            16f / 9f
        }

    private fun computeDefaultBounds(window: Window?, aspectRatio: Float): Rectangle {
        val configuration = window?.graphicsConfiguration
            ?: GraphicsEnvironment.getLocalGraphicsEnvironment().defaultScreenDevice.defaultConfiguration
        val screen = configuration.bounds
        val insets = ToolkitInsets.get(configuration)
        val width = 480
        val height = (width / aspectRatio).toInt()
        return Rectangle(
            screen.x + screen.width - insets.right - width - 24,
            screen.y + screen.height - insets.bottom - height - 24,
            width,
            height,
        )
    }

    private fun currentWindow(): Window? =
        KeyboardFocusManager.getCurrentKeyboardFocusManager().activeWindow
            ?: Window.getWindows().firstOrNull { it.isDisplayable && it.isVisible }

    private fun onEdt(action: () -> Unit) {
        if (SwingUtilities.isEventDispatchThread()) action() else SwingUtilities.invokeLater(action)
    }

    private fun notifyChanged() {
        _changes.value += 1
    }
}

private object ToolkitInsets {
    fun get(configuration: java.awt.GraphicsConfiguration): java.awt.Insets =
        runCatching { java.awt.Toolkit.getDefaultToolkit().getScreenInsets(configuration) }
            .getOrElse { java.awt.Insets(0, 0, 0, 0) }
}
