import { useEffect, useState } from 'react';
import { ChevronRight, Folder, Pause, Play, RotateCw, SlidersHorizontal, Trash2 } from 'lucide-react';
import { call, refreshFeature, useFeatureSnapshot } from '../../bridge';
import { Dialog } from '../../components/Dialog';
import { Link, useNavigate, useNavigationType, useParams } from 'react-router-dom';
import { BackButton } from '../../components/BackButton';
import { FullscreenButton } from '../../components/FullscreenButton';
import { InlineError } from '../../components/Status';
import { scrollKey, useActiveProfileId, useListScrollRestore } from '../../navigation/scrollStore';
import { useLocale } from '../../i18n/strings';
import './downloads.css';

type DownloadItem = { id: string; title: string; poster: string | null; parentMetaId: string; parentMetaType: string; seasonNumber: number | null; episodeNumber: number | null; episodeTitle: string | null; status: string; downloadedBytes: number; totalBytes: number | null; progress: number; error: string | null; playable: boolean; createdAtEpochMs?: number };
type Downloads = { items: DownloadItem[]; hasUnseenCompleted: boolean };
type T = ReturnType<typeof useLocale>['t'];

export const DOWNLOADS_PATH = '/library/downloads';
export const downloadsShowPath = (showId: string) => `${DOWNLOADS_PATH}/show/${encodeURIComponent(showId)}`;

/** "1.2 GB" / "340.5 MB" / "12 B", truncated to one decimal like the Kotlin screen. */
export function formatDownloadBytes(value: number) {
  if (value <= 0) return '0 B';
  const units: Array<[number, string]> = [[1024 ** 3, 'GB'], [1024 ** 2, 'MB'], [1024, 'KB']];
  for (const [size, unit] of units) if (value >= size) return `${Math.floor((value / size) * 10) / 10} ${unit}`;
  return `${value} B`;
}

const isEpisode = (item: DownloadItem) => item.seasonNumber != null && item.episodeNumber != null;
const byEpisode = (a: DownloadItem, b: DownloadItem) => (a.seasonNumber ?? 0) - (b.seasonNumber ?? 0) || (a.episodeNumber ?? 0) - (b.episodeNumber ?? 0);

function statusText(item: DownloadItem, t: T) {
  const size = item.totalBytes != null && item.totalBytes > 0
    ? `${formatDownloadBytes(item.downloadedBytes)} / ${formatDownloadBytes(item.totalBytes)}`
    : formatDownloadBytes(item.downloadedBytes);
  switch (item.status) {
    case 'downloading': return t('downloads_status_downloading', [size]);
    case 'paused': return t('downloads_status_paused', [size]);
    case 'completed': return t('downloads_status_completed', [formatDownloadBytes(item.totalBytes ?? item.downloadedBytes)]);
    default: return item.error || t('downloads_status_failed');
  }
}

function displayTitle(item: DownloadItem) {
  return isEpisode(item) ? item.episodeTitle?.trim() || item.title : item.title;
}

function displaySubtitle(item: DownloadItem, t: T) {
  if (!isEpisode(item)) return '';
  const title = displayTitle(item);
  return [
    t('compose_player_episode_code_full', [item.seasonNumber!, item.episodeNumber!]),
    item.episodeTitle?.trim() && item.episodeTitle.trim() !== title ? item.episodeTitle.trim() : null,
    item.title.trim() && item.title.trim() !== title ? item.title.trim() : null,
  ].filter(Boolean).join(' • ');
}

/**
 * Downloads, laid out like the Kotlin app's screen: Active, Movies and Shows sections of compact rows. A show opens
 * its own view (`/library/downloads/show/:showId`) listing its downloaded episodes by season.
 */
