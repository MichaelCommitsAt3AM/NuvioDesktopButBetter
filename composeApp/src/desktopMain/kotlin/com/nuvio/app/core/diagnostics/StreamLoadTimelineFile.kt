package com.nuvio.app.core.diagnostics

import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardOpenOption
import java.time.Instant

/**
 * TEMPORARY debug instrumentation — see [StreamLoadTimeline].
 *
 * Appends each stream-load report to `<Nuvio data dir>/logs/stream-timing.log`, a
 * dedicated file (not the shared `nuvio-player.log`) so the timings stay readable and
 * are easy to grab/export. Never rotated — it only grows one small block per playback,
 * and this whole feature is meant to be removed after testing.
 */
internal object StreamLoadTimelineFile {
    private val lock = Any()
    private val file: Path by lazy { DesktopDiagnostics.logDirectory.resolve("stream-timing.log") }

    fun install() {
        StreamLoadTimeline.sink = { report ->
            synchronized(lock) {
                runCatching {
                    Files.createDirectories(DesktopDiagnostics.logDirectory)
                    Files.writeString(
                        file,
                        buildString {
                            append(Instant.now())
                            append('\n')
                            append(report)
                            append('\n')
                        },
                        StandardCharsets.UTF_8,
                        StandardOpenOption.CREATE,
                        StandardOpenOption.WRITE,
                        StandardOpenOption.APPEND,
                    )
                }
            }
        }
        DesktopDiagnostics.record("stream_timing_log_enabled", "file=$file")
    }
}
