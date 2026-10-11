import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { call, refreshFeature, useFeatureSnapshot } from '../../bridge';
import { InlineError } from '../../components/Status';
import { PageHeader } from '../../components/ui';

export type DownloadFilter = { maxResolution: string; maxSizeBytes: number; showUnknownSizeStreams: boolean; allowedSources: string[]; minMaxSizeBytes: number; maxMaxSizeBytes: number };
type Snapshot = { filter: DownloadFilter };
export function DownloadFiltersPage() {
  const snapshot = useFeatureSnapshot<Snapshot>('downloads');
  const filter = snapshot?.filter;
  const [error, setError] = useState('');
  const [size, setSize] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { void refreshFeature('downloads').catch(e => setError(String(e))); }, []);
  useEffect(() => { if (filter) setSize(String(filter.maxSizeBytes / 1024 ** 3)); }, [filter?.maxSizeBytes]);
  const save = async (method: string, params = {}) => {
    setBusy(true); setError('');
    try { await call(method, params); await refreshFeature('downloads'); }
    catch(e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  return <div className="page settings-page"><Link to="/settings" className="back-button">Back to Settings</Link><PageHeader title="Download filters" subtitle="Choose the streams shown when Data saver is selected." />{error && <InlineError message={error} />}{filter ? <section className="settings-section">
    <div className="settings-control-row"><strong>Maximum resolution</strong><select disabled={busy} value={filter.maxResolution} onChange={e => void save('downloads.filter.setMaxResolution', { tier: e.target.value })}>{[['sd','SD'],['hd_720','720p'],['fhd_1080','1080p'],['uhd_4k','4K']].map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></div>
    <div className="settings-control-row"><strong>Maximum file size (GB)</strong><input aria-label="Maximum file size in GB" type="number" min={filter.minMaxSizeBytes / 1024 ** 3} max={filter.maxMaxSizeBytes / 1024 ** 3} step="0.25" value={size} onChange={e => setSize(e.target.value)} onBlur={() => { const bytes = Math.round(Number(size) * 1024 ** 3); if (Number.isFinite(bytes) && bytes >= filter.minMaxSizeBytes && bytes <= filter.maxMaxSizeBytes && bytes !== filter.maxSizeBytes) void save('downloads.filter.setMaxSizeBytes', { bytes }); else setSize(String(filter.maxSizeBytes / 1024 ** 3)); }} /></div>
    <label className="settings-control-row"><strong>Show streams with unknown file size</strong><input type="checkbox" disabled={busy} checked={filter.showUnknownSizeStreams} onChange={e => void save('downloads.filter.setShowUnknownSize', { enabled: e.target.checked })} /></label>
    <h2>Allowed sources</h2>{['remux','bluray','webdl','webrip','hdtv','dvd','cam','unknown'].map(source => <label className="settings-control-row" key={source}><strong>{source.toUpperCase()}</strong><input type="checkbox" disabled={busy} checked={filter.allowedSources.includes(source)} onChange={e => void save('downloads.filter.setSourceAllowed', { source, allowed: e.target.checked })} /></label>)}
    <button className="button secondary" disabled={busy} onClick={() => void save('downloads.filter.reset')}>Reset filters to defaults</button>
  </section> : <div className="loading-block">Loading download filters…</div>}</div>;
}
