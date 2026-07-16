package com.nuvio.app.core.diagnostics

import com.nuvio.app.core.storage.DesktopStorage
import java.io.PrintWriter
import java.io.StringWriter
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardCopyOption
import java.nio.file.StandardOpenOption
import java.time.Instant
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.io.path.exists
import kotlin.io.path.isRegularFile
import kotlin.io.path.name

/**
 * Small, synchronous breadcrumbs for failures which terminate the JVM before a
 * normal logging backend can flush. Do not write URLs, headers, or user data here.
 */
internal object DesktopDiagnostics {
    private const val MaxLogBytes = 2L * 1024L * 1024L
    private const val MaxDetailLength = 64 * 1024
    private val initialized = AtomicBoolean(false)
    private val lock = Any()

    val logDirectory: Path by lazy { DesktopStorage.rootDir.resolve("logs") }
    val logFile: Path by lazy { logDirectory.resolve("nuvio-player.log") }
    private val previousLogFile: Path by lazy { logDirectory.resolve("nuvio-player.previous.log") }
    private val crashDirectory: Path by lazy { logDirectory.resolve("crashes") }

    fun initialize() {
        if (!initialized.compareAndSet(false, true)) return

        synchronized(lock) {
            runCatching {
                Files.createDirectories(logDirectory)
                rotateIfNeeded()
            }
        }
        collectJvmFatalErrorReports()
        installUncaughtExceptionHandler()
        record(
            event = "app_session_started",
            details = "pid=${ProcessHandle.current().pid()} os=${System.getProperty("os.name")} " +
                "java=${System.getProperty("java.version")}",
        )
    }

    fun record(event: String, details: String = "") {
        val safeEvent = sanitize(event, 120)
        val safeDetails = sanitize(details, MaxDetailLength)
        val line = buildString {
            append(Instant.now())
            append(" | thread=")
            append(sanitize(Thread.currentThread().name, 120))
            append(" | ")
            append(safeEvent)
            if (safeDetails.isNotEmpty()) {
                append(" | ")
                append(safeDetails)
            }
            append(System.lineSeparator())
        }

        synchronized(lock) {
            runCatching {
                Files.createDirectories(logDirectory)
                rotateIfNeeded(line.toByteArray(StandardCharsets.UTF_8).size.toLong())
                Files.writeString(
                    logFile,
                    line,
                    StandardCharsets.UTF_8,
                    StandardOpenOption.CREATE,
                    StandardOpenOption.WRITE,
                    StandardOpenOption.APPEND,
                )
            }
        }
    }

    fun recordFailure(event: String, error: Throwable, details: String = "") {
        val trace = StringWriter().also { writer ->
            error.printStackTrace(PrintWriter(writer))
        }.toString()
        record(event, listOf(details, trace).filter(String::isNotBlank).joinToString(" | "))
    }

    private fun installUncaughtExceptionHandler() {
        val previous = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, error ->
            recordFailure(
                event = "uncaught_exception",
                error = error,
                details = "thread=${thread.name}",
            )
            previous?.uncaughtException(thread, error)
        }
    }

    private fun collectJvmFatalErrorReports() {
        val candidateDirectories = linkedSetOf<Path>()
        System.getProperty("user.dir")?.takeIf(String::isNotBlank)?.let { candidateDirectories.add(Path.of(it)) }
        System.getProperty("java.io.tmpdir")?.takeIf(String::isNotBlank)?.let { candidateDirectories.add(Path.of(it)) }

        for (directory in candidateDirectories) {
            runCatching {
                if (!directory.exists()) return@runCatching
                Files.list(directory).use { files ->
                    files
                        .filter { it.isRegularFile() && it.name.matches(Regex("hs_err_pid\\d+\\.log")) }
                        .forEach { report -> copyFatalErrorReport(report) }
                }
            }
        }
    }

    private fun copyFatalErrorReport(report: Path) {
        runCatching {
            Files.createDirectories(crashDirectory)
            val destination = crashDirectory.resolve(report.name)
            if (!destination.exists() || Files.size(destination) != Files.size(report)) {
                Files.copy(report, destination, StandardCopyOption.REPLACE_EXISTING)
                record("jvm_fatal_report_collected", "file=${destination.fileName}")
            }
        }
    }

    private fun rotateIfNeeded(incomingBytes: Long = 0L) {
        if (!logFile.exists()) return
        if (Files.size(logFile) + incomingBytes <= MaxLogBytes) return
        Files.move(logFile, previousLogFile, StandardCopyOption.REPLACE_EXISTING)
    }

    private fun sanitize(value: String, maxLength: Int): String =
        value
            .replace('\r', ' ')
            .replace('\n', ' ')
            .take(maxLength)
}
