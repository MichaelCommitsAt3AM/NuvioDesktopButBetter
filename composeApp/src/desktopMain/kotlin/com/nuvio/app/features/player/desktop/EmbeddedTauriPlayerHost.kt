package com.nuvio.app.features.player.desktop

import javax.swing.SwingUtilities

/** Optional native parent supplied by the Tauri shell for its in-window player surface. */
internal object EmbeddedTauriPlayerHost {
    @Volatile
    private var hwnd: Long? = null

    @Volatile
    private var onAttached: (() -> Unit)? = null

    @Volatile
    private var fullscreen = false

    fun begin(windowHwnd: Long?, attached: (() -> Unit)? = null) {
        hwnd = windowHwnd?.takeIf { it != 0L }
        onAttached = attached
        fullscreen = false
    }

    fun nativeWindowHandle(): Long? = hwnd

    fun isEmbedded(): Boolean = hwnd != null

    fun playerAttached() {
        onAttached?.let { callback -> SwingUtilities.invokeLater(callback) }
        onAttached = null
    }

    fun isFullscreen(): Boolean = fullscreen

    fun toggleFullscreen() {
        val current = hwnd ?: return
        val next = !fullscreen
        val applied = runCatching {
            NativePlayerBridge.setWindowBorderlessFullscreen(
                windowHwnd = current,
                fullscreen = next,
                x = 0,
                y = 0,
                width = 0,
                height = 0,
            )
        }.isSuccess
        if (applied) fullscreen = next
    }

    fun clear() {
        if (fullscreen) toggleFullscreen()
        hwnd = null
        onAttached = null
        fullscreen = false
    }
}
