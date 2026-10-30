package com.nuvio.app.core.storage

import java.nio.file.Files
import java.nio.file.attribute.FileTime
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlin.test.assertFailsWith

class DesktopStorageTest {
    @Test fun settingsReplacementNeverExposesTheClearedIntermediateFileAndRollsBackFailures() {
        val directory = Files.createTempDirectory("desktop-settings-transaction")
        val file = directory.resolve("preferences.properties")
        try {
            val store = DesktopStorage.Store(file)
            store.putStrings(mapOf("enabled_1" to "true", "api_key_1" to "saved"))
            store.update {
                store.removeAll(listOf("enabled_1", "api_key_1"))
                assertEquals("saved", DesktopStorage.Store(file).getString("api_key_1"))
                store.putStrings(mapOf("enabled_1" to "false", "api_key_1" to "saved"))
            }
            assertEquals(false, DesktopStorage.Store(file).getBoolean("enabled_1"))
            assertFailsWith<IllegalStateException> {
                store.update { store.remove("api_key_1"); error("Interrupted replacement") }
            }
            assertEquals("saved", store.getString("api_key_1"))
            assertEquals("saved", DesktopStorage.Store(file).getString("api_key_1"))
        } finally { Files.deleteIfExists(file); Files.deleteIfExists(directory) }
    }

    @Test fun integrationKeysAndSwitchesSurviveProfileRoundTripsAndFreshAppInstances() {
        val directory = Files.createTempDirectory("desktop-integration-upgrade")
        val file = directory.resolve("preferences.properties")
        try {
            val credentials = listOf("tmdb_api_key", "mdblist_api_key", "debrid_torbox_api_key", "debrid_premiumize_api_key", "debrid_real_debrid_api_key", "animeskip_client_id", "introdb_api_key")
            val switches = listOf("tmdb_enabled", "tmdb_use_credits", "mdblist_enabled", "mdblist_use_tomatoes", "debrid_enabled", "debrid_cloud_library_enabled", "animeskip_enabled", "skip_intro_enabled")
            val firstVersion = DesktopStorage.Store(file)
            credentials.forEach { key -> firstVersion.putString(ProfileScopedKey.of(key, 1), "profile-1-$key") }
            switches.forEach { key -> firstVersion.putBoolean(ProfileScopedKey.of(key, 1), true) }
            // Profile 2 deliberately has no keys and explicitly disabled switches.
            switches.forEach { key -> firstVersion.putBoolean(ProfileScopedKey.of(key, 2), false) }
            repeat(3) {
                val nextAppInstance = DesktopStorage.Store(file)
                credentials.forEach { key ->
                    assertEquals("profile-1-$key", nextAppInstance.getString(ProfileScopedKey.of(key, 1)))
                    assertEquals(null, nextAppInstance.getString(ProfileScopedKey.of(key, 2)))
                }
                switches.forEach { key ->
                    assertEquals(true, nextAppInstance.getBoolean(ProfileScopedKey.of(key, 1)))
                    assertEquals(false, nextAppInstance.getBoolean(ProfileScopedKey.of(key, 2)))
                }
                nextAppInstance.putString("new_option_from_updated_app", "version-$it")
            }
            Files.list(directory).use { assertEquals(listOf(file), it.toList()) }
        } finally { Files.deleteIfExists(file); Files.deleteIfExists(directory) }
    }

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
