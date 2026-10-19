package com.nuvio.app.core.storage

import java.nio.file.Files
import java.nio.file.attribute.FileTime
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals

class DesktopStorageTest {
    @Test
    fun unchanged_operations_do_not_rewrite_the_store() {
        val directory = Files.createTempDirectory("desktop-storage-test")
        val file = directory.resolve("preferences.properties")
        try {
            val store = DesktopStorage.Store(file)
            store.putString("key", "value")
            val sentinel = FileTime.fromMillis(1_000L)
            Files.setLastModifiedTime(file, sentinel)

            store.putString("key", "value")
            store.remove("missing")
            store.removeAll(listOf("also-missing"))

            assertEquals(sentinel, Files.getLastModifiedTime(file))

            store.putString("key", "updated")

            assertNotEquals(sentinel, Files.getLastModifiedTime(file))
        } finally {
            Files.deleteIfExists(file)
            Files.deleteIfExists(directory)
        }
    }

    @Test fun deletingAProfileDoesNotClearAnotherProfileOrAccountSettings() {
        val directory = Files.createTempDirectory("desktop-profile-removal")
        val file = directory.resolve("preferences.properties")
        try {
            val store = DesktopStorage.Store(file)
            store.putStrings(mapOf("token_2" to "removed", "token_12" to "kept", "token_1" to "kept", "account" to "kept"))
            store.removeProfileKeys("_2")
            val restarted = DesktopStorage.Store(file)
            assertEquals(null, restarted.getString("token_2"))
            assertEquals("kept", restarted.getString("token_12"))
            assertEquals("kept", restarted.getString("token_1"))
            assertEquals("kept", restarted.getString("account"))
        } finally { Files.deleteIfExists(file); Files.deleteIfExists(directory) }
    }
}
