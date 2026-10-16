import { describe, expect, it } from 'vitest';
import { FALLBACK_THEME, MOTION_TOKENS, resolveThemeEntry, STATIC_TOKENS, themeCssVars, type ThemeEntry } from './palette';

// Fixtures mirror composeApp ThemeColors.kt derived projections.
const white: ThemeEntry = {
  id: 'white',
  label: 'White',
  background: '#0D0D0D',
  accent: '#F5F5F5',
  surface: '#222222',
  settingsSurface: '#1A1A1A',
  accentVariant: '#E0E0E0',
  onAccent: '#111111',
  onAccentVariant: '#111111',
  focusRing: '#FFFFFF',
  focusBackground: '#303030',
  accentGradient: ['#F5F5F5'],
  nativeAccent: '#F5F5F5',
};

const graphite: ThemeEntry = {
  id: 'graphite',
  label: 'Graphite',
  background: '#0C0D0F',
  accent: '#AAB2BE',
  surface: '#20242A',
  settingsSurface: '#17191D',
  accentVariant: '#687381',
  onAccent: '#111111',
  onAccentVariant: '#FFFFFF',
  focusRing: '#F3F5F7',
  focusBackground: '#30343A',
  accentGradient: ['#F3F5F7', '#AAB2BE', '#687381'],
  nativeAccent: '#F3F5F7',
};

describe('theme palette mapping', () => {
  it('resolves entries case-insensitively', () => {
    expect(resolveThemeEntry([white, graphite], 'WHITE')).toBe(white);
    expect(resolveThemeEntry([white, graphite], 'Graphite')).toBe(graphite);
    expect(resolveThemeEntry([white], 'custom')).toBeUndefined();
  });

  it('maps the White preset to Kotlin derived surfaces, not raw slots', () => {
    const vars = themeCssVars(white) as Record<string, string>;
    expect(vars['--app-bg']).toBe('#0D0D0D');
    expect(vars['--app-accent']).toBe('#F5F5F5');
    // Card surface differs from the legacy '#1A1A1A' direct mapping.
    expect(vars['--app-surface']).toBe('#222222');
    expect(vars['--settings-surface']).toBe('#1A1A1A');
    expect(vars['--app-on-accent']).toBe('#111111');
    expect(vars['--app-focus-ring']).toBe('#FFFFFF');
    expect(vars['--app-gradient']).toBe('linear-gradient(135deg, #F5F5F5, #F5F5F5)');
  });

  it('maps Graphite gradient and focus tokens', () => {
    const vars = themeCssVars(graphite) as Record<string, string>;
    expect(vars['--app-accent-variant']).toBe('#687381');
    expect(vars['--app-focus-ring']).toBe('#F3F5F7');
    expect(vars['--app-focus-bg']).toBe('#30343A');
    expect(vars['--app-gradient']).toBe('linear-gradient(135deg, #F3F5F7, #AAB2BE, #687381)');
    expect(vars['--app-native-accent']).toBe('#F3F5F7');
  });

  it('uses the derived custom entry instead of raw custom slots', () => {
    const customEntry: ThemeEntry = {
      ...graphite,
      id: 'custom',
      label: 'Custom',
      background: '#0E0C10',
      surface: '#241C26',
      settingsSurface: '#1D1620',
    };
    const vars = themeCssVars(customEntry, { customColors: ['#B75AFF', '#EC70A9', '#FFB37A'] }) as Record<string, string>;
    // Must not map raw slots directly (old bug: bg=#B75AFF, accent=#EC70A9, surface=#FFB37A).
    expect(vars['--app-bg']).toBe('#0E0C10');
    expect(vars['--app-accent']).toBe('#AAB2BE');
    expect(vars['--app-surface']).toBe('#241C26');
  });

  it('overrides only the page background for AMOLED, keeping surfaces', () => {
    const vars = themeCssVars(white, { amoled: true }) as Record<string, string>;
    expect(vars['--app-bg']).toBe('#000000');
    expect(vars['--app-surface']).toBe('#222222');
    expect(vars['--settings-surface']).toBe('#1A1A1A');
  });

  it('falls back safely without an entry', () => {
    const vars = themeCssVars(undefined) as Record<string, string>;
    expect(vars['--app-bg']).toBe(FALLBACK_THEME.background);
    expect(vars['--app-accent']).toBe(FALLBACK_THEME.accent);
  });

  it('maps sheet/dialog surfaces to the elevated surface', () => {
    const vars = themeCssVars(graphite) as Record<string, string>;
    expect(vars['--app-surface-sheet']).toBe('#17191D');
    expect(vars['--app-surface-dialog']).toBe('#17191D');
    expect(vars['--app-surface-popover']).toBe('#20242A');
  });

  it('emits static Kotlin text, scrim and status tokens', () => {
    const vars = themeCssVars(white) as Record<string, string>;
    expect(vars['--text-primary']).toBe(STATIC_TOKENS.textPrimary);
    expect(vars['--text-muted']).toBe(STATIC_TOKENS.textMuted);
    expect(vars['--scrim']).toBe('rgba(0, 0, 0, 0.56)');
    expect(vars['--danger']).toBe(STATIC_TOKENS.danger);
    expect(vars['--border-focus']).toBe('#FFFFFF');
    expect(vars['--border-selected']).toBe('color-mix(in srgb, #F5F5F5 75%, transparent)');
  });

  it('emits NuvioTokens motion durations', () => {
    const vars = themeCssVars(white) as Record<string, string>;
    expect(vars['--motion-sheet-enter']).toBe(`${MOTION_TOKENS.sheetEnterMs}ms`);
    expect(vars['--motion-sheet-exit']).toBe(`${MOTION_TOKENS.sheetExitMs}ms`);
    expect(MOTION_TOKENS.sheetEnterMs).toBe(300);
    expect(MOTION_TOKENS.sheetExitMs).toBe(250);
  });
});
