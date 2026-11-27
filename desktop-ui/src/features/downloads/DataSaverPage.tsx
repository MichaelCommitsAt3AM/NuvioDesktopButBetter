import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { call, refreshFeature, useFeatureSnapshot } from '../../bridge';
import { InlineError } from '../../components/Status';
import { PageHeader } from '../../components/ui';
import { BitrateCustomRows, BitrateScale, CardHeading, DataUseGrid, ResolutionSegments, type DataUse } from './BitrateControls';
import { ResetRow, SelectableRow, SettingsGroup, SettingsSection, SizeSection, SOURCES, SwitchRow } from './FilterSettingsShared';
import './downloads.css';

export type DataSaverSnapshot = {
  enabled: boolean; dataUse: DataUse; maxResolution: string; resolutions: string[];
  targetsKbps: Record<string, number>; levelKbps: Record<string, number>; choicesKbps: Record<string, number[]>;
  allowedSources: string[]; maxSizeBytes: number; minMaxSizeBytes: number; maxMaxSizeBytes: number; showUnknownSizeStreams: boolean;
};

/** Resolution ranks, to offer custom targets only up to the maximum resolution. */
const RANK: Record<string, number> = { sd: 1, hd_720: 2, fhd_1080: 3, uhd_4k: 4 };

export type DataSaverLocationState = { returnTo?: string };

/**
 * Data Saver (ported from NuvioMobileButBetter's Data Saver page). While on, auto-pick takes the
 * stream closest to each resolution's target, the streams list opens in Data Saver mode with
 * these rules, and trailers don't play on their own.
 */
export function DataSaverPage() {
  const returnTo = (useLocation().state as DataSaverLocationState | null)?.returnTo;
  const snapshot = useFeatureSnapshot<DataSaverSnapshot>('dataSaver');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { void refreshFeature('dataSaver').catch(e => setError(String(e))); }, []);
  const save = async (method: string, params = {}) => {
    setBusy(true); setError('');
    try { await call(method, params); await refreshFeature('dataSaver'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  };
  const s = snapshot;
  const lowestFirst = [...(s?.resolutions ?? [])].reverse();
  const targetTiers = (s?.resolutions ?? []).filter(tier => (RANK[tier] ?? 0) <= (RANK[s?.maxResolution ?? ''] ?? 0));
  return <div className="page settings-page download-filter-page data-saver-page">
    {/* Back goes to Settings, where Data Saver is listed, unless the opener passed { returnTo } (Playback, Streams). */}
    <Link to={returnTo ?? '/settings'} className="back-button settings-page-back" aria-label={returnTo ? 'Back' : 'Back to Settings'}><ArrowLeft /></Link>
    <PageHeader title="Data Saver" />
    {error && <InlineError message={error} />}
    {!s ? <div className="loading-block">Loading Data Saver…</div> : <>
      <SettingsGroup>
        <SwitchRow title="Data Saver" description="Auto-picks a good-sized stream, opens the streams list in Data Saver mode and stops trailers playing on their own." checked={s.enabled} disabled={busy} onChange={enabled => void save('dataSaver.setEnabled', { enabled })} />
      </SettingsGroup>
      <SettingsSection title="Quality">
        <SettingsGroup>
          <div className="bitrate-card">
            <CardHeading>Max resolution</CardHeading>
            <ResolutionSegments options={lowestFirst} selected={s.maxResolution} disabled={busy} onSelect={tier => void save('dataSaver.setMaxResolution', { tier: tier.toUpperCase() })} />
          </div>
          <div className="bitrate-card">
            <DataUseGrid selected={s.dataUse} levelKbps={s.levelKbps} disabled={busy} onSelect={preset => void save('dataSaver.setDataUse', { preset: preset.toUpperCase() })} />
            {s.dataUse === 'custom' && <BitrateCustomRows heading="Target bitrate · click to change" tiers={targetTiers} values={s.targetsKbps} choices={s.choicesKbps} disabled={busy}
              onChange={(tier, kbps) => void save('dataSaver.setTargetKbps', { tier: tier.toUpperCase(), kbps })} />}
            <BitrateScale kbps={s.targetsKbps[s.maxResolution] ?? 0} />
          </div>
        </SettingsGroup>
      </SettingsSection>
      <p className="filter-page-intro">Data Saver filters the streams list down to smaller, download-friendly files. Customize what counts as data-friendly below.</p>
      <SettingsSection title="Allowed file types">
        <p className="filter-section-note">Only show these source types while Data Saver is on.</p>
        <SettingsGroup label="Allowed file types">
          {SOURCES.map(([value, label]) => <SelectableRow key={value} label={label} selected={s.allowedSources.includes(value)} disabled={busy} onToggle={allowed => void save('dataSaver.setSourceAllowed', { source: value.toUpperCase(), allowed })} />)}
        </SettingsGroup>
      </SettingsSection>
      <SizeSection maxSizeBytes={s.maxSizeBytes} minBytes={s.minMaxSizeBytes} maxBytes={s.maxMaxSizeBytes} showUnknown={s.showUnknownSizeStreams} disabled={busy}
        onSize={bytes => void save('dataSaver.setMaxSizeBytes', { bytes })} onShowUnknown={enabled => void save('dataSaver.setShowUnknownSize', { enabled })} />
      <ResetRow description="Restore the 1080p, low data use, WEB-DL / WEBRip defaults." confirmTitle="Reset Data Saver?" confirmDescription="Every setting on this page goes back to the 1080p, low data use, WEB-DL / WEBRip defaults." disabled={busy} onReset={() => void save('dataSaver.reset')} />
    </>}
  </div>;
}
