package com.nuvio.desktop.bridge.features

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.*
import kotlin.test.*

class ProgressiveHomeVisibilityTest {
    private val data = buildJsonObject {
        put("loading", false)
        put("hero", JsonArray((1..40).map { buildJsonObject { put("id", "tt$it"); put("type", "movie"); put("poster", JsonNull) } }))
    }
    @Test fun verifiedFirstTitlesAppearBeforeTheRestFinishAndUncheckedTitlesStayHidden() = runTest {
        val laterStarted = CompletableDeferred<Unit>()
        val finishLater = CompletableDeferred<Unit>()
        val published = mutableListOf<JsonObject>()
        var calls = 0
        val job = launch {
            progressiveHomeVisibility(data, emptySet(), { refs ->
                calls++
                if (calls == 2) { laterStarted.complete(Unit); finishLater.await() }
                refs.filter { it.id != "tt3" }.toSet()
            }, { true }, { published += it })
        }
        laterStarted.await()
        assertEquals(23, published.last()["hero"]!!.jsonArray.size)
        assertTrue(published.last()["loading"]!!.jsonPrimitive.boolean)
        assertFalse(published.last().toString().contains("tt25"))
        assertFalse(published.last().toString().contains("tt3\""))
        finishLater.complete(Unit)
        job.join()
        assertEquals(39, published.last()["hero"]!!.jsonArray.size)
        assertFalse(published.last()["loading"]!!.jsonPrimitive.boolean)
    }
    @Test fun aSupersededProfileOrSnapshotStopsBeforeCheckingAnotherBatch() = runTest {
        var current = true
        var checks = 0
        progressiveHomeVisibility(data, emptySet(), { checks++; it }, { current }, { safe ->
            if (safe["hero"]!!.jsonArray.isNotEmpty()) current = false
        })
        assertEquals(1, checks)
    }
}
