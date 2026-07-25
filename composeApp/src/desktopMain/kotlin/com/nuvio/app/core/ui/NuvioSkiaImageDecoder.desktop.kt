package com.nuvio.app.core.ui

import coil3.ImageLoader
import coil3.annotation.ExperimentalCoilApi
import coil3.asImage
import coil3.decode.DecodeResult
import coil3.decode.DecodeUtils
import coil3.decode.Decoder
import coil3.decode.ImageSource
import coil3.fetch.SourceFetchResult
import coil3.request.Options
import coil3.request.maxBitmapSize
import coil3.size.Precision
import okio.use
import org.jetbrains.skia.Bitmap
import org.jetbrains.skia.FilterMipmap
import org.jetbrains.skia.FilterMode
import org.jetbrains.skia.Image as SkiaImage
import org.jetbrains.skia.MipmapMode
import org.jetbrains.skia.SamplingMode

/**
 * Drop-in replacement for Coil's `SkiaImageDecoder` that downscales with mipmapped linear
 * filtering instead of [SamplingMode.DEFAULT], which is nearest-neighbour.
 *
 * That filtering is the only reason posters used to be decoded at up to 1536px and re-scaled
 * by a custom painter at draw time: Coil's own downscale was too crude to use directly, so the
 * source resolution had to be preserved all the way to the draw call. Doing the good downscale
 * here instead means one bitmap per image, sized to the card it will be drawn into — roughly
 * a 20x cut in decode output, GPU texture upload, and memory cache pressure — and it also
 * upgrades quality on the screens that were passing through Coil's nearest-neighbour path.
 */
internal class NuvioSkiaImageDecoder(
    private val source: ImageSource,
    private val options: Options,
) : Decoder {

    @OptIn(ExperimentalCoilApi::class)
    override suspend fun decode(): DecodeResult {
        // Skia needs the whole encoded image up front: https://github.com/JetBrains/skiko/issues/741
        val bytes = source.source().use { it.readByteArray() }
        val image = SkiaImage.makeFromEncoded(bytes)
        try {
            val srcWidth = image.width
            val srcHeight = image.height
            val dstSize = DecodeUtils.computeDstSize(
                srcWidth = srcWidth,
                srcHeight = srcHeight,
                targetSize = options.size,
                scale = options.scale,
                maxSize = options.maxBitmapSize,
            )
            var multiplier = DecodeUtils.computeSizeMultiplier(
                srcWidth = srcWidth,
                srcHeight = srcHeight,
                dstWidth = dstSize.first,
                dstHeight = dstSize.second,
                scale = options.scale,
                maxSize = options.maxBitmapSize,
            )
            // Only upscale the image if the options require an exact size.
            if (options.precision == Precision.INEXACT) {
                multiplier = multiplier.coerceAtMost(1.0)
            }

            val outWidth = (multiplier * srcWidth).toInt().coerceAtLeast(1)
            val outHeight = (multiplier * srcHeight).toInt().coerceAtLeast(1)
            val isSampled = outWidth < srcWidth || outHeight < srcHeight

            val bitmap = Bitmap()
            bitmap.allocN32Pixels(outWidth, outHeight)
            image.scalePixels(
                bitmap.peekPixels()!!,
                // Mipmaps only pay for themselves when there is something to downscale.
                if (isSampled) DownscaleSampling else CopySampling,
                false,
            )
            bitmap.setImmutable()

            return DecodeResult(
                image = bitmap.asImage(),
                isSampled = isSampled,
            )
        } finally {
            image.close()
        }
    }

    class Factory : Decoder.Factory {
        override fun create(
            result: SourceFetchResult,
            options: Options,
            imageLoader: ImageLoader,
        ): Decoder = NuvioSkiaImageDecoder(result.source, options)
    }

    private companion object {
        val DownscaleSampling = FilterMipmap(FilterMode.LINEAR, MipmapMode.LINEAR)
        val CopySampling = FilterMipmap(FilterMode.LINEAR, MipmapMode.NONE)
    }
}
