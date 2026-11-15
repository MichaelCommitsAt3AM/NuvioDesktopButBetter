package com.nuvio.app.features.trailer

import kotlin.time.Duration.Companion.minutes
import kotlin.time.Duration.Companion.seconds
import kotlin.time.TimeSource

/**
 * Fork-only: keeps trailer extraction from hammering YouTube while someone browses many
 * titles quickly. Each extraction costs about four requests from one IP, and YouTube
 * answers bursts with bot checks that leave only a 360p stream (or nothing) behind.
 *
 * - A title that just failed is not retried for [failureTtlMs].
 * - After [strikeLimit] failed or degraded results in a row, every title is held for
 *   [cooldownMs] so a flagged IP gets a chance to cool off.
 *
 * Not thread-safe on its own: callers serialize access (the resolver uses its mutex).
 */
internal class TrailerResolveGuard(
    private val now: () -> Long = defaultClock(),
    private val failureTtlMs: Long = 3.minutes.inWholeMilliseconds,
    private val strikeLimit: Int = 3,
    private val cooldownMs: Long = 90.seconds.inWholeMilliseconds,
) {
    private val failedAt = HashMap<String, Long>()
    private var strikes = 0
    private var cooldownUntil = Long.MIN_VALUE

    /** True when extraction for [key] should be skipped right now (recent failure or cooldown). */
    fun shouldSkip(key: String): Boolean {
        val current = now()
        if (current < cooldownUntil) return true
        val failed = failedAt[key] ?: return false
        if (current - failed < failureTtlMs) return true
        failedAt.remove(key)
        return false
    }

    fun recordSuccess() {
        strikes = 0
    }

    /** Extraction produced nothing. The title is not retried for [failureTtlMs]. */
    fun recordFailure(key: String) {
        failedAt[key] = now()
        addStrike()
    }

    /**
     * Extraction only produced a low quality fallback stream. The caller caches it briefly
     * itself; this just counts toward the cooldown.
     */
    fun recordDegraded() = addStrike()

    private fun addStrike() {
        strikes += 1
        if (strikes >= strikeLimit) {
            cooldownUntil = now() + cooldownMs
            strikes = 0
        }
    }

    private companion object {
        fun defaultClock(): () -> Long {
            val origin = TimeSource.Monotonic.markNow()
            return { origin.elapsedNow().inWholeMilliseconds }
        }
    }
}
