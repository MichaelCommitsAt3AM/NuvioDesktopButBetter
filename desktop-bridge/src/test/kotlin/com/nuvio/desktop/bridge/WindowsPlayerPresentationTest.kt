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
                false, 0L, NativePlayerBridge.controlsPageUrl, 0, false,
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
}
