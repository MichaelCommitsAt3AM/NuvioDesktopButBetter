package com.nuvio.app.features.downloads

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class PlaceholderDownloadTest {
    private val mb = 1024L * 1024

    @Test fun aTinyClipForAnAdvertisedMovieIsAPlaceholder() {
        assertTrue(isPlaceholderDownload(finishedBytes = 18_408, expectedBytes = 3_113_851_290))
    }

    @Test fun realFilesAndUnknownSizesAreKept() {
        assertFalse(isPlaceholderDownload(finishedBytes = 3_000 * mb, expectedBytes = 3_113_851_290))
        assertFalse(isPlaceholderDownload(finishedBytes = 18_408, expectedBytes = null))
        // Small advertised files (samples, extras) are never second-guessed.
        assertFalse(isPlaceholderDownload(finishedBytes = 2 * mb, expectedBytes = 50 * mb))
        // A re-encode can be smaller than advertised; only a near-empty result counts.
        assertFalse(isPlaceholderDownload(finishedBytes = 400 * mb, expectedBytes = 3_000 * mb))
    }
}
