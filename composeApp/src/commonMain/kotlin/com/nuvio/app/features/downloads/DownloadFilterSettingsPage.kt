package com.nuvio.app.features.downloads

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.RestartAlt
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import com.nuvio.app.core.ui.NuvioBottomSheetActionRow
import com.nuvio.app.core.ui.NuvioDropdownChip
import com.nuvio.app.features.datasaver.dataSaverQualityItems
import com.nuvio.app.core.ui.NuvioDropdownOption
import com.nuvio.app.core.ui.nuvio
import androidx.compose.foundation.border
import nuvio.composeapp.generated.resources.data_saver_reset_confirm_title
import nuvio.composeapp.generated.resources.download_filter_downloads_header_desc
import nuvio.composeapp.generated.resources.download_filter_downloads_reset_confirm_desc
import nuvio.composeapp.generated.resources.download_filter_downloads_reset_desc
import nuvio.composeapp.generated.resources.download_filter_bitrate_dropdown_title
import nuvio.composeapp.generated.resources.download_filter_bitrate_option
import nuvio.composeapp.generated.resources.download_filter_size_dropdown_title
import nuvio.composeapp.generated.resources.download_filter_size_option
import com.nuvio.app.core.ui.NuvioModalBottomSheet
import com.nuvio.app.core.ui.dismissNuvioBottomSheet
import com.nuvio.app.core.ui.nuvioSafeBottomPadding
import kotlinx.coroutines.launch
import nuvio.composeapp.generated.resources.action_cancel
import nuvio.composeapp.generated.resources.download_filter_reset_confirm_action
import nuvio.composeapp.generated.resources.download_filter_reset_confirm_desc
import nuvio.composeapp.generated.resources.download_filter_reset_confirm_title
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
import nuvio.composeapp.generated.resources.download_filter_bitrate_codec_desc
import nuvio.composeapp.generated.resources.download_filter_bitrate_codec_title
import nuvio.composeapp.generated.resources.download_filter_bitrate_enabled_desc
import nuvio.composeapp.generated.resources.download_filter_bitrate_enabled_title
import nuvio.composeapp.generated.resources.download_filter_bitrate_value
import nuvio.composeapp.generated.resources.download_filter_header_desc
import nuvio.composeapp.generated.resources.download_filter_section_bitrate
import nuvio.composeapp.generated.resources.download_filter_reset
import nuvio.composeapp.generated.resources.download_filter_reset_desc
import nuvio.composeapp.generated.resources.download_filter_section_resolution
import nuvio.composeapp.generated.resources.download_filter_section_resolution_desc
import nuvio.composeapp.generated.resources.download_filter_section_size
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

private val maxSizeGb = (DownloadFilterConfig.MAX_MAX_SIZE_BYTES / BYTES_PER_GB).toInt()

/** "6", "2.4", "0.5": Mbps with one decimal place only when needed. */
internal fun formatKbpsAsMbps(kbps: Int): String {
    val tenths = (kbps + 50) / 100
    return if (tenths % 10 == 0) "${tenths / 10}" else "${tenths / 10}.${tenths % 10}"
}

/** Bitrate choices offered for each resolution, in kbps, around what is usual for it. */
internal fun bitrateChoicesKbps(tier: StreamResolutionTier): List<Int> = when (tier) {
    StreamResolutionTier.UHD_4K -> (8..40 step 2).map { it * 1_000 } + listOf(25_000, 27_000)
    StreamResolutionTier.HD_720 -> (2..16).map { it * 500 }
    else -> (1..20).map { it * 1_000 }
}.distinct().sorted()

/** Short resolution names: "4K", "1080p", "720p", "480p". */
internal fun bitrateTierLabel(tier: StreamResolutionTier): String = when (tier) {
    StreamResolutionTier.UHD_4K -> "4K"
    StreamResolutionTier.FHD_1080 -> "1080p"
    StreamResolutionTier.HD_720 -> "720p"
    StreamResolutionTier.SD -> "480p"
    StreamResolutionTier.UNKNOWN -> ""
}

/** A settings row with its value picked from a dropdown, in place of a slider with many stops. */
@Composable
internal fun FilterDropdownRow(
    title: String,
    selectedLabel: String,
    selectedKey: String,
    options: List<NuvioDropdownOption>,
    onSelected: (NuvioDropdownOption) -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(
            text = title,
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurface,
            fontWeight = FontWeight.Medium,
            modifier = Modifier.weight(1f),
        )
        val tokens = MaterialTheme.nuvio
        // The chip's own fill matches the settings card, so outline it to read as a control.
        NuvioDropdownChip(
            title = title,
            label = selectedLabel,
            selectedKey = selectedKey,
            options = options,
            onSelected = onSelected,
            modifier = Modifier.border(1.dp, tokens.colors.borderStrong, tokens.shapes.compactCard),
        )
    }
}

/**
 * The Download filter page: only the limits the Download button's quality options use
 * (bitrate, size, unknown size). Resolution and file types belong to Data Saver.
 */
internal fun LazyListScope.downloadFilterSettingsContent(
    config: DownloadFilterConfig,
    isTablet: Boolean,
) = filterSettingsContent(
    config = config,
    store = DownloadFilterSettingsRepository,
    isTablet = isTablet,
    streamRules = false,
    headerRes = Res.string.download_filter_downloads_header_desc,
    resetDescRes = Res.string.download_filter_downloads_reset_desc,
    resetConfirmTitleRes = Res.string.download_filter_reset_confirm_title,
    resetConfirmDescRes = Res.string.download_filter_downloads_reset_confirm_desc,
)

