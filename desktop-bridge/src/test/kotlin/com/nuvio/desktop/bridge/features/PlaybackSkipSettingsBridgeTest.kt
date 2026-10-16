package com.nuvio.desktop.bridge.features

import com.nuvio.app.features.player.PlayerSettingsRepository
import com.nuvio.app.features.player.skip.AutoSkipSegmentType
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse

class PlaybackSkipSettingsBridgeTest {
    private fun credential(value: String): JsonObject = buildJsonObject { put("key", "introDbApiKey"); put("value", value) }

    @Test fun changedKeysAreVerifiedAndInvalidKeysDoNotReplaceSavedCredentials() = runBlocking {
        PlayerSettingsRepository.ensureLoaded()
        val previous = PlayerSettingsRepository.uiState.value.introDbApiKey
        val changed = previous + "-test-key"
        try {
            val rejected = assertFailsWith<BridgeFeatureException> {
                PlaybackSettingsBridge.saveSkipCredential(credential(changed)) { false }
            }
            assertEquals("INVALID_API_KEY", rejected.code)
            assertEquals(previous, PlayerSettingsRepository.uiState.value.introDbApiKey)
            var verified = ""
            PlaybackSettingsBridge.saveSkipCredential(credential("  $changed  ")) { verified = it; true }
            assertEquals(changed, verified)
            assertEquals(changed, PlayerSettingsRepository.uiState.value.introDbApiKey)
        } finally { PlayerSettingsRepository.setIntroDbApiKey(previous) }
    }

    @Test fun unchangedAndClearedKeysDoNotMakeVerificationRequests() = runBlocking {
        PlayerSettingsRepository.ensureLoaded()
        val previous = PlayerSettingsRepository.uiState.value.introDbApiKey
        var verified = false
        try {
            PlaybackSettingsBridge.saveSkipCredential(credential(previous)) { verified = true; false }
            PlaybackSettingsBridge.saveSkipCredential(credential("  ")) { verified = true; false }
            assertFalse(verified)
            assertEquals("", PlayerSettingsRepository.uiState.value.introDbApiKey)
        } finally { PlayerSettingsRepository.setIntroDbApiKey(previous) }
    }

    @Test fun togglingOneAutomaticTypePreservesOtherSelectionsAndDetection() = runBlocking {
        PlayerSettingsRepository.ensureLoaded()
        val state = PlayerSettingsRepository.uiState.value
        try {
            PlayerSettingsRepository.setAutoSkipSegmentTypeEnabled(AutoSkipSegmentType.RECAP, true)
            PlaybackSettingsBridge.dispatch("playbackSettings.setAutoSkipType", buildJsonObject { put("type", "INTRO"); put("enabled", true) })
            assertEquals(true, AutoSkipSegmentType.RECAP in PlayerSettingsRepository.uiState.value.autoSkipSegmentTypes)
            assertEquals(true, AutoSkipSegmentType.INTRO in PlayerSettingsRepository.uiState.value.autoSkipSegmentTypes)
            assertEquals(state.skipIntroEnabled, PlayerSettingsRepository.uiState.value.skipIntroEnabled)
        } finally {
            AutoSkipSegmentType.entries.forEach { PlayerSettingsRepository.setAutoSkipSegmentTypeEnabled(it, it in state.autoSkipSegmentTypes) }
        }
    }
}