export function DownloadsPage() {
  const navigate = useNavigate();
  const { showId } = useParams();
  const snapshot = useFeatureSnapshot<Downloads>('downloads');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [deleting, setDeleting] = useState<DownloadItem | null>(null);
  const navigationType = useNavigationType();
  const profileId = useActiveProfileId();
  const { t } = useLocale();
  useListScrollRestore(scrollKey(profileId, DOWNLOADS_PATH, showId ?? ''), navigationType, !!snapshot);
  const openFolder = async () => {
    setError('');
    try { await call('downloads.openFolder', {}); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  const refresh = async () => { try { await refreshFeature('downloads'); setError(''); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } };
  useEffect(() => { void refresh(); void call('downloads.markSeen').catch(() => {}); }, []);
  const run = async (method: string, id: string) => {
    setBusy(id); setError('');
    try { await call(method, { id }); await refresh(); setDeleting(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(''); }
  };

  const items = snapshot?.items ?? [];
  const completedEpisodes = items.filter(item => item.status === 'completed' && isEpisode(item)).sort(byEpisode);
  const showTitle = showId ? completedEpisodes.find(item => item.parentMetaId === showId)?.title : undefined;
  const row = (item: DownloadItem) => <DownloadRow key={item.id} item={item} busy={busy === item.id} t={t}
    onPlay={() => void run('downloads.play', item.id)} onPause={() => void run('downloads.pause', item.id)}
    onResume={() => void run('downloads.resume', item.id)} onRetry={() => void run('downloads.retry', item.id)}
    onDelete={() => setDeleting(item)} />;

  let content;
  if (!snapshot && !error) content = <div className="loading-block">Loading downloads…</div>;
  else if (showId) {
    const seasons = [...completedEpisodes.filter(item => item.parentMetaId === showId)
      .reduce((map, item) => map.set(item.seasonNumber ?? 0, [...(map.get(item.seasonNumber ?? 0) ?? []), item]), new Map<number, DownloadItem[]>())]
      .sort(([a], [b]) => a - b);
    content = seasons.length === 0
      ? <p className="downloads-empty-text">{t('downloads_empty_episodes')}</p>
      : seasons.map(([season, episodes]) => <section className="downloads-section" key={season}>
        <h2>{season === 0 ? t('episodes_specials') : t('episodes_season', [season])}</h2>
        <div className="downloads-rows">{episodes.map(row)}</div>
      </section>);
  } else {
    const active = items.filter(item => item.status !== 'completed');
    const movies = items.filter(item => item.status === 'completed' && !isEpisode(item));
    const shows = [...completedEpisodes.reduce((map, item) => map.set(item.parentMetaId, [...(map.get(item.parentMetaId) ?? []), item]), new Map<string, DownloadItem[]>()).values()]
      .sort((a, b) => a[0].title.toLowerCase().localeCompare(b[0].title.toLowerCase()));
    content = items.length === 0 ? <p className="downloads-empty-text">{t('downloads_empty_title')}</p> : <>
      {active.length > 0 && <section className="downloads-section"><h2>{t('downloads_section_active')}</h2><div className="downloads-rows">{active.map(row)}</div></section>}
      {movies.length > 0 && <section className="downloads-section"><h2>{t('downloads_section_movies')}</h2><div className="downloads-rows">{movies.map(row)}</div></section>}
      {shows.length > 0 && <section className="downloads-section"><h2>{t('downloads_section_shows')}</h2><div className="downloads-rows">{shows.map(episodes => {
        const show = episodes[0];
        return <button type="button" className="downloads-row downloads-show" key={show.parentMetaId} onClick={() => navigate(downloadsShowPath(show.parentMetaId))}>
          <span className="downloads-row-copy"><strong>{show.title}</strong><small>{t('downloads_episode_count', [episodes.length])}</small></span>
          <ChevronRight size={20} aria-hidden="true" />
        </button>;
      })}</div></section>}
    </>;
  }

  return <div className="page downloads-page">
    <FullscreenButton onError={setError} />
    {/* Back arrow and title share one row, like the Kotlin screen header. */}
    <div className="page-heading downloads-heading">
      <div className="downloads-title">
        <BackButton className="downloads-back" onClick={() => navigate(showId ? DOWNLOADS_PATH : '/library')} />
        <h1>{showId ? showTitle ?? t('downloads_show_downloads') : t('compose_settings_root_downloads_title')}</h1>
      </div>
      <div className="downloads-header-actions">
        {!showId && <Link className="icon-button" to="/settings/downloads" state={{ returnTo: DOWNLOADS_PATH }} aria-label={t('download_filter_settings_title')} title={t('download_filter_settings_title')}><SlidersHorizontal size={20} aria-hidden="true" /></Link>}
        <button className="icon-button" type="button" aria-label={t('downloads_open_directory')} title={t('downloads_open_directory')} onClick={() => void openFolder()}><Folder size={20} aria-hidden="true" /></button>
      </div>
    </div>
    {error && <InlineError message={error} onRetry={() => void refresh()} />}
    {content}
    {deleting && <Dialog label={t('action_delete_confirm_title')} onClose={() => setDeleting(null)}>
      <h2>{t('action_delete_confirm_title')}</h2><p>{t('action_delete_confirm_message')}</p>
      <div className="dialog-actions"><button className="button secondary" onClick={() => setDeleting(null)}>{t('action_no')}</button><button className="button primary destructive" disabled={busy === deleting.id} onClick={() => void run('downloads.remove', deleting.id)}>{t('action_yes')}</button></div>
    </Dialog>}
  </div>;
}

function DownloadRow({ item, busy, t, onPlay, onPause, onResume, onRetry, onDelete }: { item: DownloadItem; busy: boolean; t: T; onPlay: () => void; onPause: () => void; onResume: () => void; onRetry: () => void; onDelete: () => void }) {
  const title = displayTitle(item);
  const subtitle = displaySubtitle(item, t);
  const action = item.status === 'downloading' || item.status === 'queued' ? { label: t('compose_action_pause'), icon: <Pause size={20} />, run: onPause }
    : item.status === 'paused' ? { label: t('action_resume'), icon: <Play size={20} />, run: onResume }
      : item.status === 'failed' ? { label: t('action_retry'), icon: <RotateCw size={20} />, run: onRetry }
        : { label: t('action_play'), icon: <Play size={20} />, run: onPlay };
  return <article className={`downloads-row ${item.status} ${item.playable ? 'playable' : ''}`.trim()} aria-label={title}
    onClick={item.playable && !busy ? onPlay : undefined}>
    <div className="downloads-row-main">
      <div className="downloads-row-copy">
        <strong>{title}</strong>
        {subtitle && <small>{subtitle}</small>}
        <span className={`downloads-row-status ${item.status === 'failed' ? 'failed' : ''}`.trim()}>{statusText(item, t)}</span>
      </div>
      <div className="downloads-row-actions" onClick={event => event.stopPropagation()}>
        <button className="icon-button" type="button" aria-label={action.label} title={action.label} disabled={busy || (action.run === onPlay && !item.playable)} onClick={action.run}>{action.icon}</button>
        <button className="icon-button" type="button" aria-label={`${t('action_delete')} ${title}`} title={t('action_delete')} disabled={busy} onClick={onDelete}><Trash2 size={20} /></button>
      </div>
    </div>
    {item.status === 'downloading' && (item.totalBytes != null && item.totalBytes > 0
      ? <progress className="downloads-row-progress" max={1} value={item.progress} aria-label={`${title} download progress`} />
      : <progress className="downloads-row-progress" aria-label={`${title} download progress`} />)}
  </article>;
}
