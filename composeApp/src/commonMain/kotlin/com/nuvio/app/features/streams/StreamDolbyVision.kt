package com.nuvio.app.features.streams

/**
 * Whether this device has a hardware Dolby Vision decoder. Without one, Dolby Vision profiles
 * that carry no HDR10/SDR base layer (profile 5, most streaming-service WEB-DLs) cannot play.
 */
internal expect fun platformDecodesDolbyVision(): Boolean

/** What reading a file's header said about whether this device can show its video. */
internal enum class DolbyVisionProbeResult {
    /** Not Dolby Vision, or Dolby Vision this device can show (decoder or HDR10/SDR base layer). */
    Supported,

    /** Dolby Vision this device cannot show, e.g. profile 5 without a Dolby Vision decoder. */
    Unsupported,

    /** The header could not be read in time. */
    Unknown,
}

/** Reads only the track list of the file at [url], without downloading or playing the video. */
internal expect suspend fun probeDolbyVisionSupport(url: String, headers: Map<String, String>): DolbyVisionProbeResult

/** What a stream's labels say about Dolby Vision, judged from its name, title and file name. */
internal enum class StreamDolbyVisionLabel {
    /** No Dolby Vision tag. */
    None,

    /** Dolby Vision plus an HDR10/HDR/HLG tag ("DV | HDR10"): a base layer other devices can play. */
    WithHdrFallback,

    /** Dolby Vision with no fallback tag, usually profile 5, which needs a Dolby Vision decoder. */
    Only,
}

internal object StreamDolbyVision {
    private val dolbyVisionTag = Regex("""(?i)(?<![a-z0-9])(dv|dovi|dolby[ ._-]?vision)(?![a-z0-9])""")
    private val hdrFallbackTag = Regex("""(?i)(?<![a-z0-9])(hdr10\+?|hdr10plus|hdr|hlg)(?![a-z0-9])""")

    fun label(stream: StreamItem): StreamDolbyVisionLabel {
        val resolve = stream.clientResolve
        val raw = resolve?.stream?.raw
        val parsed = raw?.parsed
        // The release's own labels only; add-on and source names can contain anything.
        val texts = listOfNotNull(
            stream.name,
            stream.title,
            stream.description,
            stream.behaviorHints.filename,
            raw?.filename,
            resolve?.filename,
            raw?.torrentName,
            resolve?.torrentName,
            stream.debridCacheStatus?.cachedName,
            parsed?.rawTitle,
            parsed?.hdr?.joinToString(" "),
        ).filter { it.isNotBlank() }
        if (texts.none { dolbyVisionTag.containsMatchIn(it) }) return StreamDolbyVisionLabel.None
        return if (texts.any { hdrFallbackTag.containsMatchIn(it) }) {
            StreamDolbyVisionLabel.WithHdrFallback
        } else {
            StreamDolbyVisionLabel.Only
        }
    }

    /**
     * For a device without a Dolby Vision decoder: moves streams labelled Dolby Vision only to the
     * end, keeping the order otherwise. "DV | HDR10" and non-DV streams keep their place, since
     * they play as HDR10 or SDR here.
     */
    fun orderForDeviceWithoutDolbyVision(streams: List<StreamItem>): List<StreamItem> {
        if (streams.size < 2) return streams
        val (dolbyVisionOnly, playable) = streams.partition { label(it) == StreamDolbyVisionLabel.Only }
        return if (dolbyVisionOnly.isEmpty()) streams else playable + dolbyVisionOnly
    }
}
