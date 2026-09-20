package com.nuvio.app.features.player.desktop

import androidx.compose.ui.awt.ComposeWindow
import androidx.compose.ui.window.WindowPlacement
import androidx.compose.ui.window.WindowState
import java.awt.Frame
import java.awt.KeyEventDispatcher
import java.awt.KeyboardFocusManager
import java.awt.Window
import java.awt.event.ComponentAdapter
import java.awt.event.ComponentEvent
import java.awt.event.KeyEvent
import java.awt.event.WindowAdapter
import java.awt.event.WindowEvent
import javax.swing.SwingUtilities
import javax.swing.Timer
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

private object DesktopAppFullscreen {
    private var toggleHandler: ((Window?) -> Unit)? = null
    private var fullscreenStateProvider: ((Window?) -> Boolean)? = null
    private val _changes = MutableStateFlow(0)
    val changes: StateFlow<Int> = _changes.asStateFlow()

    fun setToggleHandler(
        handler: ((Window?) -> Unit)?,
        isFullscreen: (Window?) -> Boolean,
    ): () -> Unit {
        toggleHandler = handler
        fullscreenStateProvider = isFullscreen
        notifyChanged()
        return {
            if (toggleHandler === handler) {
                toggleHandler = null
                fullscreenStateProvider = null
                notifyChanged()
            }
        }
    }

    fun toggle(window: Window? = null) {
        val handler = toggleHandler ?: return
        if (SwingUtilities.isEventDispatchThread()) {
            handler(window)
            notifyChanged()
        } else {
            SwingUtilities.invokeLater {
                handler(window)
                notifyChanged()
            }
        }
    }

    fun isFullscreen(window: Window? = null): Boolean =
        fullscreenStateProvider?.invoke(window) == true

    private fun notifyChanged() {
        _changes.value += 1
    }
}

internal fun registerDesktopAppFullscreenToggle(
    handler: (Window?) -> Unit,
    isFullscreen: (Window?) -> Boolean,
): () -> Unit =
    DesktopAppFullscreen.setToggleHandler(handler, isFullscreen)

internal fun toggleDesktopAppFullscreen(window: Window? = null) {
    DesktopAppFullscreen.toggle(window)
}

internal fun isDesktopAppFullscreen(window: Window? = null): Boolean =
    DesktopAppFullscreen.isFullscreen(window)

internal val desktopFullscreenChanges: StateFlow<Int>
    get() = DesktopAppFullscreen.changes

private const val FullscreenReassertDelayMs = 250

internal class DesktopAppFullscreenController {
    private var restoreWindowPlacement = WindowPlacement.Floating
    private var windowsFullscreenState: WindowsFullscreenState? = null

    fun toggle(window: Window, windowState: WindowState) {
        if (DesktopHostOs.current == DesktopHostOs.WINDOWS) {
            toggleWindowsFullscreen(window, windowState)
        } else {
            toggleComposeFullscreen(window, windowState)
            if (DesktopHostOs.current == DesktopHostOs.LINUX) {
                enforceLinuxFullscreen(window, windowState)
            }
        }
    }

    /**
     * Compose applies [WindowState.placement] through updaters memoized on the
     * last value it applied, with a write-back listener that re-reads window
     * state on AWT window events. Some window managers (mutter) emit extra
     * state events that convince Compose the window is already windowed while
     * the X11 window still carries _NET_WM_STATE_FULLSCREEN — the exit write is
     * then skipped and the window stays fullscreen. Verify the AWT device state
     * against the intended placement and correct it; a no-op when Compose
     * applied the change itself.
     */
    private fun enforceLinuxFullscreen(window: Window, windowState: WindowState) {
        fun enforce(stage: String) {
            val device = window.graphicsConfiguration?.device ?: return
            val wantFullscreen = windowState.placement == WindowPlacement.Fullscreen
            val awtFullscreen = device.fullScreenWindow === window
            if (wantFullscreen == awtFullscreen) return
            device.fullScreenWindow = if (wantFullscreen) window else null
        }
        SwingUtilities.invokeLater { enforce("immediate") }
        Timer(250) { enforce("delayed") }.apply { isRepeats = false }.start()
    }

    fun dispose(window: Window) {
        exitWindowsFullscreen(window)
    }

    /**
     * Applies a fullscreen state restored from a previous session, before the
     * window has been interacted with. Only acts when [fullscreen] is true;
     * windowed is already the default state for a freshly created window.
     */
    fun applyRestoredFullscreenState(window: Window, windowState: WindowState, fullscreen: Boolean) {
        if (!fullscreen) return
        if (DesktopHostOs.current == DesktopHostOs.WINDOWS) {
            runWhenWindowShown(window) {
                enterWindowsFullscreen(window, windowState)
                // AWT and Compose can still apply the window's restored bounds after this
                // point, which would size the window back out of fullscreen while the app
                // still considers itself fullscreen. Re-assert once so a late write loses.
                Timer(FullscreenReassertDelayMs) { reassertWindowsFullscreen(window) }
                    .apply { isRepeats = false }
                    .start()
            }
        } else {
            restoreWindowPlacement = windowState.placement
                .takeUnless { it == WindowPlacement.Fullscreen }
                ?: WindowPlacement.Floating
            windowState.placement = WindowPlacement.Fullscreen
        }
    }

