package com.nuvio.desktop.bridge

import androidx.compose.ui.awt.ComposeWindow
import com.nuvio.app.features.player.desktop.AwtNativeViewResolver
import com.nuvio.app.features.player.desktop.DesktopHostOs
import com.nuvio.app.features.player.desktop.NativePlayerBridge

/** The AWT peer must stay alive for Compose; only the Tauri window belongs in Alt+Tab. */
internal fun excludeEmbeddedPlaybackWindowFromTaskSwitcher(window: ComposeWindow) {
    if (DesktopHostOs.current != DesktopHostOs.WINDOWS) return
    window.focusableWindowState = false
    window.isAutoRequestFocus = false
    if (!window.isDisplayable) window.addNotify()
    NativePlayerBridge.excludeWindowFromTaskSwitcher(AwtNativeViewResolver.resolveNativeViewPointer(window))
}
