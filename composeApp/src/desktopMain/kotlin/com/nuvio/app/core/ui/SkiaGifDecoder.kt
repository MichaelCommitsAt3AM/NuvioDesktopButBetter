package com.nuvio.app.core.ui

import coil3.ImageLoader
import coil3.asImage
import coil3.decode.DecodeResult
import coil3.decode.Decoder
import coil3.decode.ImageSource
import coil3.fetch.SourceFetchResult
import coil3.request.Options
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.jetbrains.skia.Bitmap
import org.jetbrains.skia.Canvas
import org.jetbrains.skia.Codec
import org.jetbrains.skia.Data
import org.jetbrains.skia.Image
import org.jetbrains.skia.ImageInfo
import org.jetbrains.skia.Rect
import org.jetbrains.skia.SamplingMode
import okio.use

private const val MAX_FRAME_DIMENSION = 512

class SkiaGifDecoder(
    private val source: ImageSource,
) : Decoder {

    override suspend fun decode(): DecodeResult? {
        val bytes = withContext(Dispatchers.IO) {
            source.source().use { okioSource ->
                okioSource.readBoundedImageBytes()
            }
        }
        if (bytes.isEmpty()) return null

        return Data.makeFromBytes(bytes).use { data ->
            Codec.makeFromData(data).use { codec ->
                val count = codec.frameCount
                if (count <= 0) return null

                val w = codec.width
                val h = codec.height
                if (w <= 0 || h <= 0) return null
                check(w <= 4096 && h <= 4096) { "GIF source dimensions exceed 4096 pixels" }

                val scale = if (w > MAX_FRAME_DIMENSION || h > MAX_FRAME_DIMENSION) {
                    minOf(MAX_FRAME_DIMENSION.toFloat() / w, MAX_FRAME_DIMENSION.toFloat() / h)
                } else 1f

                val tw = (w * scale).toInt().coerceAtLeast(1)
                val th = (h * scale).toInt().coerceAtLeast(1)
                val needsScale = tw != w || th != h

                val bitmap: Bitmap
                if (needsScale) {
                    val fullBitmap = Bitmap().apply {
                        allocPixels(ImageInfo.makeN32Premul(w, h))
                    }
                    try {
                        codec.readPixels(fullBitmap, 0)
                        bitmap = Bitmap().apply {
                            allocPixels(ImageInfo.makeN32Premul(tw, th))
                        }
                        try {
                            Image.makeFromBitmap(fullBitmap).use { skiaImg ->
                                Canvas(bitmap).use { canvas -> canvas.drawImageRect(
                                    skiaImg,
                                    Rect.makeWH(w.toFloat(), h.toFloat()),
                                    Rect.makeWH(tw.toFloat(), th.toFloat()),
                                    SamplingMode.LINEAR,
                                    null,
                                    true,
                                ) }
                            }
                        } catch (error: Throwable) {
                            bitmap.close()
                            throw error
                        }
                    } finally {
                        fullBitmap.close()
                    }
                } else {
                    bitmap = Bitmap().apply {
                        allocPixels(ImageInfo.makeN32Premul(tw, th))
                    }
                    try {
                        codec.readPixels(bitmap, 0)
                    } catch (error: Throwable) {
                        bitmap.close()
                        throw error
                    }
                }

                DecodeResult(
                    image = bitmap.asImage(),
                    isSampled = needsScale,
                )
            }
        }
    }

    class Factory : Decoder.Factory {
        override fun create(
            result: SourceFetchResult,
            options: Options,
            imageLoader: ImageLoader,
        ): Decoder? {
            val mimeType = result.mimeType
            val isGif = mimeType?.equals("image/gif", ignoreCase = true) == true ||
                result.source.fileOrNull()?.name?.endsWith(".gif", ignoreCase = true) == true
            if (!isGif) return null
            return SkiaGifDecoder(result.source)
        }
    }
}
