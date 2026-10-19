package com.nuvio.app.features.debrid

import com.nuvio.app.core.storage.DesktopStorage
import java.nio.file.Files
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class DesktopDebridProfileStorageTest {
    @Test fun providerKeysAndPendingSignInsSurviveRestartIndependently() {
        val directory = Files.createTempDirectory("nuvio-profile-credentials")
        val file = directory.resolve("debrid.properties")
        try {
            val store = DesktopStorage.Store(file)
            val keys = listOf("debrid_torbox_api_key", "debrid_premiumize_api_key", "debrid_real_debrid_api_key", "debrid_pending_device_authorization_torbox")
            keys.forEach { key ->
                store.putString(desktopDebridStorageKey(key, 1), "A-$key")
                store.putString(desktopDebridStorageKey(key, 2), "B-$key")
            }
            val restarted = DesktopStorage.Store(file)
            keys.forEach { key ->
                assertEquals("A-$key", restarted.getString(desktopDebridStorageKey(key, 1)))
                assertEquals("B-$key", restarted.getString(desktopDebridStorageKey(key, 2)))
                assertNull(restarted.getString(desktopDebridStorageKey(key, 3)))
                restarted.remove(desktopDebridStorageKey(key, 2))
            }
            val afterDisconnect = DesktopStorage.Store(file)
            keys.forEach { key ->
                assertEquals("A-$key", afterDisconnect.getString(desktopDebridStorageKey(key, 1)))
                assertNull(afterDisconnect.getString(desktopDebridStorageKey(key, 2)))
            }
        } finally { Files.deleteIfExists(file); Files.deleteIfExists(directory) }
    }
}
