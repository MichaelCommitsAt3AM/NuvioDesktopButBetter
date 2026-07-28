package com.nuvio.app.core.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import coil3.compose.LocalPlatformContext
import coil3.request.ImageRequest
import coil3.request.crossfade

/**
 * Identifies the role a URL is being rendered in, independent of the URL itself.
 *
 * Coil's default memory cache key is just the mapped URL — it only folds in the resolved size
 * when the request has transformations, which these don't. Without a bucket, the same poster URL
 * used at shelf-card size and at hero-backdrop size collide on one cache entry: whichever one
 * decoded most recently evicts the other, so both keep re-decoding instead of settling into the
 * cache. See [rememberNuvioImageRequest].
 */
enum class NuvioImageCacheBucket(internal val id: String) {
    ShelfPoster("shelf_poster"),
    ShelfLandscape("shelf_landscape"),
    ShelfLogo("shelf_logo"),
    HeroBackdrop("hero_backdrop"),
    HeroLogo("hero_logo"),
    CollectionPoster("collection_poster"),
}

/**
 * Builds an [ImageRequest] with a size/role-scoped memory cache key so this [bucket] can't evict
 * (or be evicted by) another bucket rendering the same underlying [model] URL — see
 * [NuvioImageCacheBucket]. The disk cache key stays the raw URL: the encoded bytes on disk are
 * identical regardless of which bucket requested them, so there's nothing to scope there.
 *
 * [crossfadeMillis] is left unset (`null`) by default, which inherits the loader's default
 * crossfade. Pass `0` to disable it for this request — worthwhile on dense shelves, where many
 * posters finishing at once means many simultaneous crossfade animations competing for the same
 * frame budget that's already tight during a catalog load.
 */
@Composable
fun rememberNuvioImageRequest(
    model: String?,
    bucket: NuvioImageCacheBucket,
    crossfadeMillis: Int? = null,
): ImageRequest? {
    val context = LocalPlatformContext.current
    return remember(context, model, bucket, crossfadeMillis) {
        model?.let { url ->
            ImageRequest.Builder(context)
                .data(url)
                .memoryCacheKey("${bucket.id}:$url")
                .diskCacheKey(url)
                .apply { if (crossfadeMillis != null) crossfade(crossfadeMillis) }
                .build()
        }
    }
}
