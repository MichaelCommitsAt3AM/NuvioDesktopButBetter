package com.nuvio.app.features.player.desktop

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

private object DesktopAppWindowFocus {
    private val _events = MutableStateFlow(0)
    val events: StateFlow<Int> = _events.asStateFlow()

    fun notifyGainedFocus() {
        _events.value += 1
    }
}

/**
 * Emits whenever the app window regains OS focus (e.g. after alt-tabbing back in).
 * The active native player uses this to re-focus its embedded webview, since AWT
 * focus alone doesn't route keyboard input into it.
 */
internal val desktopWindowFocusEvents: StateFlow<Int>
    get() = DesktopAppWindowFocus.events

internal fun notifyDesktopWindowGainedFocus() {
    DesktopAppWindowFocus.notifyGainedFocus()
}
