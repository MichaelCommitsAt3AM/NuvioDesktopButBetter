package com.nuvio.app.features.datasaver

import com.nuvio.app.features.downloads.DataUsePreset
import com.nuvio.app.features.downloads.DownloadFilterConfig
import com.nuvio.app.features.downloads.FilterConfigStore
import com.nuvio.app.features.downloads.StreamResolutionTier
import kotlin.test.Test
import kotlin.test.assertEquals

class DataUsePresetTest {

    private val balanced = DataSaverPlaybackConfig().withDataUse(DataUsePreset.BALANCED)

    @Test
    fun `Data Saver defaults to Low at 1080p and the download filter to Balanced`() {
        val defaults = DataSaverPlaybackConfig()
        assertEquals(DataUsePreset.LOW, defaults.dataUsePreset())
        assertEquals(defaults.withDataUse(DataUsePreset.LOW), defaults)
        assertEquals(StreamResolutionTier.FHD_1080, DataSaverSettingsRepository.defaults.maxResolution)
        assertEquals(DataUsePreset.BALANCED, DownloadFilterConfig().dataUsePreset())
    }

    @Test
    fun `a level scales every resolution and is recognised again`() {
        val low = DataSaverPlaybackConfig().withDataUse(DataUsePreset.LOW)
        assertEquals(4_000, low.targetFor(StreamResolutionTier.FHD_1080))
        assertEquals(2_000, low.targetFor(StreamResolutionTier.HD_720))
        assertEquals(DataUsePreset.LOW, low.dataUsePreset())

        val high = DownloadFilterConfig().withDataUse(DataUsePreset.HIGH)
        assertEquals(8_400, high.tierBitrateKbps(StreamResolutionTier.FHD_1080))
        assertEquals(DataUsePreset.HIGH, high.dataUsePreset())
    }

    @Test
    fun `values that match no level show as Custom`() {
        val edited = DataSaverPlaybackConfig().withTarget(StreamResolutionTier.HD_720, 4_000)
        assertEquals(DataUsePreset.CUSTOM, edited.dataUsePreset())
        // An older saved download filter with a different 1080p limit.
        assertEquals(DataUsePreset.CUSTOM, DownloadFilterConfig(maxBitrateKbps = 8_000).dataUsePreset())
    }

    @Test
    fun `the 480p fallback value has no setting so it never makes a level Custom`() {
        val config = balanced.withTarget(StreamResolutionTier.SD, 4_000)
        assertEquals(DataUsePreset.BALANCED, config.dataUsePreset())
    }

    @Test
    fun `a saved 480p maximum moves up to 720p`() {
        val store = FilterConfigStore(
            defaults = DownloadFilterConfig.DEFAULT,
            minMaxSizeBytes = DownloadFilterConfig.MIN_MAX_SIZE_BYTES,
            load = { """{"maxResolution":"SD"}""" },
            save = {},
        )
        assertEquals(StreamResolutionTier.HD_720, store.snapshot().maxResolution)
    }

    @Test
    fun `Custom starts from the Balanced values on both pages`() {
        for (level in DataUsePreset.levels) {
            val targets = DataSaverPlaybackConfig().withDataUse(level).withDataUse(DataUsePreset.CUSTOM)
            assertEquals(6_000, targets.targetFor(StreamResolutionTier.FHD_1080))
            assertEquals(3_000, targets.targetFor(StreamResolutionTier.HD_720))
            assertEquals(DataUsePreset.CUSTOM, targets.dataUsePreset())

            val limits = DownloadFilterConfig().withDataUse(level).withDataUse(DataUsePreset.CUSTOM)
            assertEquals(6_000, limits.tierBitrateKbps(StreamResolutionTier.FHD_1080))
            assertEquals(27_000, limits.tierBitrateKbps(StreamResolutionTier.UHD_4K))
            assertEquals(DataUsePreset.CUSTOM, limits.dataUsePreset())
        }
    }

    @Test
    fun `choosing Custom again keeps the edited values`() {
        val targets = DataSaverPlaybackConfig().withTarget(StreamResolutionTier.HD_720, 4_000)
        assertEquals(4_000, targets.withDataUse(DataUsePreset.CUSTOM).targetFor(StreamResolutionTier.HD_720))

        val limits = DownloadFilterConfig(maxBitrateKbps = 8_000)
        assertEquals(8_000, limits.withDataUse(DataUsePreset.CUSTOM).tierBitrateKbps(StreamResolutionTier.FHD_1080))
    }

    @Test
    fun `the Data Saver list hides files well over their target`() {
        val rules = balanced.listFilter(DownloadFilterConfig(bitrateLimitEnabled = false))
        assertEquals(true, rules.bitrateLimitEnabled)
        assertEquals(9_000, rules.tierBitrateKbps(StreamResolutionTier.FHD_1080))
        assertEquals(4_500, rules.tierBitrateKbps(StreamResolutionTier.HD_720))
    }
}