    fun isFullscreen(window: Window, windowState: WindowState): Boolean =
        if (DesktopHostOs.current == DesktopHostOs.WINDOWS) {
            windowsFullscreenState?.window === window
        } else {
            windowState.placement == WindowPlacement.Fullscreen
        }

    private fun toggleComposeFullscreen(window: Window, windowState: WindowState) {
        if (isFullscreen(window, windowState)) {
            if (DesktopHostOs.current == DesktopHostOs.MACOS) {
                applyMacosComposeFullscreenExit(
                    restorePlacement = restoreWindowPlacement,
                    requestNativeFullscreenExit = { requestNativeComposeFullscreenExit(window) },
                    clearComposeFullscreen = {
                        (window as? ComposeWindow)?.placement = WindowPlacement.Floating
                    },
                    setStatePlacement = { placement ->
                        windowState.placement = placement
                    },
                )
            } else {
                windowState.placement = restoreWindowPlacement
            }
        } else {
            restoreWindowPlacement = windowState.placement
                .takeUnless { it == WindowPlacement.Fullscreen }
                ?: WindowPlacement.Floating
            windowState.placement = WindowPlacement.Fullscreen
        }
    }

    private fun requestNativeComposeFullscreenExit(window: Window): Boolean {
        if (DesktopHostOs.current != DesktopHostOs.MACOS) return false
        return runCatching {
            NativePlayerBridge.setMacosWindowFullscreen(
                windowViewPtr = AwtNativeViewResolver.resolveNativeViewPointer(window),
                fullscreen = false,
            )
        }.isSuccess
    }

    private fun toggleWindowsFullscreen(window: Window, windowState: WindowState) {
        if (windowsFullscreenState?.window === window) {
            exitWindowsFullscreen(window, windowState)
        } else {
            enterWindowsFullscreen(window, windowState)
        }
    }

    private fun enterWindowsFullscreen(window: Window, windowState: WindowState) {
        val wasMaximized = (window as? Frame)?.extendedState == Frame.MAXIMIZED_BOTH ||
            windowState.placement == WindowPlacement.Maximized

        // The peer can still fail to resolve even once displayable (e.g. torn down mid-race);
        // never let a native-bridge lookup crash the caller, and never claim fullscreen state
        // for a window we couldn't actually reach natively.
        val hwnd = runCatching { AwtNativeViewResolver.resolveNativeViewPointer(window) }
            .getOrNull()
            ?.takeIf { it != 0L }
            ?: return

        windowsFullscreenState = WindowsFullscreenState(
            window = window,
            windowHwnd = hwnd,
            wasMaximized = wasMaximized,
        )
        // Pass a zero rect: the native bridge resolves the real monitor bounds itself
        // (resolveBorderlessFullscreenRect -> getMonitorRect), which is per-monitor DPI-correct.
        // The JVM-side `screenBounds * scale` math this replaced got the wrong rect on
        // mixed-DPI multi-monitor setups.
        val applied = runCatching {
            NativePlayerBridge.setWindowBorderlessFullscreen(
                windowHwnd = hwnd,
                fullscreen = true,
                x = 0,
                y = 0,
                width = 0,
                height = 0,
            )
        }.isSuccess
        if (!applied) {
            windowsFullscreenState = null
            return
        }
        if (!window.isFocused) window.requestFocus()
    }

    /**
     * Runs [action] once [window] is actually on screen, not merely constructed.
     *
     * Entering emulated fullscreen needs a window Windows has already shown. The native call
     * snapshots the live window placement as the point to restore to on exit, and sizes the
     * window with SetWindowPos — run before the window is shown, both fail: the snapshot
     * captures Windows' minimum window rect (132x37) rather than real geometry, and the bounds
     * AWT and Compose apply while showing the window overwrite the fullscreen rect afterwards.
     * Displayability is not enough, since the peer is attached partway through being shown.
     */
    private fun runWhenWindowShown(window: Window, action: () -> Unit) {
        var started = false
        var detach: () -> Unit = {}

        fun ready(): Boolean = window.isShowing && window.width > 1 && window.height > 1

        fun attempt() {
            if (started || !ready()) return
            started = true
            detach()
            // Let whatever event made the window visible finish first: AWT and Compose apply
            // the window's initial bounds around that point.
            SwingUtilities.invokeLater(action)
        }

        val onWindow = object : WindowAdapter() {
            override fun windowOpened(event: WindowEvent) = attempt()
            override fun windowActivated(event: WindowEvent) = attempt()
        }
        val onComponent = object : ComponentAdapter() {
            override fun componentShown(event: ComponentEvent) = attempt()
            override fun componentResized(event: ComponentEvent) = attempt()
        }
        detach = {
            window.removeWindowListener(onWindow)
            window.removeComponentListener(onComponent)
        }
        window.addWindowListener(onWindow)
        window.addComponentListener(onComponent)
        attempt()
    }