/** The Data Saver page: the rules that filter the streams list while Data Saver is on. */
internal fun LazyListScope.dataSaverSettingsContent(
    config: DownloadFilterConfig,
    playback: com.nuvio.app.features.datasaver.DataSaverPlaybackConfig,
    isTablet: Boolean,
) = filterSettingsContent(
    leading = {
        dataSaverQualityItems(playback = playback, maxResolution = config.maxResolution, isTablet = isTablet)
    },
    config = config,
    store = com.nuvio.app.features.datasaver.DataSaverSettingsRepository,
    isTablet = isTablet,
    streamRules = true,
    headerRes = Res.string.download_filter_header_desc,
    resetDescRes = Res.string.download_filter_reset_desc,
    resetConfirmTitleRes = Res.string.data_saver_reset_confirm_title,
    resetConfirmDescRes = Res.string.download_filter_reset_confirm_desc,
    onResetExtra = com.nuvio.app.features.datasaver.DataSaverPlaybackRepository::resetTargets,
)

/** Shared by both pages; [streamRules] adds the resolution and file type sections. */
private fun LazyListScope.filterSettingsContent(
    config: DownloadFilterConfig,
    store: FilterConfigStore,
    isTablet: Boolean,
    streamRules: Boolean,
    headerRes: StringResource,
    resetDescRes: StringResource,
    resetConfirmTitleRes: StringResource,
    resetConfirmDescRes: StringResource,
    /** Items shown above the page's introduction, e.g. Data Saver's switch. */
    leading: (LazyListScope.() -> Unit)? = null,
    /** Also run by "Reset to defaults", e.g. Data Saver's targets. */
    onResetExtra: (() -> Unit)? = null,
) {
    val minSizeGb = (store.minMaxSizeBytes / BYTES_PER_GB).toInt()
    leading?.invoke(this)
    item {
        Text(
            text = stringResource(headerRes),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(horizontal = 20.dp, vertical = 12.dp),
        )
    }

    // Data Saver's maximum resolution is chosen in its card above, with the targets.
    if (streamRules) item {
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
                        onClick = { store.setSourceAllowed(source, !checked) },
                    )
                }
            }
        }
    }

    // Data Saver's bitrate limits follow its targets (see listFilter), so only downloads set them here.
    if (!streamRules) downloadBitrateItems(config = config, store = store, isTablet = isTablet)

    item {
        SettingsSection(
            title = stringResource(Res.string.download_filter_section_size),
            isTablet = isTablet,
        ) {
            SettingsGroup(isTablet = isTablet) {
                val currentGb = (config.maxSizeBytes / BYTES_PER_GB).toInt().coerceIn(minSizeGb, maxSizeGb)
                FilterDropdownRow(
                    title = stringResource(Res.string.download_filter_size_dropdown_title),
                    selectedLabel = stringResource(Res.string.download_filter_size_option, currentGb),
                    selectedKey = currentGb.toString(),
                    options = (minSizeGb..maxSizeGb).map { gb ->
                        NuvioDropdownOption(
                            key = gb.toString(),
                            label = stringResource(Res.string.download_filter_size_option, gb),
                        )
                    },
                    onSelected = { option ->
                        option.key.toLongOrNull()?.let { gb ->
                            store.setMaxSizeBytes(gb * BYTES_PER_GB)
                        }
                    },
                )
                SettingsGroupDivider(isTablet = isTablet)
                SettingsSwitchRow(
                    title = stringResource(Res.string.download_filter_unknown_size_title),
                    description = stringResource(Res.string.download_filter_unknown_size_desc),
                    checked = config.showUnknownSizeStreams,
                    isTablet = isTablet,
                    onCheckedChange = store::setShowUnknownSizeStreams,
                )
            }
        }
    }

    item {
        var confirmReset by remember { mutableStateOf(false) }
        SettingsGroup(isTablet = isTablet) {
            SettingsNavigationRow(
                title = stringResource(Res.string.download_filter_reset),
                description = stringResource(resetDescRes),
                isTablet = isTablet,
                onClick = { confirmReset = true },
            )
        }
        if (confirmReset) {
            ResetFilterConfirmSheet(
                title = stringResource(resetConfirmTitleRes),
                description = stringResource(resetConfirmDescRes),
                onReset = {
                    store.resetToDefaults()
                    onResetExtra?.invoke()
                },
                onDismiss = { confirmReset = false },
            )
        }
    }
}

/** Asks before restoring the default filter, since it discards every change on this page. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ResetFilterConfirmSheet(
    title: String,
    description: String,
    onReset: () -> Unit,
    onDismiss: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val scope = rememberCoroutineScope()
    val close: (afterClose: () -> Unit) -> Unit = { afterClose ->
        scope.launch {
            dismissNuvioBottomSheet(sheetState = sheetState) {
                afterClose()
                onDismiss()
            }
        }
    }
    NuvioModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp)
                .padding(top = 4.dp, bottom = 8.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Text(
                text = title,
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
            )
            Text(
                text = description,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        NuvioBottomSheetActionRow(
            title = stringResource(Res.string.download_filter_reset_confirm_action),
            icon = Icons.Rounded.RestartAlt,
            onClick = { close(onReset) },
        )
        NuvioBottomSheetActionRow(
            title = stringResource(Res.string.action_cancel),
            icon = Icons.Rounded.Close,
            onClick = { close {} },
            modifier = Modifier.padding(bottom = nuvioSafeBottomPadding(12.dp)),
        )
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
