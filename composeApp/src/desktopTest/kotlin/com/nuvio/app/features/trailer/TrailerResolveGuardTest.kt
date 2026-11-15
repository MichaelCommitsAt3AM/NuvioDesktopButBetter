package com.nuvio.app.features.trailer

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class TrailerResolveGuardTest {
    private var clock = 0L
    private fun guard() = TrailerResolveGuard(
        now = { clock },
        failureTtlMs = 1_000,
        strikeLimit = 3,
        cooldownMs = 10_000,
    )

    @Test
    fun `a failed title is skipped until its failure memory expires`() {
        val guard = guard()
        assertFalse(guard.shouldSkip("a"))
        guard.recordFailure("a")
        assertTrue(guard.shouldSkip("a"))
        assertFalse(guard.shouldSkip("b"))
        clock = 1_000
        assertFalse(guard.shouldSkip("a"))
    }

    @Test
    fun `consecutive failures trigger a cooldown for every title`() {
        val guard = guard()
        guard.recordFailure("a")
        guard.recordDegraded()
        assertFalse(guard.shouldSkip("fresh"))
        guard.recordFailure("b")
        assertTrue(guard.shouldSkip("fresh"))
        clock = 9_999
        assertTrue(guard.shouldSkip("fresh"))
        clock = 10_000
        assertFalse(guard.shouldSkip("fresh"))
    }

    @Test
    fun `a success resets the strike count`() {
        val guard = guard()
        guard.recordFailure("a")
        guard.recordFailure("b")
        guard.recordSuccess()
        guard.recordFailure("c")
        assertFalse(guard.shouldSkip("fresh"))
    }

    @Test
    fun `only combined streams without separate audio count as degraded`() {
        assertTrue(TrailerPlaybackSource(videoUrl = "https://v/360.mp4").isDegradedWebSource())
        assertEquals(false, TrailerPlaybackSource(videoUrl = "https://v/1080.mp4", audioUrl = "https://v/a.m4a").isDegradedWebSource())
    }
}
