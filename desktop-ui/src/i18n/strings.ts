import { useEffect, useState } from 'react';
import { useFeatureSnapshot } from '../bridge';
import enTables from '../generated/locales/en.json';
import manifest from '../generated/locales/manifest.json';

export type LocaleTables = { strings: Record<string, string>; plurals: Record<string, Record<string, string>> };
export type LocaleCode = string;

const loaded = new Map<string, LocaleTables>([['en', enTables as LocaleTables]]);
const pending = new Map<string, Promise<LocaleTables>>();
let activeLocale = 'en';

/** Module-level locale for non-hook call sites (migrated copy shims). */
export function setActiveLocale(code: string): void {
  activeLocale = code;
}

export function translateActive(key: string, params: ReadonlyArray<string | number> = []): string {
  return translate(activeLocale, key, params);
}

export function availableLocales(): string[] {
  return (manifest as { locales: string[] }).locales;
}

export function isRtl(code: string): boolean {
  return ((manifest as { rtl: string[] }).rtl ?? []).some((entry) => entry.toLowerCase() === code.toLowerCase());
}

/** Resolve the saved language (or device default) to a generated catalog code. */
export function pickLocale(saved: string | undefined, deviceLanguages: readonly string[]): string {
  const codes = availableLocales();
  const match = (candidate: string): string | undefined => {
    const needle = candidate.toLowerCase();
    return codes.find((code) => code.toLowerCase() === needle)
      ?? codes.find((code) => code.toLowerCase() === needle.split('-')[0]);
  };
  if (saved && saved.toLowerCase() !== 'device') {
    return match(saved) ?? 'en';
  }
  for (const language of deviceLanguages) {
    const found = match(language);
    if (found) return found;
  }
  return 'en';
}

export function loadLocale(code: string): Promise<LocaleTables> {
  const existing = loaded.get(code);
  if (existing) return Promise.resolve(existing);
  const inflight = pending.get(code);
  if (inflight) return inflight;
  const request = import(`../generated/locales/${code}.json`)
    .then((module) => {
      const tables = (module.default ?? module) as LocaleTables;
      loaded.set(code, tables);
      pending.delete(code);
      return tables;
    })
    .catch(() => {
      pending.delete(code);
      return loaded.get('en')!;
    });
  pending.set(code, request);
  return request;
}

/** Substitute Android positional placeholders (%1$s, %2$d) and %% escapes. */
export function formatPattern(pattern: string, params: ReadonlyArray<string | number> = []): string {
  let positional = false;
  const replaced = pattern.replace(/%(\d+)\$([sd])/g, (_, index: string, kind: string) => {
    positional = true;
    const value = params[Number(index) - 1];
    if (value === undefined) return _;
    return kind === 'd' ? String(Math.trunc(Number(value))) : String(value);
  });
  if (positional) return replaced.replace(/%%/g, '%');
  let sequential = 0;
  return replaced.replace(/%[sd]/g, (token) => {
    const value = params[sequential++];
    return value === undefined ? token : String(value);
  }).replace(/%%/g, '%');
}

function lookup(tables: LocaleTables | undefined, key: string): string | undefined {
  return tables?.strings[key];
}

/** Typed lookup with visible English fallback for missing keys. */
export function translate(locale: string, key: string, params: ReadonlyArray<string | number> = []): string {
  const pattern = lookup(loaded.get(locale), key) ?? lookup(loaded.get('en'), key) ?? key;
  return formatPattern(pattern, params);
}

/** Quantity-aware lookup via Intl.PluralRules with other → English fallback. */
export function translatePlural(locale: string, key: string, count: number, params: ReadonlyArray<string | number> = []): string {
  const tables = loaded.get(locale);
  const quantities = tables?.plurals[key];
  let pattern: string | undefined;
  if (quantities) {
    let category = 'other';
    try {
      category = new Intl.PluralRules(locale).select(count);
    } catch {
      category = 'other';
    }
    pattern = quantities[category] ?? quantities.other;
  }
  pattern ??= loaded.get('en')?.plurals[key]?.other ?? loaded.get('en')?.plurals[key]?.one ?? key;
  return formatPattern(pattern, [count, ...params]);
}

export function applyDocumentLocale(code: string): void {
  document.documentElement.lang = code;
  document.documentElement.dir = isRtl(code) ? 'rtl' : 'ltr';
}

type AboutLocale = { language?: string; languages?: Array<{ code: string; label: string }> };

/** Current UI locale from the saved language (device → navigator), preloading its catalog. */
export function useLocale(): { code: string; t: (key: string, params?: ReadonlyArray<string | number>) => string; tp: (key: string, count: number, params?: ReadonlyArray<string | number>) => string } {
  const about = useFeatureSnapshot<AboutLocale>('about');
  const [code, setCode] = useState(() => pickLocale(about?.language, navigator.languages ?? []));
  useEffect(() => {
    const next = pickLocale(about?.language, navigator.languages ?? []);
    let active = true;
    void loadLocale(next).then(() => { if (active) { setCode(next); setActiveLocale(next); applyDocumentLocale(next); } });
    return () => { active = false; };
  }, [about?.language]);
  useEffect(() => { applyDocumentLocale(code); }, [code]);
  return {
    code,
    t: (key, params) => translate(code, key, params),
    tp: (key, count, params) => translatePlural(code, key, count, params),
  };
}

/** Locale-aware number, file-size, date, and duration rendering. */
export function formatCount(locale: string, value: number): string {
  try {
    return new Intl.NumberFormat(locale).format(value);
  } catch {
    return String(value);
  }
}

export function formatBytes(locale: string, bytes: number): string {
  const gb = bytes / 1024 ** 3;
  const amount = gb >= 1 ? gb.toFixed(1) : String(Math.round(bytes / 1024 ** 2));
  const unit = gb >= 1 ? 'GB' : 'MB';
  try {
    const formatted = new Intl.NumberFormat(locale, { minimumFractionDigits: gb >= 1 ? 1 : 0, maximumFractionDigits: gb >= 1 ? 1 : 0 }).format(gb >= 1 ? gb : Math.round(bytes / 1024 ** 2));
    return `${formatted} ${unit}`;
  } catch {
    return `${amount} ${unit}`;
  }
}

export function formatDate(locale: string, iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  try {
    return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
  } catch {
    return iso.slice(0, 10);
  }
}
