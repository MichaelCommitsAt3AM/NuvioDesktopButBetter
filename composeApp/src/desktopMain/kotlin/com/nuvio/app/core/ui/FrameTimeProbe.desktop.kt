package com.nuvio.app.core.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.withFrameNanos
import co.touchlab.kermit.Logger
import kotlinx.coroutines.isActive

/**
 * Diagnostic-only frame pacing probe, dormant unless explicitly enabled with
 * `-Dnuvio.frame.telemetry=true`.
 *
 * Deliberately gated rather than always-on: requesting a frame callback every single frame is
 * itself a workload, so leaving this running by default would measure a system that's doing
 * more work than the one users actually see. Turn it on only for a deliberate measurement pass.
 */
internal object NuvioFrameTelemetry {
    val enabled: Boolean by lazy { System.getProperty("nuvio.frame.telemetry") == "true" }
    private val logger by lazy { Logger.withTag("FrameTelemetry") }

    fun reportWindow(deltasMs: LongArray, sampleCount: Int) {
        if (sampleCount == 0) return
        val samples = deltasMs.copyOf(sampleCount).also { it.sort() }
        val p50 = samples.percentile(0.50)
        val p95 = samples.percentile(0.95)
        val p99 = samples.percentile(0.99)
        val max = samples.last()
        logger.d { "frame intervals (ms) over $sampleCount frames: p50=$p50 p95=$p95 p99=$p99 max=$max" }
    }

    private fun LongArray.percentile(fraction: Double): Long {
        val index = (fraction * (size - 1)).toInt().coerceIn(0, size - 1)
        return this[index]
    }
}

private const val SampleWindowSize = 300 // ~5s at 60Hz

@Composable
internal fun NuvioFrameTimeProbe() {
    if (!NuvioFrameTelemetry.enabled) return

    LaunchedEffect(Unit) {
        val deltasMs = LongArray(SampleWindowSize)
        var sampleCount = 0
        var lastFrameNanos = 0L
        while (isActive) {
            withFrameNanos { frameNanos ->
                if (lastFrameNanos != 0L) {
                    deltasMs[sampleCount] = (frameNanos - lastFrameNanos) / 1_000_000
                    sampleCount++
                    if (sampleCount == deltasMs.size) {
                        NuvioFrameTelemetry.reportWindow(deltasMs, sampleCount)
                        sampleCount = 0
                    }
                }
                lastFrameNanos = frameNanos
            }
        }
    }
}
