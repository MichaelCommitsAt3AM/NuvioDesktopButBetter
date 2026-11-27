package com.nuvio.app.features.downloads

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import com.nuvio.app.core.ui.NuvioDropdownOption
import com.nuvio.app.core.ui.accentBrush
import com.nuvio.app.core.ui.nuvio
import com.nuvio.app.core.ui.themePalette
import nuvio.composeapp.generated.resources.Res
import nuvio.composeapp.generated.resources.bitrate_data_use_balanced
import nuvio.composeapp.generated.resources.bitrate_data_use_custom
import nuvio.composeapp.generated.resources.bitrate_data_use_custom_desc
import nuvio.composeapp.generated.resources.bitrate_data_use_gb_per_hour
import nuvio.composeapp.generated.resources.bitrate_data_use_high
import nuvio.composeapp.generated.resources.bitrate_data_use_low
import nuvio.composeapp.generated.resources.bitrate_data_use_title
import nuvio.composeapp.generated.resources.download_filter_bitrate_option
import org.jetbrains.compose.resources.StringResource
import org.jetbrains.compose.resources.stringResource
import kotlin.math.roundToInt

/** Gigabytes (10^9 bytes, as streaming services quote them) one hour takes at [kbps]. */
internal fun gigabytesPerHour(kbps: Int): Double = kbps * 1_000.0 / 8.0 * 3_600.0 / 1_000_000_000.0

/** One decimal place: "2.7". */
internal fun oneDecimal(value: Double): String {
    val tenths = (value * 10).roundToInt()
    return "${tenths / 10}.${tenths % 10}"
}

private val CardShape = RoundedCornerShape(16.dp)

/** A small heading inside a card: "Max resolution", "Data use". */
@Composable
internal fun BitrateCardHeading(text: String, modifier: Modifier = Modifier) {
    Text(
        text = text,
        style = MaterialTheme.typography.titleMedium,
        fontWeight = FontWeight.SemiBold,
        color = MaterialTheme.nuvio.colors.textPrimary,
        modifier = modifier,
    )
}

/** One control with a segment per resolution; the fill behind the selected one slides between them. */
@Composable
internal fun ResolutionSegmentedControl(
    options: List<StreamResolutionTier>,
    selected: StreamResolutionTier,
    onSelect: (StreamResolutionTier) -> Unit,
) {
    val tokens = MaterialTheme.nuvio
    val selectedIndex = options.indexOf(selected)
    val highlightPosition = animateFloatAsState(
        targetValue = selectedIndex.coerceAtLeast(0).toFloat(),
        animationSpec = spring(dampingRatio = 0.8f, stiffness = Spring.StiffnessMediumLow),
    )
    val highlightColor = tokens.colors.textPrimary
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(CardShape)
            .background(tokens.colors.textPrimary.copy(alpha = 0.06f))
            .padding(4.dp)
            // Drawn behind the labels, reading the position only here so sliding redraws without recomposing.
            .drawBehind {
                if (selectedIndex < 0) return@drawBehind
                val gap = SegmentGap.toPx()
                val segmentWidth = (size.width - gap * (options.size - 1)) / options.size
                val fromStart = highlightPosition.value * (segmentWidth + gap)
                val left = if (layoutDirection == LayoutDirection.Rtl) {
                    size.width - segmentWidth - fromStart
                } else {
                    fromStart
                }
                drawRoundRect(
                    color = highlightColor,
                    topLeft = Offset(left, 0f),
                    size = Size(segmentWidth, size.height),
                    cornerRadius = CornerRadius(SegmentCornerRadius.toPx()),
                )
            },
        horizontalArrangement = Arrangement.spacedBy(SegmentGap),
    ) {
        options.forEach { tier ->
            val isSelected = tier == selected
            val labelColor by animateColorAsState(
                if (isSelected) MaterialTheme.colorScheme.surface else tokens.colors.textSecondary,
            )
            Box(
                modifier = Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(SegmentCornerRadius))
                    .clickable { onSelect(tier) }
                    .padding(vertical = 12.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = bitrateTierLabel(tier),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = labelColor,
                )
            }
        }
    }
}

private val SegmentGap = 4.dp
private val SegmentCornerRadius = 12.dp

/**
 * Low / Balanced / High / Custom as a two-by-two grid. Each level shows the data an hour takes
 * at [gbPerHourFor]; Custom opens the per-resolution rows.
 */
@Composable
internal fun DataUseGrid(
    selected: DataUsePreset,
    gbPerHourFor: (DataUsePreset) -> Double,
    onSelect: (DataUsePreset) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        BitrateCardHeading(stringResource(Res.string.bitrate_data_use_title))
        listOf(
            listOf(DataUsePreset.LOW, DataUsePreset.BALANCED),
            listOf(DataUsePreset.HIGH, DataUsePreset.CUSTOM),
        ).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                row.forEach { preset ->
                    DataUseTile(
                        title = stringResource(presetTitle(preset)),
                        detail = if (preset == DataUsePreset.CUSTOM) {
                            stringResource(Res.string.bitrate_data_use_custom_desc)
                        } else {
                            stringResource(Res.string.bitrate_data_use_gb_per_hour, oneDecimal(gbPerHourFor(preset)))
                        },
                        selected = preset == selected,
                        onClick = { onSelect(preset) },
                        modifier = Modifier.weight(1f),
                    )
                }
            }
        }
    }
}

