package com.nuvio.app.core.storage

import com.nuvio.app.features.debrid.DebridSettingsRepository
import com.nuvio.app.features.mdblist.MdbListSettingsRepository
import com.nuvio.app.features.player.PlayerSettingsRepository
import com.nuvio.app.features.profiles.ProfileRepository
import com.nuvio.app.features.tmdb.TmdbSettingsRepository
import kotlin.test.Test
import kotlin.test.assertEquals

class DesktopIntegrationPreferencesTest {
    @Test fun twoConfiguredTmdbProfilesKeepDifferentKeysAndModuleChoicesWithDurablePendingEdits() {
        val active = ProfileRepository::class.java.getDeclaredField("activeProfileIndex").apply { isAccessible = true }
        val previous = active.getInt(null)
        val store = DesktopStorage.store("nuvio_tmdb_settings")
        try {
            for (profile in listOf(903, 904)) {
                active.setInt(null, profile)
                TmdbSettingsRepository.onProfileChanged()
                TmdbSettingsRepository.setApiKey("profile-$profile-key")
                TmdbSettingsRepository.setEnabled(true)
                TmdbSettingsRepository.setUseArtwork(profile == 903)
                TmdbSettingsRepository.setUseCredits(profile == 904)
            }
            repeat(3) {
                for (profile in listOf(903, 904)) {
                    store.clearInMemory()
                    active.setInt(null, profile)
                    TmdbSettingsRepository.onProfileChanged()
                    val settings = TmdbSettingsRepository.snapshot()
                    assertEquals(true, settings.enabled)
                    assertEquals("profile-$profile-key", settings.apiKey)
                    assertEquals(profile == 903, settings.useArtwork)
                    assertEquals(profile == 904, settings.useCredits)
                    kotlin.test.assertNotNull(store.getString(ProfileScopedKey.of("tmdb_pending_preferences", profile)))
                }
            }
        } finally {
            listOf(903, 904).forEach { store.removeProfileKeys("_$it") }
            active.setInt(null, previous)
            TmdbSettingsRepository.onProfileChanged()
        }
    }

    @Test fun configuredAndUnconfiguredProfilesKeepTheirKeysAndEnablementAfterReload() {
        // Isolated, non-user profile indices avoid selecting profiles or starting network work.
        val active = ProfileRepository::class.java.getDeclaredField("activeProfileIndex").apply { isAccessible = true }
        val previous = active.getInt(null)
        val stores = listOf("nuvio_tmdb_settings", "nuvio_mdblist_settings", "nuvio_debrid_settings", "nuvio_player_settings")
        fun load() {
            TmdbSettingsRepository.onProfileChanged()
            MdbListSettingsRepository.onProfileChanged()
            DebridSettingsRepository.onProfileChanged()
            PlayerSettingsRepository.onProfileChanged()
        }
        try {
            active.setInt(null, 901)
            load()
            TmdbSettingsRepository.setApiKey("tmdb-test")
            TmdbSettingsRepository.setEnabled(true)
            TmdbSettingsRepository.setUseCredits(false)
            MdbListSettingsRepository.setApiKey("mdb-test")
            MdbListSettingsRepository.setEnabled(true)
            MdbListSettingsRepository.setShowOnHero(true)
            DebridSettingsRepository.setTorboxApiKey("torbox-test")
            DebridSettingsRepository.setEnabled(true)
            PlayerSettingsRepository.setAnimeSkipClientId("anime-test")
            PlayerSettingsRepository.setAnimeSkipEnabled(true)
            PlayerSettingsRepository.setIntroDbApiKey("intro-test")
            PlayerSettingsRepository.setIntroSubmitEnabled(true)
            PlayerSettingsRepository.setSkipIntroEnabled(true)

            repeat(3) {
                active.setInt(null, 902)
                // Callers can request snapshots before the explicit reload hooks run.
                assertEquals(false, TmdbSettingsRepository.snapshot().enabled)
                assertEquals("", TmdbSettingsRepository.snapshot().apiKey)
                assertEquals(false, MdbListSettingsRepository.snapshot().enabled)
                assertEquals("", MdbListSettingsRepository.snapshot().apiKey)
                assertEquals(false, DebridSettingsRepository.snapshot().enabled)
                PlayerSettingsRepository.ensureLoaded()
                assertEquals(false, PlayerSettingsRepository.uiState.value.animeSkipEnabled)
                assertEquals("", PlayerSettingsRepository.uiState.value.introDbApiKey)

                // Fresh disk readers model a new app process using the same data directory.
                stores.forEach { DesktopStorage.store(it).clearInMemory() }
                active.setInt(null, 901)
                load()
                assertEquals(true, TmdbSettingsRepository.snapshot().enabled)
                assertEquals("tmdb-test", TmdbSettingsRepository.snapshot().apiKey)
                assertEquals(false, TmdbSettingsRepository.snapshot().useCredits)
                assertEquals(true, MdbListSettingsRepository.snapshot().enabled)
                assertEquals("mdb-test", MdbListSettingsRepository.snapshot().apiKey)
                assertEquals(true, MdbListSettingsRepository.snapshot().showOnHero)
                assertEquals(true, DebridSettingsRepository.snapshot().enabled)
                assertEquals("torbox-test", DebridSettingsRepository.snapshot().torboxApiKey)
                assertEquals(true, PlayerSettingsRepository.uiState.value.animeSkipEnabled)
                assertEquals("anime-test", PlayerSettingsRepository.uiState.value.animeSkipClientId)
                assertEquals(true, PlayerSettingsRepository.uiState.value.introSubmitEnabled)
                assertEquals("intro-test", PlayerSettingsRepository.uiState.value.introDbApiKey)
                assertEquals(true, PlayerSettingsRepository.uiState.value.skipIntroEnabled)
            }
        } finally {
            stores.forEach { name -> listOf(901, 902).forEach { DesktopStorage.store(name).removeProfileKeys("_$it") } }
            active.setInt(null, previous)
            load()
        }
    }
}
