package com.nuvio.app.features.player

import androidx.annotation.OptIn
import androidx.media3.common.Format
import androidx.media3.common.MimeTypes
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.mediacodec.MediaCodecUtil
import com.nuvio.app.features.streams.platformDecodesDolbyVision

private val DOLBY_VISION_CODECS_PREFIX = Regex("""(?i)^(dvhe|dvh1|dvav|dva1|dav1)\.(\d{1,2})""")

/** The Dolby Vision profile in this format's codecs string ("dvhe.05.06" is 5), or null. */
internal fun Format.dolbyVisionProfile(): Int? =
    codecs?.split(',')
        ?.firstNotNullOfOrNull { DOLBY_VISION_CODECS_PREFIX.find(it.trim()) }
        ?.groupValues?.get(2)?.toIntOrNull()

/**
 * Whether this video track is Dolby Vision that this device cannot show: it has no Dolby Vision
 * decoder, and Media3 has no base-layer codec to fall back to for the profile (it does for 4, 8,
 * 9 and 10, but not for 5 or 7). Such tracks play as a black screen with sound.
 */
@OptIn(UnstableApi::class)
internal fun Format.isUnsupportedDolbyVision(): Boolean {
    val profile = dolbyVisionProfile()
    val isDolbyVisionMime = sampleMimeType == MimeTypes.VIDEO_DOLBY_VISION
    if (!isDolbyVisionMime && profile == null) return false
    if (platformDecodesDolbyVision()) return false
    if (isDolbyVisionMime) {
        return runCatching { MediaCodecUtil.getAlternativeCodecMimeType(this) == null }.getOrDefault(false)
    }
    // Extractors that keep the HEVC MIME still decode profile 5 to wrong colours.
    return profile == 5
}
