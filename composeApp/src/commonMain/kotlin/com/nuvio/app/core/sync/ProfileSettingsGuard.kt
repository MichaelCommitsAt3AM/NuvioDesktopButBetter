package com.nuvio.app.core.sync

import kotlinx.atomicfu.locks.SynchronizedObject
import kotlinx.atomicfu.locks.synchronized

/** Serialize local snapshots/commits with profile reloads, never network I/O. */
internal class ProfileSettingsGuard(private val profileId: () -> Int) {
    data class Token(val profileId: Int, val generation: Long)
    data class Captured<T>(val token: Token, val value: T)
    private val lock = SynchronizedObject()
    private var generation = 0L
    fun <T> withLock(block: () -> T): T = synchronized(lock, block)
    fun <T> switching(block: () -> T): T = withLock { generation++; block() }
    fun <T> capture(block: () -> T): Captured<T> = withLock { Captured(Token(profileId(), generation), block()) }
    fun runIfCurrent(token: Token, block: () -> Unit): Boolean = withLock {
        if (token != Token(profileId(), generation)) false else { block(); true }
    }
}