private fun presetTitle(preset: DataUsePreset): StringResource = when (preset) {
    DataUsePreset.LOW -> Res.string.bitrate_data_use_low
    DataUsePreset.BALANCED -> Res.string.bitrate_data_use_balanced
    DataUsePreset.HIGH -> Res.string.bitrate_data_use_high
    DataUsePreset.CUSTOM -> Res.string.bitrate_data_use_custom
}

@Composable
private fun DataUseTile(
    title: String,
    detail: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = MaterialTheme.nuvio
    Column(
        modifier = modifier
            .clip(CardShape)
            .background(if (selected) tokens.colors.textPrimary else androidx.compose.ui.graphics.Color.Transparent)
            .border(1.dp, if (selected) tokens.colors.textPrimary else tokens.colors.borderStrong, CardShape)
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 14.dp),
    ) {
        Text(
            text = title,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
            color = if (selected) MaterialTheme.colorScheme.surface else tokens.colors.textPrimary,
            maxLines = 1,
        )
        Text(
            text = detail,
            style = MaterialTheme.typography.bodyMedium,
            color = if (selected) MaterialTheme.colorScheme.surface.copy(alpha = 0.75f) else tokens.colors.textSecondary,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

/**
 * The per-resolution dropdowns under Custom, in their own inset panel headed [heading]. Each
 * option shows its data per hour when [showGbPerHour].
 */
@Composable
internal fun BitrateCustomRows(
    heading: String,
    tiers: List<StreamResolutionTier>,
    valueFor: (StreamResolutionTier) -> Int,
    onValue: (StreamResolutionTier, Int) -> Unit,
    optionLabel: @Composable (Int) -> String,
) {
    val tokens = MaterialTheme.nuvio
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(CardShape)
            .background(tokens.colors.textPrimary.copy(alpha = 0.05f))
            .padding(top = 12.dp, bottom = 4.dp),
    ) {
        Text(
            text = heading,
            style = MaterialTheme.typography.bodyMedium,
            color = tokens.colors.textSecondary,
            modifier = Modifier.padding(horizontal = 16.dp),
        )
        tiers.forEach { tier ->
            val current = valueFor(tier)
            FilterDropdownRow(
                title = bitrateTierLabel(tier),
                selectedLabel = stringResource(Res.string.download_filter_bitrate_option, formatKbpsAsMbps(current)),
                selectedKey = current.toString(),
                options = (bitrateChoicesKbps(tier) + current).distinct().sorted().map { kbps ->
                    NuvioDropdownOption(key = kbps.toString(), label = optionLabel(kbps))
                },
                onSelected = { option -> option.key.toIntOrNull()?.let { onValue(tier, it) } },
            )
        }
    }
}

/** Common streaming levels marked on the bitrate scale, which is full at the 4K one. */
private data class UsageMark(val label: String, val kbps: Int)

private val usageMarks = listOf(
    UsageMark("SD", 1_500),
    UsageMark("Netflix HD", 6_000),
    UsageMark("4K", 16_000),
)

private const val SCALE_MAX_KBPS = 16_000

/** The bar: filled to [kbps], with a tick and a label above for each streaming level. */
@Composable
internal fun BitrateScale(kbps: Int) {
    val tokens = MaterialTheme.nuvio
    val labelWidth = 72.dp
    BoxWithConstraints(modifier = Modifier.fillMaxWidth().padding(top = 4.dp)) {
        val width = maxWidth
        Column {
            Box(modifier = Modifier.fillMaxWidth().height(20.dp)) {
                usageMarks.forEach { mark ->
                    val x = (width * (mark.kbps.toFloat() / SCALE_MAX_KBPS) - labelWidth / 2)
                        .coerceIn(0.dp, width - labelWidth)
                    Text(
                        text = mark.label,
                        style = MaterialTheme.typography.labelMedium,
                        color = tokens.colors.textSecondary,
                        textAlign = when (mark) {
                            usageMarks.last() -> TextAlign.End
                            else -> TextAlign.Center
                        },
                        maxLines = 1,
                        modifier = Modifier.offset(x = x).width(labelWidth),
                    )
                }
            }
            Box(modifier = Modifier.fillMaxWidth().height(14.dp), contentAlignment = Alignment.CenterStart) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(8.dp)
                        .clip(RoundedCornerShape(4.dp))
                        .background(tokens.colors.borderStrong),
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxHeight()
                            .fillMaxWidth((kbps.toFloat() / SCALE_MAX_KBPS).coerceIn(0.02f, 1f))
                            .clip(RoundedCornerShape(4.dp))
                            .background(MaterialTheme.themePalette.accentBrush()),
                    )
                }
                usageMarks.forEach { mark ->
                    val fraction = mark.kbps.toFloat() / SCALE_MAX_KBPS
                    Box(
                        modifier = Modifier
                            .offset(x = (width * fraction - 1.dp).coerceIn(0.dp, width - 2.dp))
                            .width(2.dp)
                            .height(14.dp)
                            .background(tokens.colors.textSecondary),
                    )
                }
            }
            Text(
                text = "0",
                style = MaterialTheme.typography.labelMedium,
                color = tokens.colors.textMuted,
                modifier = Modifier.padding(top = 4.dp),
            )
        }
    }
}
