import type { CSSProperties, ReactNode } from 'react';
import { DropdownRow } from './FilterSettingsShared';

/**
 * Bitrate controls shared by the Download filter and Data Saver pages, ported from
 * NuvioMobileButBetter's BitrateQualityCards.kt: the data use tiles, the per-resolution
 * dropdowns shown under Custom, and the scale that marks common streaming levels.
 */
export type DataUse = 'low' | 'balanced' | 'high' | 'custom';
export const DATA_USE_LEVELS: DataUse[] = ['low', 'balanced', 'high', 'custom'];
const DATA_USE_TITLES: Record<DataUse, string> = { low: 'Low', balanced: 'Balanced', high: 'High', custom: 'Custom' };

/** Short resolution names, as on mobile. */
export const TIER_LABELS: Record<string, string> = { uhd_4k: '4K', fhd_1080: '1080p', hd_720: '720p', sd: '480p' };

/** Data used per hour at [kbps], in GB (decimal, as on mobile). */
export function gigabytesPerHour(kbps: number) { return kbps * 1_000 / 8 * 3_600 / 1_000_000_000; }

/** One decimal place: "2.7". */
export function oneDecimal(value: number) { return (Math.round(value * 10) / 10).toFixed(1); }

/** "6", "2.4", "0.5": Mbps with one decimal place only when needed. */
export function formatMbps(kbps: number) {
  const tenths = Math.floor((kbps + 50) / 100);
  return tenths % 10 === 0 ? `${tenths / 10}` : `${Math.floor(tenths / 10)}.${tenths % 10}`;
}

export function CardHeading({ children }: { children: ReactNode }) {
  return <h3 className="bitrate-card-heading">{children}</h3>;
}

/** Low / Balanced / High / Custom in a two-by-two grid; the levels show their data per hour. */
export function DataUseGrid({ selected, levelKbps, disabled, onSelect }: { selected: string; levelKbps: Record<string, number>; disabled?: boolean; onSelect: (level: DataUse) => void }) {
  return <div className="bitrate-data-use">
    <CardHeading>Data use</CardHeading>
    <div className="bitrate-data-use-grid" role="radiogroup" aria-label="Data use">
      {DATA_USE_LEVELS.map(level => <button type="button" key={level} role="radio" aria-checked={selected === level}
        className={`bitrate-data-use-tile${selected === level ? ' selected' : ''}`} disabled={disabled} onClick={() => onSelect(level)}>
        <strong>{DATA_USE_TITLES[level]}</strong>
        <span>{level === 'custom' ? 'Set each bitrate' : `~${oneDecimal(gigabytesPerHour(levelKbps[level] ?? 0))} GB/h`}</span>
      </button>)}
    </div>
  </div>;
}

/** The per-resolution dropdowns under Custom, in their own inset panel (each opens an options sheet). */
export function BitrateCustomRows({ heading, tiers, values, choices, disabled, onChange }: {
  heading: string; tiers: string[]; values: Record<string, number>; choices: Record<string, number[]>; disabled?: boolean;
  onChange: (tier: string, kbps: number) => void;
}) {
  return <div className="bitrate-custom-rows">
    <p>{heading}</p>
    {tiers.map(tier => {
      const current = values[tier] ?? 0;
      const options = [...new Set([...(choices[tier] ?? []), current])].sort((a, b) => a - b)
        .map(kbps => ({ key: String(kbps), label: `${formatMbps(kbps)} Mbps · ${oneDecimal(gigabytesPerHour(kbps))} GB/h` }));
      return <DropdownRow key={tier} title={TIER_LABELS[tier] ?? tier} selectedLabel={`${formatMbps(current)} Mbps`} selectedKey={String(current)} options={options} disabled={disabled}
        onSelect={option => onChange(tier, Number(option.key))} />;
    })}
  </div>;
}

/** Common streaming levels marked on the scale, which is full at the 4K one. */
const USAGE_MARKS = [{ label: 'SD', kbps: 1_500 }, { label: 'Netflix HD', kbps: 6_000 }, { label: '4K', kbps: 16_000 }];
const SCALE_MAX_KBPS = 16_000;

/** The bar: filled to [kbps], with a tick and a label for each streaming level. */
export function BitrateScale({ kbps }: { kbps: number }) {
  const fill = Math.min(1, Math.max(0.02, kbps / SCALE_MAX_KBPS));
  return <div className="bitrate-scale" role="img" aria-label={`${formatMbps(kbps)} Mbps`}>
    <div className="bitrate-scale-labels">{USAGE_MARKS.map((mark, index) => <span key={mark.label} className={index === USAGE_MARKS.length - 1 ? 'end' : ''} style={{ left: `${mark.kbps / SCALE_MAX_KBPS * 100}%` }}>{mark.label}</span>)}</div>
    <div className="bitrate-scale-track">
      <div className="bitrate-scale-fill" style={{ width: `${fill * 100}%` }} />
      {USAGE_MARKS.map(mark => <i key={mark.label} style={{ left: `${mark.kbps / SCALE_MAX_KBPS * 100}%` }} />)}
    </div>
    <small>0</small>
  </div>;
}

/** Lowest-first resolution choice (720p, 1080p, 4K); the fill behind the selected one slides between them. */
export function ResolutionSegments({ options, selected, disabled, onSelect }: { options: string[]; selected: string; disabled?: boolean; onSelect: (tier: string) => void }) {
  const index = options.indexOf(selected);
  const style = { '--segment-count': options.length, '--segment-index': Math.max(0, index) } as CSSProperties;
  return <div className="bitrate-resolution-segments" role="radiogroup" aria-label="Max resolution" style={style}>
    {index >= 0 && <span className="bitrate-resolution-highlight" aria-hidden="true" />}
    {options.map(tier => <button type="button" key={tier} role="radio" aria-checked={selected === tier} className={selected === tier ? 'selected' : ''} disabled={disabled} onClick={() => onSelect(tier)}>{TIER_LABELS[tier] ?? tier}</button>)}
  </div>;
}