    /**
     * Re-applies the borderless fullscreen rect if [window] is still meant to be fullscreen.
     * The native side keeps the restore point it captured when fullscreen was entered, so
     * re-entering cannot corrupt it.
     */
    private fun reassertWindowsFullscreen(window: Window) {
        val fullscreenState = windowsFullscreenState?.takeIf { it.window === window } ?: return
        runCatching {
            NativePlayerBridge.setWindowBorderlessFullscreen(
                windowHwnd = fullscreenState.windowHwnd,
                fullscreen = true,
                x = 0,
                y = 0,
                width = 0,
                height = 0,
            )
        }
    }

    private fun exitWindowsFullscreen(window: Window, windowState: WindowState? = null) {
        val fullscreenState = windowsFullscreenState?.takeIf { it.window === window } ?: return
        windowsFullscreenState = null
        NativePlayerBridge.setWindowBorderlessFullscreen(
            windowHwnd = fullscreenState.windowHwnd,
            fullscreen = false,
            x = 0,
            y = 0,
            width = 0,
            height = 0,
        )

        if (window is Frame) {
            if (fullscreenState.wasMaximized) {
                window.extendedState = Frame.NORMAL
                window.extendedState = Frame.MAXIMIZED_BOTH
                windowState?.placement = WindowPlacement.Maximized
            } else {
                window.extendedState = Frame.NORMAL
                windowState?.placement = WindowPlacement.Floating
            }
            window.revalidate()
            window.repaint()
        }
    }

    private data class WindowsFullscreenState(
        val window: Window,
        val windowHwnd: Long,
        val wasMaximized: Boolean,
    )
}

/**
 * ComposeWindow does not clear its fullscreen flag when placement is changed directly from
 * Fullscreen to Maximized on macOS. Let AppKit complete its asynchronous fullscreen exit and let
 * Compose's native window listener restore WindowState; writing Maximized during that transition
 * can alter the frame AppKit is restoring. The Compose fallback is only used if the native macOS
 * request cannot be made.
 */
internal fun applyMacosComposeFullscreenExit(
    restorePlacement: WindowPlacement,
    requestNativeFullscreenExit: () -> Boolean,
    clearComposeFullscreen: () -> Unit,
    setStatePlacement: (WindowPlacement) -> Unit,
) {
    if (requestNativeFullscreenExit()) return

    val targetPlacement = restorePlacement
        .takeUnless { it == WindowPlacement.Fullscreen }
        ?: WindowPlacement.Floating
    clearComposeFullscreen()
    setStatePlacement(targetPlacement)
}

internal fun installDesktopAppFullscreenShortcuts(window: Window): () -> Unit {
    var fullscreenEscapeConsumed = false
    val dispatcher = KeyEventDispatcher { event ->
        if (event.keyCode == KeyEvent.VK_ESCAPE) {
            when (event.id) {
                KeyEvent.KEY_RELEASED -> {
                    if (fullscreenEscapeConsumed) {
                        fullscreenEscapeConsumed = false
                        return@KeyEventDispatcher true
                    }
                }
                KeyEvent.KEY_PRESSED -> {
                    if (fullscreenEscapeConsumed) {
                        return@KeyEventDispatcher true
                    }
                    if (isDesktopAppFullscreen(window)) {
                        fullscreenEscapeConsumed = true
                        toggleDesktopAppFullscreen(window)
                        return@KeyEventDispatcher true
                    }
                }
            }
        }
        if (!event.isDesktopAppFullscreenShortcut()) return@KeyEventDispatcher false
        toggleDesktopAppFullscreen(window)
        true
    }
    KeyboardFocusManager.getCurrentKeyboardFocusManager().addKeyEventDispatcher(dispatcher)
    return {
        KeyboardFocusManager.getCurrentKeyboardFocusManager().removeKeyEventDispatcher(dispatcher)
    }
}

private fun KeyEvent.isDesktopAppFullscreenShortcut(): Boolean {
    if (id != KeyEvent.KEY_PRESSED) return false
    if (keyCode == KeyEvent.VK_F11) return true
    if (keyCode != KeyEvent.VK_F) return false
    val modifiers = modifiersEx
    val hasMacFullscreenModifiers =
        modifiers and KeyEvent.META_DOWN_MASK != 0 &&
            modifiers and KeyEvent.CTRL_DOWN_MASK != 0 &&
            modifiers and KeyEvent.ALT_DOWN_MASK == 0
    return hasMacFullscreenModifiers
}
