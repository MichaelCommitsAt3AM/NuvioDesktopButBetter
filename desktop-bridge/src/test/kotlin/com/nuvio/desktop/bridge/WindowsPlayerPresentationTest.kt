package com.nuvio.desktop.bridge

import com.nuvio.app.features.player.desktop.NativePlayerBridge
import com.nuvio.app.features.player.desktop.NativePlayerEventSink
import com.sun.jna.Memory
import com.sun.jna.Native
import com.sun.jna.Pointer
import com.sun.jna.WString
import com.sun.jna.ptr.IntByReference
import com.sun.jna.win32.StdCallLibrary
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.file.Files
import java.util.concurrent.CompletableFuture
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import org.junit.Assume.assumeTrue

/** Runs the real JNI/mpv/WebView2 handoff, with no network or user media. */
class WindowsPlayerPresentationTest {
    @Test fun presentsUnderADifferentDpiHostWhileWarmupIsAlive() {
        assumeTrue(System.getProperty("os.name").startsWith("Windows"))
        val user32 = Native.load("user32", PlayerTestUser32::class.java)
        val shcore = Native.load("shcore", PlayerTestShcore::class.java)
        val processAwareness = IntByReference()
        assertEquals(0, shcore.GetProcessDpiAwareness(null, processAwareness))
        // The native warm-up thread inherits the process default. Force the
        // embedded host into another mode, just as Tauri differs from the JVM.
        val hostAwareness = if (processAwareness.value == 2) 0 else 2
        val hostReady = CompletableFuture<Pointer>()
        val hostThread = thread(name = "player-test-host", isDaemon = true) {
            var hwnd: Pointer? = null
            try {
                val context = Pointer.createConstant(if (hostAwareness == 2) -4L else -1L)
                check(user32.SetThreadDpiAwarenessContext(context) != null)
                hwnd = user32.CreateWindowExW(0, WString("STATIC"), WString("Player handoff test"),
                    0x10CF0000, -32000, -32000, 640, 360, null, null, null, null)
                check(hwnd != null) { "Could not create the native test host" }
                hostReady.complete(hwnd)
                // MSG is 48 bytes on x64/arm64 and 28 on x86; reserve enough for both.
                val message = Memory(48)
                while (user32.GetMessageW(message, null, 0, 0) > 0) {
                    user32.TranslateMessage(message)
                    user32.DispatchMessageW(message)
                }
            } catch (error: Throwable) {
                hostReady.completeExceptionally(error)
            } finally {
                hwnd?.let { user32.DestroyWindow(it) }
            }
        }
        var handle = 0L
        var hwnd: Pointer? = null
        val wav = Files.createTempFile("nuvio-player-handoff-", ".wav")
        val events = ConcurrentLinkedQueue<String>()
        val presented = CompletableFuture<Boolean>()
        val initialStateApplied = CompletableFuture<Boolean>()
        try {
            hwnd = hostReady.get(10, TimeUnit.SECONDS)
            assertEquals(hostAwareness, user32.GetAwarenessFromDpiAwarenessContext(user32.GetWindowDpiAwarenessContext(hwnd)))
            // Keeping this alive is essential: the old shared-profile code fails
            // controller creation with 0x8007139F only when both modes coexist.
            assertTrue(NativePlayerBridge.warmupWebView2(NativePlayerBridge.controlsPageUrl), "WebView2 warm-up failed")
            val samples = 16000
            Files.write(wav, ByteBuffer.allocate(44 + samples * 2).order(ByteOrder.LITTLE_ENDIAN).apply {
                put("RIFF".toByteArray()); putInt(36 + samples * 2); put("WAVEfmt ".toByteArray())
                putInt(16); putShort(1); putShort(1); putInt(16000); putInt(32000)
                putShort(2); putShort(16); put("data".toByteArray()); putInt(samples * 2)
            }.array())
            handle = NativePlayerBridge.create(
                Pointer.nativeValue(hwnd), wav.toUri().toString(), emptyArray(), "", "", true,
                false, 0L, NativePlayerBridge.controlsPageUrl, 2, false,
                NativePlayerEventSink { type, value ->
                    if (type.startsWith("bridgeControls") || type.startsWith("nativeControls")) events.add("$type=$value")
                    if (type == "nativeControlsPresented") presented.complete(true)
                    if (type == "nativeControlsFailed") presented.complete(false)
                    if (type == "bridgeControlsInitialStateResult") initialStateApplied.complete(value == 1.0)
                },
            )
            assertTrue(handle != 0L)
            NativePlayerBridge.updateControls(handle, """{"title":"DPI regression test","isLoading":true}""")
            val succeeded = try { presented.get(20, TimeUnit.SECONDS) } catch (error: Exception) {
                throw AssertionError("Native presentation timed out: $events", error)
            }
            assertTrue(succeeded, "Native presentation failed: $events")
            assertTrue(initialStateApplied.get(5, TimeUnit.SECONDS), "Initial controls state was not applied: $events")
            val container = user32.FindWindowExW(hwnd, null, WString("NuvioPlayerBridgeContainerWindow"), null)
            assertTrue(container != null && user32.IsWindowVisible(container), "Acknowledged player surface is still hidden")
        } finally {
            try {
                if (handle != 0L) NativePlayerBridge.dispose(handle)
            } finally {
                NativePlayerBridge.shutdownWebView2Warmup()
                // Destroy the host in its owning thread's finally block.
                hwnd?.let { user32.PostThreadMessageW(user32.GetWindowThreadProcessId(it, null), 0x0012, null, null) }
                hostThread.join(5000)
                Files.deleteIfExists(wav)
            }
        }
    }

