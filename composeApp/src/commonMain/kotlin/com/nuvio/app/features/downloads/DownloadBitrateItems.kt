package com.nuvio.app.features.downloads

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.nuvio.app.features.settings.SettingsGroup
import com.nuvio.app.features.settings.SettingsGroupDivider
import com.nuvio.app.features.settings.SettingsSection
import com.nuvio.app.features.settings.SettingsSwitchRow
import nuvio.composeapp.generated.resources.Res
import nuvio.composeapp.generated.resources.bitrate_custom_limits_heading
import nuvio.composeapp.generated.resources.bitrate_section_quality
import nuvio.composeapp.generated.resources.data_saver_target_option
import nuvio.composeapp.generated.resources.download_filter_bitrate_codec_desc
import nuvio.composeapp.generated.resources.download_filter_bitrate_codec_title
import nuvio.composeapp.generated.resources.download_filter_bitrate_enabled_desc
import nuvio.composeapp.generated.resources.download_filter_bitrate_enabled_title
import org.jetbrains.compose.resources.stringResource

/**
 * The Download filter's bitrate limits, in one Quality card: the switch, a data use level, the
 * per-resolution limits under Custom, a scale showing the 1080p limit, and the HEVC / AV1
 * allowance.
 */
internal fun LazyListScope.downloadBitrateItems(
    config: DownloadFilterConfig,
    store: FilterConfigStore,
    isTablet: Boolean,
) {
    val preset = config.dataUsePreset()
    item(key = "download_quality") {
        SettingsSection(title = stringResource(Res.string.bitrate_section_quality), isTablet = isTablet) {
            SettingsGroup(isTablet = isTablet) {
                SettingsSwitchRow(
                    title = stringResource(Res.string.download_filter_bitrate_enabled_title),
                    description = stringResource(Res.string.download_filter_bitrate_enabled_desc),
                    checked = config.bitrateLimitEnabled,
                    isTablet = isTablet,
                    onCheckedChange = store::setBitrateLimitEnabled,
                )
                if (config.bitrateLimitEnabled) {
                    SettingsGroupDivider(isTablet = isTablet)
                    Column(
                        modifier = Modifier.fillMaxWidth().padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        DataUseGrid(
                            selected = preset,
                            gbPerHourFor = { level ->
                                gigabytesPerHour(level.scale(DownloadFilterConfig.defaultTierBitrateKbps(StreamResolutionTier.FHD_1080)))
                            },
                            onSelect = store::setDataUse,
                        )
                        if (preset == DataUsePreset.CUSTOM) {
                            BitrateCustomRows(
                                heading = stringResource(Res.string.bitrate_custom_limits_heading),
                                tiers = settingTiers,
                                valueFor = config::tierBitrateKbps,
                                onValue = store::setTierBitrateKbps,
                                optionLabel = { kbps ->
                                    stringResource(
                                        Res.string.data_saver_target_option,
                                        formatKbpsAsMbps(kbps),
                                        oneDecimal(gigabytesPerHour(kbps)),
                                    )
                                },
                            )
                        }
                        BitrateScale(config.tierBitrateKbps(StreamResolutionTier.FHD_1080))
                    }
                    SettingsGroupDivider(isTablet = isTablet)
                    SettingsSwitchRow(
                        title = stringResource(Res.string.download_filter_bitrate_codec_title),
                        description = stringResource(Res.string.download_filter_bitrate_codec_desc),
                        checked = config.scaleBitrateByCodec,
                        isTablet = isTablet,
                        onCheckedChange = store::setScaleBitrateByCodec,
                    )
                }
            }
        }
    }
}
