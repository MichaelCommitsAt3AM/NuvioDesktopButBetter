package com.nuvio.app.core.diagnostics

import kotlinx.atomicfu.locks.SynchronizedObject
import kotlinx.atomicfu.locks.synchronized
import kotlin.time.TimeMark
import kotlin.time.TimeSource

/**
 * TEMPORARY debug instrumentation — measures how long a stream takes to go from the
 * user tapping a stream card (or an auto-play kicking in) to the first frame of
 * playback. Only wired up on desktop: [StreamLoadTimelineFile.install] registers
 * [sink] at start-up to append a report block to `logs/stream-timing.log`; on every
 * other platform [sink] stays null and every call here is a cheap no-op.
 *
 * Remove this file and its call sites once desktop start-up latency has been
 * characterised. Call sites are tagged with `// STREAM-LOAD-TIMELINE` for grep.
 */
object StreamLoadTimeline {
    private val lock = SynchronizedObject()
    private val marks = mutableListOf<Mark>()
    private var startMark: TimeMark? = null
    private var header: String = ""
    private var finished: Boolean = false

    private data class Mark(val label: String, val atMs: Long)

    /** Registered by the desktop app; receives one formatted multi-line report per playback. */
    var sink: ((String) -> Unit)? = null

    /** Start (or restart) a timeline. A previous unfinished one is discarded. */
    fun begin(header: String) {
        synchronized(lock) {
            this.header = header
            this.startMark = TimeSource.Monotonic.markNow()
            this.marks.clear()
            this.finished = false
        }
    }

    /** Record an intermediate checkpoint. */
    fun mark(label: String) {
        synchronized(lock) {
            val start = startMark ?: return
            if (finished) return
            marks += Mark(label, start.elapsedNow().inWholeMilliseconds)
        }
    }

    /** Terminal checkpoint: playback started. Emits the report. */
    fun finish(label: String) = emit(label, failed = false)

    /** Terminal checkpoint: the attempt failed before playback. Emits the report. */
    fun fail(label: String) = emit(label, failed = true)

    private fun emit(label: String, failed: Boolean) {
        var out: ((String) -> Unit)? = null
        var text = ""
        synchronized(lock) {
            val start = startMark ?: return
            if (finished) return
            val sink = sink ?: return
            finished = true
            val totalMs = start.elapsedNow().inWholeMilliseconds
            marks += Mark(label, totalMs)
            out = sink
            text = render(failed, totalMs)
        }
        out?.invoke(text)
    }

    private fun render(failed: Boolean, totalMs: Long): String = buildString {
        append(if (failed) "STREAM LOAD FAILED  " else "STREAM LOAD  ")
        append(header)
        append('\n')
        var prevMs = 0L
        for (m in marks) {
            val deltaMs = (m.atMs - prevMs).coerceAtLeast(0L)
            prevMs = m.atMs
            append("  ")
            append(formatMs(deltaMs).padStart(8))
            append("   +")
            append(formatMs(m.atMs).padStart(8))
            append("   ")
            append(m.label)
            append('\n')
        }
        append("  ")
        append("-".repeat(8))
        append('\n')
        append("  ")
        append(formatMs(totalMs).padStart(8))
        append("              TOTAL (click → last step)")
        append('\n')
    }

    private fun formatMs(ms: Long): String = when {
        ms >= 10_000 -> "${ms / 1000}s"
        ms >= 1_000 -> "${ms / 1000}.${(ms % 1000) / 100}s"
        else -> "${ms}ms"
    }
}
