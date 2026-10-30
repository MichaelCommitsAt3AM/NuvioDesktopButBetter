package com.nuvio.app.core.sync

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlin.test.Test
import kotlin.test.assertEquals

class ProfileSettingsUploadTest {
    @Test fun switchingProfilesDuringPlatformUploadCannotDisableTheOriginalProfile() = runTest {
        val requestStarted = CompletableDeferred<Unit>()
        val completeRequest = CompletableDeferred<Unit>()
        var activeProfile = 1
        val enabledByProfile = mapOf(1 to true, 2 to false)
        val published = mutableListOf<Pair<Int, JsonObject>>()
        val job = launch {
            uploadProfileSettingsSnapshot(
                profileId = activeProfile,
                settings = "profile-1-settings",
                captureTmdb = { buildJsonObject { put("tmdb_enabled", encodeSyncBoolean(enabledByProfile.getValue(activeProfile))) } },
                pushSettings = { profile, settings ->
                    assertEquals(1, profile)
                    assertEquals("profile-1-settings", settings)
                    requestStarted.complete(Unit)
                    completeRequest.await()
                },
                pushTmdb = { profile, settings -> published.add(profile to settings) },
            )
        }
        requestStarted.await()
        activeProfile = 2
        completeRequest.complete(Unit)
        job.join()
        assertEquals(1, published.single().first)
        assertEquals(true, published.single().second.decodeSyncBoolean("tmdb_enabled"))
    }
}
