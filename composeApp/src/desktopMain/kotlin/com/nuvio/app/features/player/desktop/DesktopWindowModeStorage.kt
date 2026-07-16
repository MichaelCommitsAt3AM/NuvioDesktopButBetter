package com.nuvio.app.features.player.desktop

import com.nuvio.app.core.storage.DesktopStorage
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit

/**
 * Persists desktop window mode/geometry across launches:
 * - whether the app was last closed in fullscreen mode
 * - the last windowed (non-fullscreen) position and size
 *
 * This is intentionally a global (non profile-scoped) preference: it reflects
 * the state of the OS window itself rather than per-user app data.
 */
internal data class DesktopWindowGeometry(
    val x: Float,
    val y: Float,
    val width: Float,
    val height: Float,
)

internal object DesktopWindowModeStorage {
    private const val PersistDebounceMs = 150L
    private const val WasFullscreenKey = "was_fullscreen"
    private const val WindowXKey = "window_x"
    private const val WindowYKey = "window_y"
    private const val WindowWidthKey = "window_width"
    private const val WindowHeightKey = "window_height"
    private val store = DesktopStorage.store("nuvio_window_state")
    private val writeLock = Any()
    private val writer = Executors.newSingleThreadScheduledExecutor { task ->
        Thread(task, "nuvio-window-state-writer").apply { isDaemon = true }
    }
    private var pendingFullscreen: Boolean? = null
    private var pendingGeometry: DesktopWindowGeometry? = null
    private var scheduledWrite: ScheduledFuture<*>? = null

    fun loadWasFullscreen(): Boolean =
        store.getBoolean(WasFullscreenKey) ?: false

    fun saveWasFullscreen(fullscreen: Boolean) {
        synchronized(writeLock) {
            pendingFullscreen = fullscreen
            scheduleWriteLocked()
        }
    }

    fun loadWindowedGeometry(): DesktopWindowGeometry? {
        val x = store.getFloat(WindowXKey) ?: return null
        val y = store.getFloat(WindowYKey) ?: return null
        val width = store.getFloat(WindowWidthKey) ?: return null
        val height = store.getFloat(WindowHeightKey) ?: return null
        return DesktopWindowGeometry(x = x, y = y, width = width, height = height)
    }

    fun saveWindowedGeometry(geometry: DesktopWindowGeometry) {
        synchronized(writeLock) {
            pendingGeometry = geometry
            scheduleWriteLocked()
        }
    }

    fun flushPendingWrites() {
        runCatching {
            writer.submit(::persistPending).get(2, TimeUnit.SECONDS)
        }
    }

    private fun scheduleWriteLocked() {
        scheduledWrite?.cancel(false)
        scheduledWrite = writer.schedule(::persistPending, PersistDebounceMs, TimeUnit.MILLISECONDS)
    }

    private fun persistPending() {
        val (fullscreen, geometry) = synchronized(writeLock) {
            val pending = pendingFullscreen to pendingGeometry
            pendingFullscreen = null
            pendingGeometry = null
            scheduledWrite = null
            pending
        }
        if (fullscreen == null && geometry == null) return

        buildMap<String, String?> {
            fullscreen?.let { value -> put(WasFullscreenKey, value.toString()) }
            geometry?.let { value ->
                put(WindowXKey, value.x.toString())
                put(WindowYKey, value.y.toString())
                put(WindowWidthKey, value.width.toString())
                put(WindowHeightKey, value.height.toString())
            }
        }.also(store::putStrings)
    }
}
