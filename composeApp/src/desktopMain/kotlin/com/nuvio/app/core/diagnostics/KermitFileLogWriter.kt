package com.nuvio.app.core.diagnostics

import co.touchlab.kermit.LogWriter
import co.touchlab.kermit.Severity
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Persists Kermit log lines (Info and above) into the same rotating file DesktopDiagnostics
 * already writes breadcrumbs to, so reproducing an intermittent bug produces one file a user
 * can hand over instead of requiring a terminal attached to see console output.
 *
 * Targets startup/loading bugs specifically: once the native player actually attaches (the
 * user is watching something), [disable] turns this off for the rest of the session so
 * high-volume playback logging doesn't rotate the startup sequence out of the file before
 * anyone gets a chance to grab it.
 */
internal class KermitFileLogWriter : LogWriter() {
    override fun isLoggable(tag: String, severity: Severity): Boolean =
        enabled.get() && severity >= Severity.Info

    override fun log(severity: Severity, message: String, tag: String, throwable: Throwable?) {
        val details = if (throwable != null) {
            "$message | ${throwable.stackTraceToString()}"
        } else {
            message
        }
        DesktopDiagnostics.record(event = "$tag/${severity.name}", details = details)
    }

    companion object {
        private val enabled = AtomicBoolean(true)

        fun disable() {
            enabled.set(false)
        }
    }
}
