package com.nuvio.desktop.bridge

/** Mirrors MainAppContent's account/profile and foreground sync triggers. */
internal class BridgeSyncLifecycle(
    private val startWatchSource: () -> Unit,
    private val pullProfile: (Int) -> Unit,
    private val startPeriodic: (Int) -> Unit,
    private val pullForeground: (Int) -> Unit,
    private val stopPeriodic: () -> Unit,
) {
    private var active: Pair<String, Int>? = null

    @Synchronized
    fun update(userId: String?, profileId: Int?, visible: Boolean) {
        val next = if (userId != null && profileId != null) userId to profileId else null
        if (next != active) {
            stopPeriodic()
            active = next
            if (next != null) {
                startWatchSource()
                pullProfile(next.second)
            }
        }
        if (next != null && visible) {
            startPeriodic(next.second)
            pullForeground(next.second)
        } else {
            stopPeriodic()
        }
    }

    @Synchronized
    fun stop() {
        active = null
        stopPeriodic()
    }
}
