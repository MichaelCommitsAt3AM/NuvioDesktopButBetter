import { useEffect, useState } from 'react';
import { Download, Pause, Play, RotateCw, Trash2 } from 'lucide-react';
import { call, refreshFeature, useFeatureSnapshot } from '../../bridge';
import { Dialog } from '../../components/Dialog';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/ui';
import { InlineError } from '../../components/Status';
import './downloads.css';

type DownloadItem = { id: string; title: string; poster: string | null; parentMetaId: string; parentMetaType: string; seasonNumber: number | null; episodeNumber: number | null; episodeTitle: string | null; status: string; downloadedBytes: number; totalBytes: number | null; progress: number; error: string | null; playable: boolean };
type Downloads = { items: DownloadItem[]; hasUnseenCompleted: boolean; filter: { maxResolution: string; maxSizeBytes: number; showUnknownSizeStreams: boolean; allowedSources: string[] } };
const bytes = (value: number) => value >= 1024 ** 3 ? `${(value / 1024 ** 3).toFixed(1)} GB` : `${(value / 1024 ** 2).toFixed(1)} MB`;

export function DownloadsPage() {
  const snapshot = useFeatureSnapshot<Downloads>('downloads');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [removing, setRemoving] = useState<DownloadItem | null>(null);
  const [filter, setFilter] = useState('all');
  const [query,setQuery] = useState('');
  const [contentType,setContentType] = useState('all');
  const refresh = async () => { try { await refreshFeature('downloads'); setError(''); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } };
  useEffect(() => { void refresh(); void call('downloads.markSeen').catch(() => {}); }, []);
  const run = async (method: string, id: string) => {
    setBusy(id); setError('');
    try { await call(method, { id }); await refresh(); setRemoving(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(''); }
  };
  const items = (snapshot?.items ?? []).filter(item => (filter === 'all' || (filter === 'completed' ? item.status === 'completed' : item.status !== 'completed')) && (contentType === 'all' || (contentType === 'series' ? item.seasonNumber != null : item.seasonNumber == null)) && `${item.title} ${item.episodeTitle ?? ''}`.toLowerCase().includes(query.toLowerCase()));
  const groups = [...items.reduce((map,item) => { const key = `${item.parentMetaType}:${item.parentMetaId}`; const group = map.get(key) ?? { key,title:item.title,series:item.seasonNumber != null,items:[] as DownloadItem[] }; group.items.push(item); map.set(key,group); return map; }, new Map<string,{ key:string;title:string;series:boolean;items:DownloadItem[] }>()).values()];
  return <div className="page downloads-page"><Link className="back-button" to="/library">Back to Library</Link><PageHeader title="Downloads" subtitle="Watch downloaded movies and episodes offline." action={<Link className="button secondary" to="/settings/downloads">Data saver preferences</Link>} />
    {error && <InlineError message={error} onRetry={() => void refresh()} />}
    <div className="downloads-tabs" role="group" aria-label="Filter downloads">{['all', 'active', 'completed'].map(value => <button className={`button ${filter === value ? 'primary' : 'secondary'}`} key={value} onClick={() => setFilter(value)}>{value}</button>)}</div>
    <div className="download-search"><input aria-label="Search downloads" placeholder="Search downloads" value={query} onChange={e => setQuery(e.target.value)} /><select aria-label="Download type" value={contentType} onChange={e => setContentType(e.target.value)}><option value="all">Movies and series</option><option value="movies">Movies</option><option value="series">Series</option></select></div>
    {!snapshot && !error && <div className="loading-block">Loading downloads…</div>}
    {snapshot && !items.length && <div className="downloads-empty"><Download size={36} /><h2>No {filter === 'all' ? '' : filter} downloads</h2><p>Select Download beside a compatible stream to save it for offline viewing.</p></div>}
    <div className="download-list">{groups.map(group => <details open className="download-group" key={group.key}><summary><strong>{group.title}</strong><span>{group.series ? `${group.items.length} episodes` : 'Movie'} · {group.items.filter(item => item.status === 'completed').length} completed</span></summary>{group.items.sort((a,b) => (a.seasonNumber ?? 0)-(b.seasonNumber ?? 0) || (a.episodeNumber ?? 0)-(b.episodeNumber ?? 0)).map(item => <article className="download-card" key={item.id}>
      {item.poster ? <img src={item.poster} alt="" /> : <div className="download-art"><Download /></div>}
      <div className="download-copy"><h2>{item.title}</h2>{item.seasonNumber != null && <p>Season {item.seasonNumber} · Episode {item.episodeNumber} {item.episodeTitle && `· ${item.episodeTitle}`}</p>}<p>{item.status} · {bytes(item.downloadedBytes)}{item.totalBytes != null && ` / ${bytes(item.totalBytes)}`}</p><progress max={1} value={item.progress} aria-label={`${item.title} download progress`} />{item.error && <p className="form-error">{item.error}</p>}</div>
      <div className="download-actions">
        {item.playable && <button className="button primary" disabled={busy === item.id} onClick={() => void run('downloads.play', item.id)}><Play size={16} /> Play</button>}
        {['queued', 'downloading'].includes(item.status) && <button className="icon-button" aria-label="Pause download" disabled={busy === item.id} onClick={() => void run('downloads.pause', item.id)}><Pause /></button>}
        {item.status === 'paused' && <button className="icon-button" aria-label="Resume download" disabled={busy === item.id} onClick={() => void run('downloads.resume', item.id)}><Play /></button>}
        {item.status === 'failed' && <button className="icon-button" aria-label="Retry download" disabled={busy === item.id} onClick={() => void run('downloads.retry', item.id)}><RotateCw /></button>}
        <button className="icon-button" aria-label={`Remove ${item.title}`} disabled={busy === item.id} onClick={() => setRemoving(item)}><Trash2 /></button>
      </div>
    </article>)}</details>)}</div>
    {removing && <Dialog label="Remove download" onClose={() => setRemoving(null)}><h2>Remove {removing.title}?</h2><p>This cancels the download and deletes its saved file from this device.</p><div className="dialog-actions"><button className="button secondary" onClick={() => setRemoving(null)}>Keep download</button><button className="button primary" disabled={busy === removing.id} onClick={() => void run('downloads.remove', removing.id)}>Remove download</button></div></Dialog>}
  </div>;
}