    @Test fun containerTracksLaterHostResizesAfterPresentation() {
        assumeTrue(System.getProperty("os.name").startsWith("Windows"))
        val user32 = Native.load("user32", PlayerTestUser32::class.java)
        val hostReady = CompletableFuture<Pointer>()
        val pipReady = CompletableFuture<Pointer>()
        val hostThread = thread(name = "player-test-resize-host", isDaemon = true) {
            var hwnd: Pointer? = null
            var pip: Pointer? = null
            try {
                check(user32.SetThreadDpiAwarenessContext(Pointer.createConstant(-4L)) != null)
                hwnd = user32.CreateWindowExW(0, WString("STATIC"), WString("Player resize test"),
                    0x10CF0000, -32000, -32000, 640, 360, null, null, null, null)
                check(hwnd != null) { "Could not create the native test host" }
                // AWT PiP uses the JVM's default DPI mode, unlike the Tauri host.
                user32.SetThreadDpiAwarenessContext(Pointer.createConstant(-1L))
                pip = user32.CreateWindowExW(0, WString("STATIC"), WString("Player PiP test"),
                    0x10CF0000, -32000, -32000, 480, 270, null, null, null, null)
                check(pip != null)
                pipReady.complete(pip)
                hostReady.complete(hwnd)
                val message = Memory(48)
                while (user32.GetMessageW(message, null, 0, 0) > 0) {
                    user32.TranslateMessage(message)
                    user32.DispatchMessageW(message)
                }
            } catch (error: Throwable) {
                hostReady.completeExceptionally(error)
            } finally {
                pip?.let { user32.DestroyWindow(it) }
                hwnd?.let { user32.DestroyWindow(it) }
            }
        }
        var handle = 0L
        var hwnd: Pointer? = null
        val wav = Files.createTempFile("nuvio-player-resize-", ".y4m")
        val presented = CompletableFuture<Boolean>()
        val closeRequested = CompletableFuture<Boolean>()
        val reparentError = CompletableFuture<Double>()
        try {
            hwnd = hostReady.get(10, TimeUnit.SECONDS)
            // Real video is essential: a WAV never creates mpv's child HWND.
            Files.newOutputStream(wav).use { output ->
                output.write("YUV4MPEG2 W64 H36 F25:1 Ip A1:1 C420jpeg\n".toByteArray())
                repeat(50) {
                    output.write("FRAME\n".toByteArray())
                    output.write(ByteArray(64 * 36) { 96 })
                    output.write(ByteArray(64 * 36 / 2) { 128.toByte() })
                }
            }
            handle = NativePlayerBridge.create(
                Pointer.nativeValue(hwnd), wav.toUri().toString(), emptyArray(), "", "", true,
                false, 0L, NativePlayerBridge.controlsPageUrl, 2, false,
                NativePlayerEventSink { type, value ->
                    if (type == "nativeControlsPresented") presented.complete(true)
                    if (type == "nativeControlsFailed") presented.complete(false)
                    if (type == "pictureInPicture") closeRequested.complete(true)
                    if (type == "bridgeControlsLayoutReparentError") reparentError.complete(value)
                },
            )
            assertTrue(handle != 0L)
            NativePlayerBridge.updateControls(handle, """{"title":"Resize regression test","isLoading":true}""")
            assertTrue(
                try { presented.get(20, TimeUnit.SECONDS) } catch (error: Exception) { false },
                "Native presentation timed out",
            )
            val container = user32.FindWindowExW(hwnd, null, WString("NuvioPlayerBridgeContainerWindow"), null)
            check(container != null) { "Player container was not created under the test host" }
            assertRectEquals(clientRect(user32, hwnd), clientRect(user32, container), "Container does not fill the host after presentation")
            val videoDeadline = System.currentTimeMillis() + 8000
            var video = user32.FindWindowExW(container, null, WString("mpv"), null)
            while (video == null && System.currentTimeMillis() < videoDeadline) {
                Thread.sleep(100)
                video = user32.FindWindowExW(container, null, WString("mpv"), null)
            }
            check(video != null) { "mpv did not create its video window" }
            assertRectEquals(clientRect(user32, container), awaitClientRect(user32, video, clientRect(user32, container), 8000), "Video does not fill the container on launch")
            // Growing the host must grow the container without any further input:
            // the presentation-time size must not stick once the window changes.
            assertTrue(user32.SetWindowPos(hwnd, null, 0, 0, 960, 540, 0x0004 or 0x0010), "Could not resize the test host")
            assertRectEquals(
                clientRect(user32, hwnd),
                awaitClientRect(user32, container, clientRect(user32, hwnd), 8000),
                "Container did not follow the host resize",
            )
            // Shrinking the container behind the layout cache must heal without
            // any host resize: this is the stuck-small surface from the bug report.
            val hostNow = clientRect(user32, hwnd)
            assertTrue(user32.SetWindowPos(container, null, 0, 0, 320, 180, 0x0004 or 0x0010), "Could not shrink the test container")
            assertRectEquals(hostNow, awaitClientRect(user32, container, hostNow, 8000), "Container did not heal after an out-of-band shrink")
            // A stale video child must heal even when the outer layout cache matches.
            assertTrue(user32.SetWindowPos(video, null, 0, 0, 320, 180, 0x0004 or 0x0010))
            assertRectEquals(hostNow, awaitClientRect(user32, video, hostNow, 8000), "Video did not heal independently of the container")
            val incompatiblePip = pipReady.get(5, TimeUnit.SECONDS)
            assertFalse(NativePlayerBridge.reparentSurface(handle, Pointer.nativeValue(incompatiblePip)), "Cross-DPI SetParent unexpectedly succeeded")
            assertEquals(5023.0, reparentError.get(5, TimeUnit.SECONDS), "Expected ERROR_INVALID_STATE for the incompatible DPI host")
            assertEquals(hwnd, user32.GetParent(container), "Failed reparent changed the active host")
            assertTrue(NativePlayerBridge.enterPictureInPicture(handle, "Video PiP test", 16f / 9f), "Native PiP creation failed")
            val pip = checkNotNull(user32.GetParent(container))
            assertTrue(pip != hwnd && pip != incompatiblePip)
            assertEquals(user32.GetAwarenessFromDpiAwarenessContext(user32.GetWindowDpiAwarenessContext(container)),
                user32.GetAwarenessFromDpiAwarenessContext(user32.GetWindowDpiAwarenessContext(pip)))
            assertEquals(pip, user32.GetParent(container), "Container did not move into PiP")
            val pipRect = clientRect(user32, pip)
            assertRectEquals(pipRect, awaitClientRect(user32, video, pipRect, 8000), "Video did not follow PiP geometry")
            // Resizing a native root must not recursively reposition it at (0,0).
            assertTrue(user32.SetWindowPos(pip, null, -30000, -30000, 560, 315, 0x0004 or 0x0010))
            val resizedPipRect = clientRect(user32, pip)
            assertRectEquals(resizedPipRect, awaitClientRect(user32, video, resizedPipRect, 8000), "Video did not follow PiP resize")
            val screenRect = Memory(16)
            assertTrue(user32.GetWindowRect(pip, screenRect))
            assertEquals(-30000, screenRect.getInt(0))
            assertEquals(-30000, screenRect.getInt(4))
            assertTrue(user32.PostMessageW(pip, 0x0010, null, null)) // WM_CLOSE
            assertTrue(closeRequested.get(5, TimeUnit.SECONDS), "Native close did not request restore")
            assertTrue(user32.IsWindow(pip), "Close destroyed PiP before the coordinator restored video")
            assertTrue(NativePlayerBridge.reparentSurface(handle, Pointer.nativeValue(hwnd)), "PiP restore failed")
            NativePlayerBridge.closePictureInPicture(handle)
            assertFalse(user32.IsWindow(pip), "Restored PiP window was not destroyed")
            assertEquals(hwnd, user32.GetParent(container))
            assertRectEquals(hostNow, awaitClientRect(user32, video, hostNow, 8000), "Video did not restore to the main geometry")
            // Repeated entry reuses playback, and shutdown must destroy the PiP root.
            assertTrue(NativePlayerBridge.enterPictureInPicture(handle, "Second PiP", 16f / 9f))
            val finalPip = checkNotNull(user32.GetParent(container))
            NativePlayerBridge.dispose(handle)
            handle = 0L
            assertFalse(user32.IsWindow(finalPip), "Player shutdown leaked the PiP window")
        } finally {
            try {
                if (handle != 0L) NativePlayerBridge.dispose(handle)
            } finally {
                hwnd?.let { user32.PostThreadMessageW(user32.GetWindowThreadProcessId(it, null), 0x0012, null, null) }
                hostThread.join(5000)
                Files.deleteIfExists(wav)
            }
        }
    }

