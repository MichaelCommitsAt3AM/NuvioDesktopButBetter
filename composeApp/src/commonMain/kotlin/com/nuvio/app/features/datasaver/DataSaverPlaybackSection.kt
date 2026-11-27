package com.nuvio.app.features.datasaver

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.nuvio.app.features.downloads.BitrateCardHeading
import com.nuvio.app.features.downloads.BitrateCustomRows
import com.nuvio.app.features.downloads.BitrateScale
import com.nuvio.app.features.downloads.DataUseGrid
import com.nuvio.app.features.downloads.DataUsePreset
import com.nuvio.app.features.downloads.ResolutionSegmentedControl
import com.nuvio.app.features.downloads.StreamResolutionTier
import com.nuvio.app.features.downloads.formatKbpsAsMbps
import com.nuvio.app.features.downloads.gigabytesPerHour
import com.nuvio.app.features.downloads.oneDecimal
import com.nuvio.app.features.downloads.settingTiers
import com.nuvio.app.features.settings.SettingsGroup
import com.nuvio.app.features.settings.SettingsGroupDivider
import com.nuvio.app.features.settings.SettingsSection
import com.nuvio.app.features.settings.SettingsSwitchRow
import nuvio.composeapp.generated.resources.Res
import nuvio.composeapp.generated.resources.bitrate_custom_targets_heading
import nuvio.composeapp.generated.resources.bitrate_max_resolution_title
import nuvio.composeapp.generated.resources.bitrate_section_quality
import nuvio.composeapp.generated.resources.data_saver_enabled_desc
import nuvio.composeapp.generated.resources.data_saver_enabled_title
import nuvio.composeapp.generated.resources.data_saver_target_option
import org.jetbrains.compose.resources.stringResource

/** The resolutions Data Saver can be limited to, lowest first as on the segmented control. */
private val dataSaverResolutions = settingTiers.reversed()

/**
 * The top of the Data Saver page: the switch, then a Quality card (maximum resolution, data use
 * level, per-resolution targets under Custom, and a scale showing the top resolution's target).
 */
internal fun LazyListScope.dataSaverQualityItems(
    playback: DataSaverPlaybackConfig,
    maxResolution: StreamResolutionTier,
    isTablet: Boolean,
) {
    val tiers = settingTiers.filter { it.rank <= maxResolution.rank }
    val preset = playback.dataUsePreset()

    item(key = "data_saver_switch") {
        SettingsGroup(isTablet = isTablet) {
            SettingsSwitchRow(
                title = stringResource(Res.string.data_saver_enabled_title),
                description = stringResource(Res.string.data_saver_enabled_desc),
                checked = playback.enabled,
                isTablet = isTablet,
                onCheckedChange = DataSaverPlaybackRepository::setEnabled,
            )
        }
    }

    item(key = "data_saver_quality") {
        SettingsSection(title = stringResource(Res.string.bitrate_section_quality), isTablet = isTablet) {
            SettingsGroup(isTablet = isTablet) {
                Column(
                    modifier = Modifier.fillMaxWidth().padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    // Also the streams list's resolution limit in Data Saver mode.
                    BitrateCardHeading(stringResource(Res.string.bitrate_max_resolution_title))
                    ResolutionSegmentedControl(
                        options = dataSaverResolutions,
                        selected = maxResolution,
                        onSelect = DataSaverSettingsRepository::setMaxResolution,
                    )
                }
                SettingsGroupDivider(isTablet = isTablet)
                Column(
                    modifier = Modifier.fillMaxWidth().padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    DataUseGrid(
                        selected = preset,
                        gbPerHourFor = { level ->
                            gigabytesPerHour(level.scale(DataSaverPlaybackConfig.balancedTargetFor(maxResolution)))
                        },
                        onSelect = DataSaverPlaybackRepository::setDataUse,
                    )
                    if (preset == DataUsePreset.CUSTOM) {
                        BitrateCustomRows(
                            heading = stringResource(Res.string.bitrate_custom_targets_heading),
                            tiers = tiers,
                            valueFor = playback::targetFor,
                            onValue = DataSaverPlaybackRepository::setTargetKbps,
                            optionLabel = { kbps ->
                                stringResource(
                                    Res.string.data_saver_target_option,
                                    formatKbpsAsMbps(kbps),
                                    oneDecimal(gigabytesPerHour(kbps)),
                                )
                            },
                        )
                    }
                    BitrateScale(playback.targetFor(maxResolution))
                }
            }
        }
    }
}
