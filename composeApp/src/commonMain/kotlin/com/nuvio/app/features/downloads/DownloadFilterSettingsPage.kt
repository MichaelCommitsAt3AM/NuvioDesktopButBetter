package com.nuvio.app.features.downloads

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.nuvio.app.features.settings.SettingsGroup
import com.nuvio.app.features.settings.SettingsGroupDivider
import com.nuvio.app.features.settings.SettingsNavigationRow
import com.nuvio.app.features.settings.SettingsSection
import com.nuvio.app.features.settings.SettingsSwitchRow
import nuvio.composeapp.generated.resources.Res
import nuvio.composeapp.generated.resources.download_filter_header_desc
import nuvio.composeapp.generated.resources.download_filter_reset
import nuvio.composeapp.generated.resources.download_filter_reset_desc
import nuvio.composeapp.generated.resources.download_filter_resolution_1080
import nuvio.composeapp.generated.resources.download_filter_resolution_2160
import nuvio.composeapp.generated.resources.download_filter_resolution_480
import nuvio.composeapp.generated.resources.download_filter_resolution_720
import nuvio.composeapp.generated.resources.download_filter_section_resolution
import nuvio.composeapp.generated.resources.download_filter_section_resolution_desc
import nuvio.composeapp.generated.resources.download_filter_section_size
import nuvio.composeapp.generated.resources.download_filter_section_size_desc
import nuvio.composeapp.generated.resources.download_filter_section_sources
import nuvio.composeapp.generated.resources.download_filter_section_sources_desc
import nuvio.composeapp.generated.resources.download_filter_size_value
import nuvio.composeapp.generated.resources.download_filter_source_bluray
import nuvio.composeapp.generated.resources.download_filter_source_cam
import nuvio.composeapp.generated.resources.download_filter_source_dvd
import nuvio.composeapp.generated.resources.download_filter_source_hdtv
import nuvio.composeapp.generated.resources.download_filter_source_remux
import nuvio.composeapp.generated.resources.download_filter_source_webdl
import nuvio.composeapp.generated.resources.download_filter_source_webrip
import nuvio.composeapp.generated.resources.download_filter_unknown_size_desc
import nuvio.composeapp.generated.resources.download_filter_unknown_size_title
import org.jetbrains.compose.resources.StringResource
import org.jetbrains.compose.resources.stringResource

/** Ordered, user-facing resolution options (highest first). */
private val resolutionOptions: List<StreamResolutionTier> = listOf(
    StreamResolutionTier.UHD_4K,
    StreamResolutionTier.FHD_1080,
    StreamResolutionTier.HD_720,
    StreamResolutionTier.SD,
)

/** Ordered, user-facing source options (data-friendly first). */
private val sourceOptions: List<StreamSourceType> = listOf(
    StreamSourceType.WEBDL,
    StreamSourceType.WEBRIP,
    StreamSourceType.HDTV,
    StreamSourceType.DVD,
    StreamSourceType.CAM,
    StreamSourceType.BLURAY,
    StreamSourceType.REMUX,
)

private const val BYTES_PER_GB = 1024L * 1024L * 1024L
private val minSizeGb = (DownloadFilterConfig.MIN_MAX_SIZE_BYTES / BYTES_PER_GB).toInt()
private val maxSizeGb = (DownloadFilterConfig.MAX_MAX_SIZE_BYTES / BYTES_PER_GB).toInt()

