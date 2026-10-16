import type { CSSProperties } from 'react';
import type { Settings } from '../generated/contract';

export type ThemeEntry = Settings['themes'][number];

/** Kotlin `ThemeColors.White` derived values, used when no bridge entry exists. */
export const FALLBACK_THEME: Required<Pick<ThemeEntry, 'background' | 'accent' | 'surface'>> & Partial<ThemeEntry> = {
  background: '#0D0D0D',
  accent: '#F5F5F5',
  surface: '#222222',
};

/**
 * Theme-independent tokens from `defaultNuvioThemeTokens` in
 * `composeApp/.../core/ui/Tokens.kt`. These do not vary per palette and are
 * emitted verbatim so shared components stay aligned without a per-theme
 * bridge projection.
 */
export const STATIC_TOKENS = {
  textPrimary: '#F5F7F8',
  textSecondary: '#B8BEC5',
  textMuted: '#969CA3',
  textInverse: '#111111',
  borderDefault: '#252A2A',
  borderStrong: '#3A4040',
  success: '#66BB6A',
  warning: '#FFC857',
  danger: '#E36A8A',
  info: '#42A5F5',
  parentalGuide: '#5D1F1F',
} as const;

/**
 * Motion/shape primitives from `NuvioTokens` (`Tokens.kt`). Durations map to
 * CSS directly; the jelly/tab springs (`JellySpring.kt`) have no CSS spring
 * equivalent, so navigation keeps its existing calibrated motion and only the
 * non-spring durations are tokenized here.
 */
export const MOTION_TOKENS = {
  fastMs: 150,
  normalMs: 220,
  sheetEnterMs: 300,
  sheetExitMs: 250,
  slowMs: 400,
  cinematicMs: 700,
  standard: 'cubic-bezier(0.2, 0, 0, 1)',
  decelerate: 'cubic-bezier(0, 0, 0, 1)',
  accelerate: 'cubic-bezier(0.3, 0, 1, 1)',
} as const;

export const SHAPE_TOKENS = {
  cardPx: 24,
  sheetPx: 24,
  dialogPx: 28,
  buttonPx: 16,
  posterPx: 12,
} as const;

export function resolveThemeEntry(themes: ThemeEntry[], themeId: string): ThemeEntry | undefined {
  const needle = themeId.toLowerCase();
  return themes.find((item) => item.id.toLowerCase() === needle);
}

/**
 * Map one canonical bridge theme entry to CSS variables.
 *
 * The bridge projects Kotlin's derived `ThemeColorPalette` (see
 * `ThemeColors.getColorPalette` / `CustomThemeColors.toColorPalette`), so the
 * frontend must not re-derive surfaces from raw custom colors. Raw
 * `customThemeColors` are only a fallback when the backend predates the full
 * palette projection (e.g. a custom entry missing from the entitled list).
 * AMOLED only overrides the page background, matching Kotlin's
 * `buildColorScheme(palette, amoled)` which keeps elevated/card surfaces.
 *
 * Surface mapping follows `defaultNuvioThemeTokens`: sheet/dialog resolve to
 * the elevated surface, popover to the card surface. Alpha overlays use
 * `color-mix` because the bridge projects opaque hex without alpha.
 */
