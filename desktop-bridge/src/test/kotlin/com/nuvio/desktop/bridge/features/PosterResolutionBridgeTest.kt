package com.nuvio.desktop.bridge.features

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class PosterResolutionBridgeTest {
    @Test fun namespacedIdsFillTheUpstreamPosterTokens() {
        assertEquals("https://posters.test/tt123/poster", AppearanceBridge.resolvePosterPattern("https://posters.test/{imdb_id}/{shape}", "tt123", "movie", "poster"))
        assertEquals("https://posters.test/456", AppearanceBridge.resolvePosterPattern("https://posters.test/{tmdb_id}", "tmdb:456", "series", "poster"))
    }

    @Test fun explicitImdbIdIsAvailableForLibraryItems() {
        assertEquals("https://posters.test/tt123", AppearanceBridge.resolvePosterPattern("https://posters.test/{imdb_id}", "custom:456", "movie", "poster", "tt123"))
    }

    @Test fun portraitOnlyPatternsDoNotOverrideLandscapeArtwork() {
        assertNull(AppearanceBridge.resolvePosterPattern("https://posters.test/{imdb_id}", "tt123", "movie", "landscape"))
    }
}
