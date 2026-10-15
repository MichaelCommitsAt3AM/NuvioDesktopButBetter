package com.nuvio.desktop.bridge

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

internal data class OfflinePlaybackSyncContext(
    val online: Boolean,
    val accountId: String?,
    val profileIds: List<Int>,
)

/** Retry saved changes at reconnection/startup and retain failures for later attempts. */
internal fun CoroutineScope.startOfflinePlaybackSync(
    contexts: Flow<OfflinePlaybackSyncContext>,
    pushProgress: suspend (Int, String) -> Unit,
    pushWatched: suspend (Int, String) -> Unit,
    retryDelayMs: Long = 30_000,
    onFailure: (Throwable) -> Unit = {},
) = launch {
    contexts.distinctUntilChanged().collectLatest { context ->
        val accountId = context.accountId ?: return@collectLatest
        if (!context.online) return@collectLatest
        while (isActive) {
            for (profileId in context.profileIds) {
                coroutineScope {
                    for (push in listOf(pushProgress, pushWatched)) launch {
                        try {
                            push(profileId, accountId)
                        } catch (error: CancellationException) {
                            throw error
                        } catch (error: Throwable) {
                            onFailure(error)
                        }
                    }
                }
            }
            delay(retryDelayMs)
        }
    }
}
