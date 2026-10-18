package com.nuvio.desktop.bridge

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** Network enrichment must never keep a bridge request/profile lock held. */
internal class BridgeBackgroundValue<T>(private val initial: T, private val scope: CoroutineScope) {
    private val lock = Any()
    private var generation = 0L
    private var job: Job? = null
    private val mutable = MutableStateFlow(initial)
    val state = mutable.asStateFlow()

    fun refresh(load: suspend () -> T) = synchronized(lock) {
        job?.cancel()
        val ticket = ++generation
        job = scope.launch {
            val result = try { load() }
            catch (cancelled: CancellationException) { throw cancelled }
            catch (_: Exception) { return@launch }
            synchronized(lock) {
                if (ticket == generation) mutable.value = result
            }
        }
    }

    fun reset() = synchronized(lock) {
        ++generation
        job?.cancel()
        job = null
        mutable.value = initial
    }
}
