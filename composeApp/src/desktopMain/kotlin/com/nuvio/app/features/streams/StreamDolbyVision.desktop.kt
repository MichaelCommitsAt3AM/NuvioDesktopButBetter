package com.nuvio.app.features.streams

/**
 * Desktop plays through mpv, which renders Dolby Vision (including profile 5) itself, so the
 * mobile Dolby Vision fallbacks never apply here: auto-pick keeps its order and nothing is probed.
 */
internal actual fun platformDecodesDolbyVision(): Boolean = true

internal actual suspend fun probeDolbyVisionSupport(url: String, headers: Map<String, String>): DolbyVisionProbeResult =
    DolbyVisionProbeResult.Supported
