package com.nuvio.app.features.streams

// iPhones decode Dolby Vision, so stream ordering is left as it is.
internal actual fun platformDecodesDolbyVision(): Boolean = true

internal actual suspend fun probeDolbyVisionSupport(url: String, headers: Map<String, String>): DolbyVisionProbeResult =
    DolbyVisionProbeResult.Supported
