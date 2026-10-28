package com.nuvio.desktop.bridge

import androidx.compose.ui.awt.ComposeWindow
import com.nuvio.app.features.player.desktop.AwtNativeViewResolver
import com.sun.jna.Native
import com.sun.jna.Pointer
import com.sun.jna.win32.StdCallLibrary
import java.awt.Window
import javax.swing.SwingUtilities
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import org.junit.Assume.assumeTrue

class EmbeddedPlaybackWindowTest {
    @Test fun runtimeHostStaysAliveWithoutAppearingAsAnotherApplicationWindow() {
        assumeTrue(System.getProperty("os.name").startsWith("Windows"))
        val user32 = Native.load("user32", EmbeddedWindowUser32::class.java)
        var failure: Throwable? = null
        SwingUtilities.invokeAndWait {
            val window = ComposeWindow()
            try {
                window.type = Window.Type.UTILITY
                window.isUndecorated = true
                window.setBounds(-32_000, -32_000, 640, 360)
                window.opacity = 0f
                window.addNotify()
                val hwnd = Pointer.createConstant(AwtNativeViewResolver.resolveNativeViewPointer(window))
                // Simulate a peer that advertises an independent application window.
                user32.SetWindowLongW(hwnd, -20, (user32.GetWindowLongW(hwnd, -20) or 0x00040000) and 0x00000080.inv())
                excludeEmbeddedPlaybackWindowFromTaskSwitcher(window)
                val beforeShowing = user32.GetWindowLongW(hwnd, -20)
                assertEquals(0, beforeShowing and 0x00040000, "Internal host must not force a taskbar entry")
                assertTrue(beforeShowing and 0x00000080 != 0, "Internal host must be excluded from Alt+Tab")

                window.isVisible = true
                excludeEmbeddedPlaybackWindowFromTaskSwitcher(window)
                val afterShowing = user32.GetWindowLongW(hwnd, -20)
                assertEquals(0, afterShowing and 0x00040000)
                assertTrue(afterShowing and 0x00000080 != 0)
                assertTrue(afterShowing and 0x08000000 != 0, "Internal host must not activate over Tauri")
                assertFalse(window.focusableWindowState)
                assertFalse(window.isAutoRequestFocus)
                assertTrue(window.isDisplayable)
                assertTrue(window.isShowing, "Hiding the AWT peer would dispose the embedded native player")
                // Windows can clamp these coordinates under display scaling.
                assertTrue(window.x + window.width < 0)
                assertTrue(window.y + window.height < 0)
            } catch (error: Throwable) {
                failure = error
            } finally {
                window.dispose()
            }
        }
        failure?.let { throw it }
    }
}

private interface EmbeddedWindowUser32 : StdCallLibrary {
    fun GetWindowLongW(hwnd: Pointer, index: Int): Int
    fun SetWindowLongW(hwnd: Pointer, index: Int, value: Int): Int
}
