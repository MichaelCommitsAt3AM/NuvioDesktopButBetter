import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { call, refreshFeature, useFeatureSnapshot } from '../../bridge';
import { InlineError } from '../../components/Status';
import { PageHeader } from '../../components/ui';
import { BitrateCustomRows, BitrateScale, DataUseGrid, type DataUse } from './BitrateControls';
import { ResetRow, SettingsGroup, SettingsSection, SizeSection, SwitchRow } from './FilterSettingsShared';
import './downloads.css';

export type DownloadFilter = {
  maxResolution: string; maxSizeBytes: number; showUnknownSizeStreams: boolean; allowedSources: string[]; minMaxSizeBytes: number; maxMaxSizeBytes: number;
  bitrateLimitEnabled: boolean; maxBitrateKbps: number; scaleBitrateByCodec: boolean; minMaxBitrateKbps: number; maxMaxBitrateKbps: number;
  dataUse?: DataUse; resolutions?: string[]; tierLimitsKbps?: Record<string, number>; levelKbps?: Record<string, number>; choicesKbps?: Record<string, number[]>;
};
type Snapshot = { filter: DownloadFilter };

/** Pages that open the filter (Downloads) pass `{ returnTo }` so Back leads there instead of Settings. */
export type DownloadFiltersLocationState = { returnTo?: string };

/**
 * Limits for the Download button's quality options (ported from NuvioMobileButBetter): a data use
 * level for every resolution at once, or a limit per resolution under Custom, plus a size cap.
 * The streams list's Data Saver mode has its own rules on the Data Saver page.
 */
export function DownloadFiltersPage() {
  const returnTo = (useLocation().state as DownloadFiltersLocationState | null)?.returnTo;
  const snapshot = useFeatureSnapshot<Snapshot>('downloads');
  const filter = snapshot?.filter;
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { void refreshFeature('downloads').catch(e => setError(String(e))); }, []);
  const save = async (method: string, params = {}) => {
    setBusy(true); setError('');
    try { await call(method, params); await refreshFeature('downloads'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  };
  const dataUse = filter?.dataUse ?? 'balanced';
  const limits = filter?.tierLimitsKbps ?? {};
  return <div className="page settings-page download-filter-page">
    <Link to={returnTo ?? '/settings'} className="back-button settings-page-back" aria-label={returnTo ? 'Back' : 'Back to Settings'}><ArrowLeft /></Link>
    <PageHeader title="Download filter" />
    <p className="filter-page-intro">Limits for the Download button's quality options.</p>
    {error && <InlineError message={error} />}
    {!filter ? <div className="loading-block">Loading download filters…</div> : <>
      <SettingsSection title="Quality">
        <SettingsGroup>
          <SwitchRow title="Limit by bitrate" description="Compares file size to runtime, so long films aren't penalised." checked={filter.bitrateLimitEnabled} disabled={busy} onChange={enabled => void save('downloads.filter.setBitrateLimitEnabled', { enabled })} />
          {filter.bitrateLimitEnabled && <>
            <div className="bitrate-card">
              <DataUseGrid selected={dataUse} levelKbps={filter.levelKbps ?? {}} disabled={busy} onSelect={preset => void save('downloads.filter.setDataUse', { preset: preset.toUpperCase() })} />
              {dataUse === 'custom' && <BitrateCustomRows heading="Largest bitrate · click to change" tiers={filter.resolutions ?? []} values={limits} choices={filter.choicesKbps ?? {}} disabled={busy}
                onChange={(tier, kbps) => void save('downloads.filter.setTierBitrateKbps', { tier: tier.toUpperCase(), kbps })} />}
              <BitrateScale kbps={limits.fhd_1080 ?? filter.maxBitrateKbps} />
            </div>
            <SwitchRow title="Allow less for HEVC / AV1" description="HEVC and AV1 get a lower limit, since they look as good at less bitrate." checked={filter.scaleBitrateByCodec} disabled={busy} onChange={enabled => void save('downloads.filter.setScaleBitrateByCodec', { enabled })} />
          </>}
        </SettingsGroup>
      </SettingsSection>
      <SizeSection maxSizeBytes={filter.maxSizeBytes} minBytes={filter.minMaxSizeBytes} maxBytes={filter.maxMaxSizeBytes} showUnknown={filter.showUnknownSizeStreams} disabled={busy}
        onSize={bytes => void save('downloads.filter.setMaxSizeBytes', { bytes })} onShowUnknown={enabled => void save('downloads.filter.setShowUnknownSize', { enabled })} />
      <ResetRow description="Restore the default bitrate and size limits." confirmTitle="Reset download filter?" confirmDescription="The bitrate and size limits go back to 6 Mbps at 1080p and 15 GB." disabled={busy} onReset={() => void save('downloads.filter.reset')} />
    </>}
  </div>;
}
