import { useEffect, useState } from 'react';
import { Download, FolderOpen, Pause, Play, RotateCw, SlidersHorizontal, Trash2 } from 'lucide-react';
import { call, refreshFeature, useFeatureSnapshot } from '../../bridge';
import { Dialog } from '../../components/Dialog';
import { Link, useNavigate, useNavigationType } from 'react-router-dom';
import { BackButton } from '../../components/BackButton';
import { PageHeader } from '../../components/ui';
import { InlineError } from '../../components/Status';
import { scrollKey, useActiveProfileId, useListScrollRestore } from '../../navigation/scrollStore';
import { useLocale } from '../../i18n/strings';
import './downloads.css';

type DownloadItem = { id: string; title: string; poster: string | null; parentMetaId: string; parentMetaType: string; seasonNumber: number | null; episodeNumber: number | null; episodeTitle: string | null; status: string; downloadedBytes: number; totalBytes: number | null; progress: number; error: string | null; playable: boolean };
type Downloads = { items: DownloadItem[]; hasUnseenCompleted: boolean; filter: { maxResolution: string; maxSizeBytes: number; showUnknownSizeStreams: boolean; allowedSources: string[] } };
const bytes = (value: number) => value >= 1024 ** 3 ? `${(value / 1024 ** 3).toFixed(1)} GB` : `${(value / 1024 ** 2).toFixed(1)} MB`;

export function DownloadsPage() {
  const navigate = useNavigate();
  const snapshot = useFeatureSnapshot<Downloads>('downloads');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [removing, setRemoving] = useState<DownloadItem | null>(null);
  const [filter, setFilter] = useState('all');
  const [query,setQuery] = useState('');
  const [contentType,setContentType] = useState('all');
  const navigationType = useNavigationType();
  const profileId = useActiveProfileId();
  const { t } = useLocale();
  useListScrollRestore(scrollKey(profileId, '/library/downloads', `${filter}|${contentType}|${query.trim()}`), navigationType, !!snapshot);
  const openFolder = async () => {
    setError('');
    try { await call('downloads.openFolder', {}); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  const refresh = async () => { try { await refreshFeature('downloads'); setError(''); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } };
  useEffect(() => { void refresh(); void call('downloads.markSeen').catch(() => {}); }, []);
  const run = async (method: string, id: string) => {
    setBusy(id); setError('');
    try { await call(method, { id }); await refresh(); setRemoving(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(''); }
  };
  const searchQuery = query.trim().toLowerCase();
  const items = (snapshot?.items ?? []).filter(item => (filter === 'all' || (filter === 'completed' ? item.status === 'completed' : item.status !== 'completed')) && (contentType === 'all' || (contentType === 'series' ? item.seasonNumber != null : item.seasonNumber == null)) && `${item.title} ${item.episodeTitle ?? ''}`.toLowerCase().includes(searchQuery));
  const groups = [...items.reduce((map,item) => { const key = `${item.parentMetaType}:${item.parentMetaId}`; const group = map.get(key) ?? { key,title:item.title,series:item.seasonNumber != null,items:[] as DownloadItem[] }; group.items.push(item); map.set(key,group); return map; }, new Map<string,{ key:string;title:string;series:boolean;items:DownloadItem[] }>()).values()];
  return <div className="page downloads-page"><BackButton className="downloads-back" onClick={() => navigate('/library')} /><PageHeader title={t('downloads_channel_name')} subtitle="Watch downloaded movies and episodes offline." action={<div className="downloads-header-actions"><button className="button secondary" type="button" aria-label={t('downloads_open_directory')} onClick={() => void openFolder()}><FolderOpen size={19} aria-hidden="true" /><span>Open folder</span></button><Link className="button secondary downloads-preferences" to="/settings/downloads" aria-label="Data saver preferences" title="Data saver preferences"><SlidersHorizontal size={19} aria-hidden="true" /></Link></div>} />
    {error && <InlineError message={error} onRetry={() => void refresh()} />}
    <div className="downloads-tabs" role="group" aria-label="Filter downloads">{['all', 'active', 'completed'].map(value => <button className={`button ${filter === value ? 'primary' : 'secondary'}`} key={value} onClick={() => setFilter(value)}>{value === 'active' ? t('downloads_section_active') : value}</button>)}</div>
    <div className="download-search"><input aria-label="Search downloads" placeholder="Search downloads" value={query} onChange={e => setQuery(e.target.value)} /><select aria-label="Download type" value={contentType} onChange={e => setContentType(e.target.value)}><option value="all">All</option><option value="movies">{t('downloads_section_movies')}</option><option value="series">{t('downloads_section_shows')}</option></select></div>
    {!snapshot && !error && <div className="loading-block">Loading downloads…</div>}
    {snapshot && !items.length && <div className="downloads-empty"><Download size={28} /><h2>{filter === 'all' ? t('downloads_empty_title') : filter}</h2><p>Right-click a compatible stream and choose Download file to save it for offline viewing.</p></div>}
    <div className="download-list">{groups.map(group => <details open className="download-group" key={group.key}><summary><strong>{group.title}</strong><span>{group.series ? `${group.items.length} episodes` : 'Movie'} · {group.items.filter(item => item.status === 'completed').length} completed</span></summary>{group.items.sort((a,b) => (a.seasonNumber ?? 0)-(b.seasonNumber ?? 0) || (a.episodeNumber ?? 0)-(b.episodeNumber ?? 0)).map(item => <article className="download-card" key={item.id}>
      {item.poster ? <img src={item.poster} alt="" /> : <div className="download-art"><Download /></div>}
      <div className="download-copy"><h2>{item.title}</h2>{item.seasonNumber != null && <p>Season {item.seasonNumber} · Episode {item.episodeNumber} {item.episodeTitle && `· ${item.episodeTitle}`}</p>}<p>{item.status} · {bytes(item.downloadedBytes)}{item.totalBytes != null && ` / ${bytes(item.totalBytes)}`}</p><progress max={1} value={item.progress} aria-label={`${item.title} download progress`} />{item.error && <p className="form-error">{item.error}</p>}</div>
      <div className="download-actions">
        {item.playable && <button className="button primary" disabled={busy === item.id} onClick={() => void run('downloads.play', item.id)}><Play size={16} /> {t('action_play')}</button>}
        {['queued', 'downloading'].includes(item.status) && <button className="icon-button" aria-label={t('compose_action_pause')} disabled={busy === item.id} onClick={() => void run('downloads.pause', item.id)}><Pause /></button>}
        {item.status === 'paused' && <button className="icon-button" aria-label={t('action_resume')} disabled={busy === item.id} onClick={() => void run('downloads.resume', item.id)}><Play /></button>}
        {item.status === 'failed' && <button className="icon-button" aria-label={t('action_retry')} disabled={busy === item.id} onClick={() => void run('downloads.retry', item.id)}><RotateCw /></button>}
        <button className="icon-button" aria-label={`Remove ${item.title}`} disabled={busy === item.id} onClick={() => setRemoving(item)}><Trash2 /></button>
      </div>
    </article>)}</details>)}</div>
    {removing && <Dialog label="Remove download" onClose={() => setRemoving(null)}><h2>Remove {removing.title}?</h2><p>This cancels the download and deletes its saved file from this device.</p><div className="dialog-actions"><button className="button secondary" onClick={() => setRemoving(null)}>{t('action_cancel')}</button><button className="button primary" disabled={busy === removing.id} onClick={() => void run('downloads.remove', removing.id)}>{t('action_remove')}</button></div></Dialog>}
  </div>;
}