export function themeCssVars(
  entry: ThemeEntry | undefined,
  options: { amoled?: boolean; customColors?: string[] } = {},
): CSSProperties {
  const { amoled = false, customColors } = options;
  const fallbackBg = customColors?.[0] ?? FALLBACK_THEME.background;
  const fallbackAccent = customColors?.[1] ?? FALLBACK_THEME.accent;
  const fallbackSurface = customColors?.[2] ?? FALLBACK_THEME.surface;
  const background = amoled ? '#000000' : (entry?.background ?? fallbackBg);
  const accent = entry?.accent ?? fallbackAccent;
  const surface = entry?.surface ?? fallbackSurface;
  const settingsSurface = entry?.settingsSurface ?? entry?.surface ?? fallbackSurface;
  const accentVariant = entry?.accentVariant ?? accent;
  const onAccent = entry?.onAccent ?? '#111111';
  const onAccentVariant = entry?.onAccentVariant ?? '#FFFFFF';
  const focusRing = entry?.focusRing ?? accent;
  const focusBackground = entry?.focusBackground ?? surface;
  const gradient = entry?.accentGradient?.length ? entry.accentGradient : [accent];
  const nativeAccent = entry?.nativeAccent ?? accent;
  return {
    '--app-bg': background,
    '--app-accent': accent,
    '--app-surface': surface,
    '--settings-surface': settingsSurface,
    '--app-surface-sheet': settingsSurface,
    '--app-surface-dialog': settingsSurface,
    '--app-surface-popover': surface,
    '--app-accent-variant': accentVariant,
    '--app-accent-strong': accentVariant,
    '--app-on-accent': onAccent,
    '--on-accent': onAccent,
    '--app-on-accent-variant': onAccentVariant,
    '--app-focus-ring': focusRing,
    '--app-focus-bg': focusBackground,
    '--app-gradient': `linear-gradient(135deg, ${(gradient.length === 1 ? [gradient[0], gradient[0]] : gradient).join(', ')})`,
    '--app-native-accent': nativeAccent,
    '--text-primary': STATIC_TOKENS.textPrimary,
    '--text-secondary': STATIC_TOKENS.textSecondary,
    '--text-muted': STATIC_TOKENS.textMuted,
    '--text-inverse': STATIC_TOKENS.textInverse,
    '--text': STATIC_TOKENS.textPrimary,
    '--subtle': STATIC_TOKENS.textSecondary,
    '--muted': STATIC_TOKENS.textMuted,
    '--border-subtle': 'rgba(37, 42, 42, 0.55)',
    '--border-default': STATIC_TOKENS.borderDefault,
    '--border-strong': STATIC_TOKENS.borderStrong,
    '--border-focus': focusRing,
    '--border-selected': `color-mix(in srgb, ${accent} 75%, transparent)`,
    '--line': 'rgba(37, 42, 42, 0.55)',
    '--scrim': 'rgba(0, 0, 0, 0.56)',
    '--overlay-hover': 'rgba(255, 255, 255, 0.08)',
    '--overlay-pressed': 'rgba(255, 255, 255, 0.12)',
    '--overlay-selected': 'rgba(255, 255, 255, 0.15)',
    '--overlay-disabled': 'rgba(0, 0, 0, 0.38)',
    '--success': STATIC_TOKENS.success,
    '--warning': STATIC_TOKENS.warning,
    '--danger': STATIC_TOKENS.danger,
    '--info': STATIC_TOKENS.info,
    '--shimmer': 'rgba(255, 255, 255, 0.10)',
    '--skeleton': 'rgba(255, 255, 255, 0.06)',
    '--motion-fast': `${MOTION_TOKENS.fastMs}ms`,
    '--motion-normal': `${MOTION_TOKENS.normalMs}ms`,
    '--motion-sheet-enter': `${MOTION_TOKENS.sheetEnterMs}ms`,
    '--motion-sheet-exit': `${MOTION_TOKENS.sheetExitMs}ms`,
    '--motion-slow': `${MOTION_TOKENS.slowMs}ms`,
    '--motion-cinematic': `${MOTION_TOKENS.cinematicMs}ms`,
    '--easing-standard': MOTION_TOKENS.standard,
    '--easing-decelerate': MOTION_TOKENS.decelerate,
    '--easing-accelerate': MOTION_TOKENS.accelerate,
    '--radius-card': `${SHAPE_TOKENS.cardPx}px`,
    '--radius-sheet': `${SHAPE_TOKENS.sheetPx}px`,
    '--radius-dialog': `${SHAPE_TOKENS.dialogPx}px`,
    '--radius-button': `${SHAPE_TOKENS.buttonPx}px`,
    '--radius-chip': '999px',
    '--radius-poster': `${SHAPE_TOKENS.posterPx}px`,
  } as CSSProperties;
}