internal fun LazyListScope.downloadFilterSettingsContent(
    config: DownloadFilterConfig,
    isTablet: Boolean,
) {
    item {
        Text(
            text = stringResource(Res.string.download_filter_header_desc),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(horizontal = 20.dp, vertical = 12.dp),
        )
    }

    item {
        SettingsSection(
            title = stringResource(Res.string.download_filter_section_resolution),
            isTablet = isTablet,
        ) {
            Text(
                text = stringResource(Res.string.download_filter_section_resolution_desc),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = 4.dp, vertical = 4.dp),
            )
            SettingsGroup(isTablet = isTablet) {
                resolutionOptions.forEachIndexed { index, tier ->
                    if (index > 0) SettingsGroupDivider(isTablet = isTablet)
                    SelectableRow(
                        label = stringResource(resolutionLabelRes(tier)),
                        selected = config.maxResolution == tier,
                        multiSelect = false,
                        onClick = { DownloadFilterSettingsRepository.setMaxResolution(tier) },
                    )
                }
            }
        }
    }

    item {
        SettingsSection(
            title = stringResource(Res.string.download_filter_section_sources),
            isTablet = isTablet,
        ) {
            Text(
                text = stringResource(Res.string.download_filter_section_sources_desc),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = 4.dp, vertical = 4.dp),
            )
            SettingsGroup(isTablet = isTablet) {
                sourceOptions.forEachIndexed { index, source ->
                    if (index > 0) SettingsGroupDivider(isTablet = isTablet)
                    val checked = source in config.allowedSources
                    SelectableRow(
                        label = stringResource(sourceLabelRes(source)),
                        selected = checked,
                        multiSelect = true,
                        onClick = { DownloadFilterSettingsRepository.setSourceAllowed(source, !checked) },
                    )
                }
            }
        }
    }

    item {
        SettingsSection(
            title = stringResource(Res.string.download_filter_section_size),
            isTablet = isTablet,
        ) {
            Text(
                text = stringResource(Res.string.download_filter_section_size_desc),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = 4.dp, vertical = 4.dp),
            )
            SettingsGroup(isTablet = isTablet) {
                val currentGb = (config.maxSizeBytes / BYTES_PER_GB).toInt().coerceIn(minSizeGb, maxSizeGb)
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 8.dp),
                ) {
                    Text(
                        text = stringResource(Res.string.download_filter_size_value, currentGb),
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurface,
                        fontWeight = FontWeight.Medium,
                    )
                    Slider(
                        value = currentGb.toFloat(),
                        onValueChange = { value ->
                            DownloadFilterSettingsRepository.setMaxSizeBytes(value.toLong() * BYTES_PER_GB)
                        },
                        valueRange = minSizeGb.toFloat()..maxSizeGb.toFloat(),
                        steps = (maxSizeGb - minSizeGb - 1).coerceAtLeast(0),
                    )
                }
                SettingsGroupDivider(isTablet = isTablet)
                SettingsSwitchRow(
                    title = stringResource(Res.string.download_filter_unknown_size_title),
                    description = stringResource(Res.string.download_filter_unknown_size_desc),
                    checked = config.showUnknownSizeStreams,
                    isTablet = isTablet,
                    onCheckedChange = DownloadFilterSettingsRepository::setShowUnknownSizeStreams,
                )
            }
        }
    }

    item {
        SettingsGroup(isTablet = isTablet) {
            SettingsNavigationRow(
                title = stringResource(Res.string.download_filter_reset),
                description = stringResource(Res.string.download_filter_reset_desc),
                isTablet = isTablet,
                onClick = { DownloadFilterSettingsRepository.resetToDefaults() },
            )
        }
    }
}

@Composable
private fun SelectableRow(
    label: String,
    selected: Boolean,
    multiSelect: Boolean,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurface,
            fontWeight = FontWeight.Medium,
            modifier = Modifier.weight(1f),
        )
        if (multiSelect) {
            Checkbox(checked = selected, onCheckedChange = { onClick() })
        } else {
            RadioButton(selected = selected, onClick = onClick)
        }
    }
}

private fun resolutionLabelRes(tier: StreamResolutionTier): StringResource = when (tier) {
    StreamResolutionTier.UHD_4K -> Res.string.download_filter_resolution_2160
    StreamResolutionTier.FHD_1080 -> Res.string.download_filter_resolution_1080
    StreamResolutionTier.HD_720 -> Res.string.download_filter_resolution_720
    StreamResolutionTier.SD -> Res.string.download_filter_resolution_480
    StreamResolutionTier.UNKNOWN -> Res.string.download_filter_resolution_480
}

private fun sourceLabelRes(source: StreamSourceType): StringResource = when (source) {
    StreamSourceType.WEBDL -> Res.string.download_filter_source_webdl
    StreamSourceType.WEBRIP -> Res.string.download_filter_source_webrip
    StreamSourceType.HDTV -> Res.string.download_filter_source_hdtv
    StreamSourceType.DVD -> Res.string.download_filter_source_dvd
    StreamSourceType.CAM -> Res.string.download_filter_source_cam
    StreamSourceType.BLURAY -> Res.string.download_filter_source_bluray
    StreamSourceType.REMUX -> Res.string.download_filter_source_remux
    StreamSourceType.UNKNOWN -> Res.string.download_filter_source_webdl
}
