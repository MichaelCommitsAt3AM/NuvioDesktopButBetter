package com.nuvio.app.core.ui

import co.touchlab.kermit.Logger
import coil3.EventListener
import coil3.decode.Decoder
import coil3.fetch.Fetcher
import coil3.request.ErrorResult
import coil3.request.ImageRequest
import coil3.request.Options
import coil3.request.SuccessResult

/**
 * Diagnostic-only image pipeline telemetry, dormant unless explicitly enabled. Enable with
 * `-Dnuvio.image.telemetry=true` (see `smokePlayerUrl` in build.gradle.kts for the pattern of
 * threading a JVM system property through to a packaged run).
 *
 * This exists to answer, with numbers instead of guesses: how long requests wait for a fetch/
 * decode pool slot (queue time), how long fetch and decode themselves take, whether a load was a
 * memory/disk/network hit, and — from [NuvioSkiaImageDecoder] directly, since [EventListener]
 * doesn't expose them — encoded payload size and source pixel dimensions.
 */
internal object NuvioImageTelemetry {
    val enabled: Boolean by lazy { System.getProperty("nuvio.image.telemetry") == "true" }

    internal val logger by lazy { Logger.withTag("ImageTelemetry") }

    fun logDecode(
        encodedBytes: Int,
        srcWidth: Int,
        srcHeight: Int,
        outWidth: Int,
        outHeight: Int,
        decodeMs: Long,
    ) {
        if (!enabled) return
        logger.d {
            "decode src=${srcWidth}x$srcHeight out=${outWidth}x$outHeight " +
                "bytes=$encodedBytes decodeMs=$decodeMs"
        }
    }
}

/**
 * One instance per request (Coil calls [EventListener.Factory.create] per-request), so timing
 * state can just be instance fields rather than a keyed map.
 */
internal class NuvioImageEventListener private constructor(
    private val requestKey: String,
) : EventListener() {
    private val startNanos = System.nanoTime()
    private var fetchStartNanos = 0L
    private var decodeStartNanos = 0L

    override fun fetchStart(request: ImageRequest, fetcher: Fetcher, options: Options) {
        fetchStartNanos = System.nanoTime()
    }

    override fun decodeStart(request: ImageRequest, decoder: Decoder, options: Options) {
        decodeStartNanos = System.nanoTime()
    }

    override fun onSuccess(request: ImageRequest, result: SuccessResult) {
        log(outcome = "success", source = result.dataSource.name)
    }

    override fun onError(request: ImageRequest, result: ErrorResult) {
        log(outcome = "error(${result.throwable.message})")
    }

    override fun onCancel(request: ImageRequest) {
        log(outcome = "cancel")
    }

    private fun log(outcome: String, source: String? = null) {
        val nowNanos = System.nanoTime()
        val totalMs = (nowNanos - startNanos) / 1_000_000
        // fetchStartNanos/decodeStartNanos stay 0 on a full memory-cache hit — fetchStart and
        // decodeStart are never called on that path, which is itself useful information.
        val queueMs = if (fetchStartNanos > 0) (fetchStartNanos - startNanos) / 1_000_000 else null
        val fetchToDecodeMs = if (fetchStartNanos > 0 && decodeStartNanos > 0) {
            (decodeStartNanos - fetchStartNanos) / 1_000_000
        } else {
            null
        }
        NuvioImageTelemetry.logger.d {
            buildString {
                append(outcome)
                append(" total=${totalMs}ms")
                if (queueMs != null) append(" fetchQueue=${queueMs}ms")
                if (fetchToDecodeMs != null) append(" fetchToDecode=${fetchToDecodeMs}ms")
                if (source != null) append(" source=$source")
                append(" key=$requestKey")
            }
        }
    }

    companion object {
        val factory = EventListener.Factory { request ->
            if (NuvioImageTelemetry.enabled) {
                NuvioImageEventListener(requestKey = request.data.toString())
            } else {
                EventListener.NONE
            }
        }
    }
}