    private fun clientRect(user32: PlayerTestUser32, hwnd: Pointer): IntArray {
        val rect = Memory(16)
        check(user32.GetClientRect(hwnd, rect)) { "GetClientRect failed" }
        return intArrayOf(rect.getInt(0), rect.getInt(4), rect.getInt(8), rect.getInt(12))
    }

    private fun awaitClientRect(user32: PlayerTestUser32, hwnd: Pointer, expected: IntArray, timeoutMs: Long): IntArray {
        val deadline = System.currentTimeMillis() + timeoutMs
        var actual = clientRect(user32, hwnd)
        while (!actual.contentEquals(expected) && System.currentTimeMillis() < deadline) {
            Thread.sleep(100)
            actual = clientRect(user32, hwnd)
        }
        return actual
    }

    private fun assertRectEquals(expected: IntArray, actual: IntArray, message: String) {
        assertEquals(expected.toList(), actual.toList(), "$message (expected=${expected.toList()} actual=${actual.toList()})")
    }
}

private interface PlayerTestShcore : StdCallLibrary {
    fun GetProcessDpiAwareness(process: Pointer?, awareness: IntByReference): Int
}

private interface PlayerTestUser32 : StdCallLibrary {
    fun SetThreadDpiAwarenessContext(context: Pointer): Pointer?
    fun GetWindowDpiAwarenessContext(hwnd: Pointer): Pointer
    fun GetAwarenessFromDpiAwarenessContext(context: Pointer): Int
    fun CreateWindowExW(exStyle: Int, className: WString, name: WString, style: Int, x: Int, y: Int, width: Int, height: Int,
                        parent: Pointer?, menu: Pointer?, instance: Pointer?, param: Pointer?): Pointer?
    fun GetMessageW(message: Pointer, hwnd: Pointer?, min: Int, max: Int): Int
    fun TranslateMessage(message: Pointer): Boolean
    fun DispatchMessageW(message: Pointer): Pointer?
    fun DestroyWindow(hwnd: Pointer): Boolean
    fun PostThreadMessageW(thread: Int, message: Int, wparam: Pointer?, lparam: Pointer?): Boolean
    fun GetWindowThreadProcessId(hwnd: Pointer, process: IntByReference?): Int
    fun FindWindowExW(parent: Pointer, after: Pointer?, className: WString, name: WString?): Pointer?
    fun IsWindowVisible(hwnd: Pointer): Boolean
    fun IsWindow(hwnd: Pointer): Boolean
    fun SetWindowPos(hwnd: Pointer, after: Pointer?, x: Int, y: Int, width: Int, height: Int, flags: Int): Boolean
    fun GetClientRect(hwnd: Pointer, rect: Pointer): Boolean
    fun GetWindowRect(hwnd: Pointer, rect: Pointer): Boolean
    fun PostMessageW(hwnd: Pointer, message: Int, wparam: Pointer?, lparam: Pointer?): Boolean
    fun GetParent(hwnd: Pointer): Pointer?
}
