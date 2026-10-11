import { useEffect, useState } from 'react';
import { ArrowLeft, RotateCcw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { call, refreshFeature, useFeatureSnapshot } from '../../bridge';
import { InlineError } from '../../components/Status';
import { PageHeader } from '../../components/ui';
import './downloads.css';

export type DownloadFilter = { maxResolution: string; maxSizeBytes: number; showUnknownSizeStreams: boolean; allowedSources: string[]; minMaxSizeBytes: number; maxMaxSizeBytes: number };
type Snapshot = { filter: DownloadFilter };
const RESOLUTIONS = [
  ['uhd_4k', '2160p (4K)'], ['fhd_1080', '1080p'], ['hd_720', '720p'], ['sd', '480p & below'],
] as const;
const SOURCES = [
  ['webdl', 'WEB-DL'], ['webrip', 'WEBRip'], ['hdtv', 'HDTV'], ['dvd', 'DVD'], ['cam', 'Cam / TS'], ['bluray', 'Blu-ray'], ['remux', 'Remux'],
] as const;
const GB = 1024 ** 3;

export function DownloadFiltersPage() {
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
  const maxGb = filter ? Math.max(1, Math.min(20, Math.round(filter.maxSizeBytes / GB))) : 8;
  return <div className="page settings-page download-filter-page">
    <Link to="/settings" className="back-button settings-page-back" aria-label="Back to Settings"><ArrowLeft /></Link>
    <PageHeader title="Download filter" />
    <p className="download-filter-intro">Data Saver filters the streams list down to smaller, download-friendly files. Customize what counts as data-friendly below.</p>
    {error && <InlineError message={error} />}
    {!filter ? <div className="loading-block">Loading download filters…</div> : <>
      <section className="download-filter-section">
        <h2>Maximum resolution</h2>
        <p>Hide streams above this resolution while Data Saver is on.</p>
        <div className="download-filter-group" role="radiogroup" aria-label="Maximum resolution">
          {RESOLUTIONS.map(([value, label]) => <label className="download-filter-option" key={value}>
            <span>{label}</span><input type="radio" name="max-resolution" checked={filter.maxResolution === value} disabled={busy} onChange={() => void save('downloads.filter.setMaxResolution', { tier: value })} />
          </label>)}
        </div>
      </section>
      <section className="download-filter-section">
        <h2>Allowed file types</h2>
        <p>Only show these source types while Data Saver is on.</p>
        <div className="download-filter-group" aria-label="Allowed file types">
          {SOURCES.map(([value, label]) => <label className="download-filter-option" key={value}>
            <span>{label}</span><input type="checkbox" checked={filter.allowedSources.includes(value)} disabled={busy} onChange={event => void save('downloads.filter.setSourceAllowed', { source: value.toUpperCase(), allowed: event.target.checked })} />
          </label>)}
        </div>
      </section>
      <section className="download-filter-section">
        <h2>Maximum size</h2>
        <p>Hide streams larger than this size while Data Saver is on.</p>
        <div className="download-filter-group">
          <div className="download-filter-slider">
            <strong>Up to {maxGb} GB</strong>
            <input aria-label="Maximum file size" type="range" min={Math.ceil(filter.minMaxSizeBytes / GB)} max={Math.floor(filter.maxMaxSizeBytes / GB)} step="1" value={maxGb} disabled={busy} onChange={event => void save('downloads.filter.setMaxSizeBytes', { bytes: Number(event.target.value) * GB })} />
          </div>
          <label className="download-filter-option download-filter-unknown">
            <span><strong>Show streams with unknown size</strong><small>Off by default. When off, streams that don’t report a file size are hidden while Data Saver is on.</small></span>
            <input type="checkbox" checked={filter.showUnknownSizeStreams} disabled={busy} onChange={event => void save('downloads.filter.setShowUnknownSize', { enabled: event.target.checked })} />
          </label>
        </div>
      </section>
      <button className="download-filter-reset" disabled={busy} onClick={() => void save('downloads.filter.reset')}><span><strong>Reset to defaults</strong><small>Restore 1080p WEB-DL / WEBRip defaults.</small></span><RotateCcw size={19} /></button>
    </>}
  </div>;
}
