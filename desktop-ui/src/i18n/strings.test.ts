import { afterEach, describe, expect, it } from 'vitest';
import { cleanup } from '@testing-library/react';
import arTables from '../generated/locales/ar.json';
import manifest from '../generated/locales/manifest.json';
import {
  formatBytes, formatCount, formatDate, formatPattern, isRtl, pickLocale, translate, translatePlural,
} from './strings';

afterEach(cleanup);

describe('locale resolution', () => {
  it('maps saved and device languages to catalog codes with English fallback', () => {
    expect(pickLocale('es', [])).toBe('es');
    expect(pickLocale('pt-BR', [])).toBe('pt-BR');
    expect(pickLocale('xx', [])).toBe('en');
    expect(pickLocale('device', ['fr-CA', 'en'])).toBe('fr');
    expect(pickLocale(undefined, [])).toBe('en');
  });

  it('flags supported RTL locales case by case', () => {
    expect(isRtl('ar')).toBe(true);
    expect(isRtl('he')).toBe(true);
    expect(isRtl('ur')).toBe(true);
    expect(isRtl('en')).toBe(false);
    expect(isRtl('fa')).toBe(false);
  });
});

describe('pattern formatting', () => {
  it('substitutes positional placeholders and unescapes percent', () => {
    expect(formatPattern('Connect %1$s first', ['Trakt'])).toBe('Connect Trakt first');
    expect(formatPattern('%1$s is unavailable. Using %2$s until it reconnects.', ['A', 'B'])).toBe('A is unavailable. Using B until it reconnects.');
    expect(formatPattern('100%% ready')).toBe('100% ready');
  });

  it('falls back visibly for missing keys and parameters', () => {
    expect(translate('en', 'action_cancel')).toBe('Cancel');
    expect(translate('es', 'action_cancel')).not.toBe('');
    expect(translate('en', 'missing_key_xyz')).toBe('missing_key_xyz');
    expect(translate('en', 'settings_tracking_disconnect_title')).toBe('Disconnect %1$s?');
  });
});

describe('plurals and locale-aware values', () => {
  it('selects quantity forms with English fallback', () => {
    expect(translatePlural('en', 'details_season_count', 1)).toContain('1');
    expect(translatePlural('en', 'details_season_count', 5)).toContain('5');
    expect(translatePlural('en', 'missing_plural_xyz', 3)).toBe('missing_plural_xyz');
  });

  it('formats numbers, sizes, and dates per locale', () => {
    expect(formatCount('en', 1234567)).toBe('1,234,567');
    expect(formatBytes('en', 2 * 1024 ** 3)).toBe('2.0 GB');
    expect(formatBytes('en', 512 * 1024 ** 2)).toBe('512 MB');
    expect(formatDate('en', '2026-03-04')).toContain('2026');
    expect(formatDate('en', null)).toBe('');
  });

  it('renders a long-string locale without crashing', () => {
    expect(translate('de', 'action_cancel').length).toBeGreaterThan(0);
    expect(translate('ar', 'action_back').length).toBeGreaterThan(0);
  });

  it('generates the catalog from canonical Kotlin resources', () => {
    expect((manifest as { locales: string[] }).locales).toContain('ar');
    expect((arTables as { strings: Record<string, string> }).strings['action_back']).toBe('رجوع');
  });
});
