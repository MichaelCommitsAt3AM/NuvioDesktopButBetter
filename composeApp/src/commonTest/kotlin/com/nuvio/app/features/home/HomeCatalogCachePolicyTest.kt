package com.nuvio.app.features.home

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class HomeCatalogCachePolicyTest {
    @Test
    fun cachedCatalogIsFreshUntilTheTtlBoundary() {
        assertTrue(isHomeCatalogCacheFresh(fetchedAt = 1_000L, now = 1_000L))
        assertTrue(
            isHomeCatalogCacheFresh(
                fetchedAt = 1_000L,
                now = 1_000L + HOME_CATALOG_CACHE_TTL_MS - 1,
            ),
        )
        assertFalse(
            isHomeCatalogCacheFresh(
                fetchedAt = 1_000L,
                now = 1_000L + HOME_CATALOG_CACHE_TTL_MS,
            ),
        )
    }

    @Test
    fun missingTimestampOrClockMovingBackwardsIsStale() {
        assertFalse(isHomeCatalogCacheFresh(fetchedAt = null, now = 1_000L))
        assertFalse(isHomeCatalogCacheFresh(fetchedAt = 2_000L, now = 1_000L))
    }
}
