package com.nuvio.app.features.streams

import android.os.Build
import androidx.annotation.OptIn
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.MetadataRetriever
import androidx.media3.exoplayer.mediacodec.MediaCodecUtil
import androidx.media3.exoplayer.source.ProgressiveMediaSource
import com.nuvio.app.features.player.isUnsupportedDolbyVision
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

private const val PROBE_TIMEOUT_SECONDS = 20L

@OptIn(UnstableApi::class)
private val deviceDecodesDolbyVision: Boolean by lazy {
    // Host tests (stubbed or Robolectric framework) report no codecs; treat them as capable so
    // stream ordering stays unchanged there.
    if (Build.VERSION.SDK_INT == 0 || Build.FINGERPRINT == "robolectric") return@lazy true
    runCatching {
        MediaCodecUtil.getDecoderInfos(MimeTypes.VIDEO_DOLBY_VISION, false, false).isNotEmpty()
    }.getOrDefault(true)
}

internal actual fun platformDecodesDolbyVision(): Boolean = deviceDecodesDolbyVision

@OptIn(UnstableApi::class)
internal actual suspend fun probeDolbyVisionSupport(url: String, headers: Map<String, String>): DolbyVisionProbeResult {
    if (platformDecodesDolbyVision()) return DolbyVisionProbeResult.Supported
    return withContext(Dispatchers.IO) {
        val dataSourceFactory = DefaultHttpDataSource.Factory()
            .setAllowCrossProtocolRedirects(true)
            .setDefaultRequestProperties(headers)
        // Prepares the source only far enough to read its tracks: the file header, not the video.
        val future = MetadataRetriever.retrieveMetadata(
            ProgressiveMediaSource.Factory(dataSourceFactory),
            MediaItem.fromUri(url),
        )
        val tracks = try {
            future.get(PROBE_TIMEOUT_SECONDS, TimeUnit.SECONDS)
        } catch (_: Exception) {
            future.cancel(true)
            return@withContext DolbyVisionProbeResult.Unknown
        }
        val videoFormats = (0 until tracks.length)
            .map(tracks::get)
            .filter { it.type == C.TRACK_TYPE_VIDEO }
            .flatMap { group -> (0 until group.length).map(group::getFormat) }
        when {
            videoFormats.isEmpty() -> DolbyVisionProbeResult.Unknown
            videoFormats.all { it.isUnsupportedDolbyVision() } -> DolbyVisionProbeResult.Unsupported
            else -> DolbyVisionProbeResult.Supported
        }
    }
}
