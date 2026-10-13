package com.nuvio.desktop.bridge

import kotlinx.coroutines.awaitCancellation
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.window.Window
import androidx.compose.ui.window.application
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/** Child process entry point. The one-time bearer secret arrives on stdin, never argv. */
fun main() {
    val token = System.`in`.bufferedReader().readLine()?.trim()
    require(!token.isNullOrBlank()) { "Missing bridge token on stdin" }
    // The shell persists stderr to bridge-diagnostics.log. Record stream phases,
    // never request URLs, payloads, credentials, or exception messages.
    co.touchlab.kermit.Logger.addLogWriter(object : co.touchlab.kermit.LogWriter() {
        override fun isLoggable(tag: String, severity: co.touchlab.kermit.Severity) =
            tag == "StreamsRepo" && severity >= co.touchlab.kermit.Severity.Info

        override fun log(severity: co.touchlab.kermit.Severity, message: String, tag: String, throwable: Throwable?) {
            val safe = message.replace(Regex("https?://\\S+"), "[URL redacted]")
                .replace(token, "[redacted]")
                .replace(Regex("[\\r\\n]+"), " ")
            System.err.println("[$tag] $safe")
        }
    })
    application(exitProcessOnExit = false) {
        // Keep a Compose Desktop application scope alive for native player windows.
        // ComposeWindow.setContent from the bridge's plain AWT event loop leaves the
        // upstream player surface without its application/window lifecycle.
        Window(onCloseRequest = {}, visible = false) {}
        LaunchedEffect(token) {
            val runtime = DesktopBridgeRuntime()
            try {
                val port = runtime.start(token)
                val handshake = buildJsonObject {
                    put("protocol", 1)
                    put("port", port)
                    put("token", token)
                }
                println("NUVIO_BRIDGE_READY $handshake")
                System.out.flush()
                Runtime.getRuntime().addShutdownHook(Thread {
                    runCatching { kotlinx.coroutines.runBlocking { runtime.stop() } }
                })
                awaitCancellation()
            } catch (failure: CancellationException) {
                throw failure
            } catch (failure: Throwable) {
                System.err.println("Nuvio bridge failed to start: ${failure.message ?: failure::class.simpleName}")
                throw failure
            } finally {
                runtime.stop()
            }
        }
    }
}
