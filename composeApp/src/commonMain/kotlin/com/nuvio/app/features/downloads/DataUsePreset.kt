package com.nuvio.app.features.downloads

import kotlinx.serialization.Serializable

/**
 * A one-tap level for every resolution's bitrate at once, used by Data Saver's targets and the
 * download filter's limits. Low, Balanced and High scale a page's default bitrates by
 * [multiplier]; Custom keeps whatever the user set per resolution.
 */
@Serializable
enum class DataUsePreset(val multiplier: Double) {
    LOW(0.67),
    BALANCED(1.0),
    HIGH(1.4),
    CUSTOM(1.0),
    ;

    /** [balancedKbps] scaled to this level, rounded to 100 kbps. */
    fun scale(balancedKbps: Int): Int = ((balancedKbps * multiplier) / 100.0).let { kotlin.math.round(it).toInt() * 100 }

    companion object {
        val levels: List<DataUsePreset> = listOf(LOW, BALANCED, HIGH)
    }
}

/** The resolutions every data use level sets a bitrate for, highest first. */
internal val presetTiers: List<StreamResolutionTier> = listOf(
    StreamResolutionTier.UHD_4K,
    StreamResolutionTier.FHD_1080,
    StreamResolutionTier.HD_720,
    StreamResolutionTier.SD,
)

/** The resolutions offered in settings. SD files are still a playback fallback, with no setting of their own. */
internal val settingTiers: List<StreamResolutionTier> = presetTiers - StreamResolutionTier.SD

/**
 * Which preset [values] match: [stored] when its bitrates are exactly what is set, otherwise
 * whichever level they match, otherwise Custom. A stored Custom stays Custom.
 */
internal fun effectivePreset(
    stored: DataUsePreset,
    values: (StreamResolutionTier) -> Int,
    balanced: (StreamResolutionTier) -> Int,
): DataUsePreset {
    if (stored == DataUsePreset.CUSTOM) return DataUsePreset.CUSTOM
    fun matches(preset: DataUsePreset) = settingTiers.all { values(it) == preset.scale(balanced(it)) }
    if (matches(stored)) return stored
    return DataUsePreset.levels.firstOrNull(::matches) ?: DataUsePreset.CUSTOM
}
