package com.nuvio.app.features.home.components

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import coil3.compose.AsyncImage
import com.nuvio.app.core.ui.NuvioImageCacheBucket
import com.nuvio.app.core.ui.rememberNuvioImageRequest

@Composable
internal actual fun CollectionCardRemoteImage(
    imageUrl: String,
    staticImageUrl: String?,
    contentDescription: String,
    modifier: Modifier,
    contentScale: ContentScale,
    animateIfPossible: Boolean,
) {
    val request = rememberNuvioImageRequest(
        model = imageUrl,
        bucket = NuvioImageCacheBucket.CollectionPoster,
        crossfadeMillis = 0,
    )

    AsyncImage(
        model = request,
        contentDescription = contentDescription,
        modifier = modifier,
        contentScale = contentScale,
    )
}
