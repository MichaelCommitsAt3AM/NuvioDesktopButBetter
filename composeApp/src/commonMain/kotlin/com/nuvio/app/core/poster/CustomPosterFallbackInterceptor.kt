package com.nuvio.app.core.poster

import coil3.intercept.Interceptor
import coil3.request.ImageResult
import coil3.request.ErrorResult

/**
 * Coil interceptor that detects failed custom poster loads and retries with the
 * original poster URL stored in [memoryCacheKeyExtras] under [FALLBACK_URL_KEY].
 */
class CustomPosterFallbackInterceptor : Interceptor {

    companion object {
        const val FALLBACK_URL_KEY = "custom_poster_fallback_url"
    }

    override suspend fun intercept(chain: Interceptor.Chain): ImageResult {
        val extras = chain.request.memoryCacheKeyExtras
        val hasFallback = extras.containsKey(FALLBACK_URL_KEY)

        val result = chain.proceed()

        if (result is ErrorResult && hasFallback) {
            val fallbackUrl = extras[FALLBACK_URL_KEY]
            if (!fallbackUrl.isNullOrBlank()) {
                val originalUrl = chain.request.data.toString()
                val fallbackRequest = chain.request.newBuilder()
                    .data(fallbackUrl)
                    .memoryCacheKeyExtras(extras - FALLBACK_URL_KEY)
                    // An explicit cache key (e.g. rememberNuvioImageRequest's "<bucket>:<url>")
                    // still names the failed URL; carried over as-is, the fallback image would be
                    // cached under it and shadow the custom poster once it becomes reachable.
                    // Re-point keys derived from the original URL at the fallback, and drop any
                    // other explicit key so Coil derives one from the fallback data.
                    .memoryCacheKey(
                        chain.request.memoryCacheKey
                            ?.takeIf { it.endsWith(originalUrl) }
                            ?.let { it.removeSuffix(originalUrl) + fallbackUrl },
                    )
                    .diskCacheKey(
                        chain.request.diskCacheKey
                            ?.takeIf { it == originalUrl }
                            ?.let { fallbackUrl },
                    )
                    .build()
                return chain.withRequest(fallbackRequest).proceed()
            }
        }

        return result
    }
}
