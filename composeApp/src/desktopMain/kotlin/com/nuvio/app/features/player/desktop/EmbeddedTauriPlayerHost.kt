package com.nuvio.app.features.player.desktop

import javax.swing.SwingUtilities

/** Optional native parent supplied by the Tauri shell for its in-window player surface. */
internal object EmbeddedTauriPlayerHost {
    @Volatile
    private var hwnd: Long? = null

    @Volatile
    private var onAttached: (() -> Unit)? = null

    private var onPresented: (() -> Unit)? = null

    @Volatile
    private var fullscreen = false

    private var onToggleFullscreen: (() -> Unit)? = null

    fun begin(windowHwnd: Long?, attached: (() -> Unit)? = null, initialFullscreen: Boolean = false, toggleFullscreen: (() -> Unit)? = null, presented: (() -> Unit)? = null) {
        hwnd = windowHwnd?.takeIf { it != 0L }
        onAttached = attached
        onPresented = presented
        fullscreen = hwnd != null && initialFullscreen
        onToggleFullscreen = toggleFullscreen
    }

    fun nativeWindowHandle(): Long? = hwnd

    fun isEmbedded(): Boolean = hwnd != null

    fun playerAttached() {
        onAttached?.let { callback -> SwingUtilities.invokeLater(callback) }
        onAttached = null
    }

    fun isFullscreen(): Boolean = fullscreen

    fun playerPresented() {
        val callback = onPresented
        onPresented = null
        callback?.invoke()
    }

    fun toggleFullscreen() {
        if (hwnd != null) onToggleFullscreen?.invoke()
    }

    fun updateFullscreen(value: Boolean) {
        if (hwnd == null || fullscreen == value) return
        fullscreen = value
        notifyDesktopAppFullscreenChanged()
    }

    fun clear() {
        // The shell owns this window; closing playback preserves its current mode.
        hwnd = null
        onAttached = null
        onPresented = null
        fullscreen = false
        onToggleFullscreen = null
    }
}
