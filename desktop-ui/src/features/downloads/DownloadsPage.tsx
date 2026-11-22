import { useEffect, useState, type ReactNode } from 'react';
import { ChevronRight, Film, Folder, Info, Pause, Play, RotateCw, SlidersHorizontal, Trash2 } from 'lucide-react';
import { call, refreshFeature, useFeatureSnapshot } from '../../bridge';
import { Dialog } from '../../components/Dialog';
import { Link, useNavigate, useNavigationType, useParams } from 'react-router-dom';
import { BackButton } from '../../components/BackButton';
import { FullscreenButton } from '../../components/FullscreenButton';
import { InlineError } from '../../components/Status';
import { scrollKey, useActiveProfileId, useListScrollRestore } from '../../navigation/scrollStore';
import { useLocale } from '../../i18n/strings';
import './downloads.css';

type DownloadItem = {
  id: string; title: string; poster: string | null; background?: string | null; episodeThumbnail?: string | null; customPoster?: string | null;
  parentMetaId: string; parentMetaType: string; seasonNumber: number | null; episodeNumber: number | null; episodeTitle: string | null;
  status: string; downloadedBytes: number; totalBytes: number | null; progress: number; error: string | null; playable: boolean; createdAtEpochMs?: number;
  bytesPerSecond?: number | null; watched?: boolean; watchProgress?: number; remainingMs?: number;
};
type Downloads = { items: DownloadItem[]; hasUnseenCompleted: boolean };
type T = ReturnType<typeof useLocale>['t'];

export const DOWNLOADS_PATH = '/library/downloads';
const BULK = '__bulk__';
const WATCHED_KEY = 'episodes_cd_watched';
const DETAILS_KEY = 'cw_action_go_to_details';
export const downloadsShowPath = (showId: string) => `${DOWNLOADS_PATH}/show/${encodeURIComponent(showId)}`;

/** "1.2 GB" / "340.5 MB" / "12 B", truncated to one decimal like the Kotlin screen. */
export function formatDownloadBytes(value: number) {
  if (value <= 0) return '0 B';
  const units: Array<[number, string]> = [[1024 ** 3, 'GB'], [1024 ** 2, 'MB'], [1024, 'KB']];
  for (const [size, unit] of units) if (value >= size) return `${Math.floor((value / size) * 10) / 10} ${unit}`;
  return `${value} B`;
}

const SEPARATOR = ' • ';
const isEpisode = (item: DownloadItem) => item.seasonNumber != null && item.episodeNumber != null;
const byEpisode = (a: DownloadItem, b: DownloadItem) => (a.seasonNumber ?? 0) - (b.seasonNumber ?? 0) || (a.episodeNumber ?? 0) - (b.episodeNumber ?? 0);
/** Kotlin's `sizeOnDiskBytes`: the full size once complete, otherwise what is on disk so far. */
const sizeOnDisk = (item: DownloadItem) => item.status === 'completed' ? item.totalBytes ?? item.downloadedBytes : item.downloadedBytes;
const totalSize = (items: DownloadItem[]) => formatDownloadBytes(items.reduce((sum, item) => sum + sizeOnDisk(item), 0));
const posterArt = (item: DownloadItem) => item.customPoster || item.poster || item.background || item.episodeThumbnail || null;
const landscapeArt = (item: DownloadItem) => item.episodeThumbnail || item.background || item.poster || null;
/** A custom poster that fails to load falls back to the addon poster, like Kotlin's fallbackImageUrl. */
const posterFallback = (item: DownloadItem) => (event: { currentTarget: HTMLImageElement }) => {
  if (item.customPoster && item.poster && event.currentTarget.src !== item.poster) event.currentTarget.src = item.poster;
};

function statusText(item: DownloadItem, t: T) {
  const size = item.totalBytes != null && item.totalBytes > 0
    ? `${formatDownloadBytes(item.downloadedBytes)} / ${formatDownloadBytes(item.totalBytes)}`
    : formatDownloadBytes(item.downloadedBytes);
  switch (item.status) {
    case 'downloading': {
      const status = t('downloads_status_downloading', [size]);
      return item.bytesPerSecond != null && item.bytesPerSecond > 0 ? `${status}${SEPARATOR}${t('downloads_speed', [formatDownloadBytes(item.bytesPerSecond)])}` : status;
    }
    case 'paused': return t('downloads_status_paused', [size]);
    case 'completed': return formatDownloadBytes(item.totalBytes ?? item.downloadedBytes);
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
  const { t, tp } = useLocale();
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
    try { await call(method, id === BULK ? {} : { id }); await refresh(); setDeleting(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(''); }
  };

  const items = snapshot?.items ?? [];
  const openDetails = (item: DownloadItem) => navigate(`/details/${encodeURIComponent(item.parentMetaType)}/${encodeURIComponent(item.parentMetaId)}`);
  const row = (item: DownloadItem, inShow = false) => <DownloadRow key={item.id} item={item} inShow={inShow} busy={busy === item.id} t={t}
    onPlay={() => void run('downloads.play', item.id)} onPause={() => void run('downloads.pause', item.id)}
    onResume={() => void run('downloads.resume', item.id)} onRetry={() => void run('downloads.retry', item.id)}
    onDetails={() => openDetails(item)} onDelete={() => setDeleting(item)} />;
  const summary = (parts: Array<string | null>) => <p className="downloads-summary">{parts.filter(Boolean).join(SEPARATOR)}</p>;
  const header = (title: string, extra?: ReactNode) => <div className="downloads-section-header"><h2>{title}</h2>{extra}</div>;

  const showEpisodes = showId ? items.filter(item => isEpisode(item) && item.parentMetaId === showId).sort(byEpisode) : [];
  const showTitle = showEpisodes[0]?.title;

  let content;
  if (!snapshot && !error) content = <div className="loading-block">Loading downloads…</div>;
  else if (showId) {
    const watchedCount = showEpisodes.filter(item => item.watched).length;
    const seasons = [...showEpisodes.reduce((map, item) => map.set(item.seasonNumber ?? 0, [...(map.get(item.seasonNumber ?? 0) ?? []), item]), new Map<number, DownloadItem[]>())]
      .sort(([a], [b]) => a - b);
    content = seasons.length === 0
      ? <p className="downloads-empty-text">{t('downloads_empty_title')}</p>
      : <>
        {summary([tp('downloads_episodes', showEpisodes.length, [showEpisodes.length]), totalSize(showEpisodes), watchedCount > 0 ? t('downloads_watched_count', [watchedCount]) : null])}
        {seasons.map(([season, episodes]) => <section className="downloads-section" key={season}>
          {header(season === 0 ? t('episodes_specials') : t('episodes_season', [season]),
            <small>{[tp('downloads_episodes', episodes.length, [episodes.length]), totalSize(episodes)].join(SEPARATOR)}</small>)}
          <div className="downloads-rows">{episodes.map(item => row(item, true))}</div>
        </section>)}
      </>;
  } else {
    const active = items.filter(item => item.status !== 'completed');
    const downloadingByShow = active.filter(isEpisode).reduce((map, item) => map.set(item.parentMetaId, (map.get(item.parentMetaId) ?? 0) + 1), new Map<string, number>());
    const completed = items.filter(item => item.status === 'completed');
    const shows = [...completed.filter(isEpisode).reduce((map, item) => map.set(item.parentMetaId, [...(map.get(item.parentMetaId) ?? []), item]), new Map<string, DownloadItem[]>()).values()]
      .map(episodes => episodes.sort(byEpisode));
    const entries: Array<{ key: string; addedAt: number; movie?: DownloadItem; episodes?: DownloadItem[] }> = [
      ...completed.filter(item => !isEpisode(item)).map(item => ({ key: item.id, addedAt: item.createdAtEpochMs ?? 0, movie: item })),
      ...shows.map(episodes => ({ key: `show:${episodes[0].parentMetaId}`, addedAt: Math.max(...episodes.map(item => item.createdAtEpochMs ?? 0)), episodes })),
    ].sort((a, b) => b.addedAt - a.addedAt);
    const hasDownloading = active.some(item => item.status === 'downloading');
    const hasPaused = active.some(item => item.status === 'paused');
    const bulk = active.length < 2 ? null
      : hasDownloading ? { label: t('downloads_pause_all'), method: 'downloads.pauseAll' }
        : hasPaused ? { label: t('downloads_resume_all'), method: 'downloads.resumeAll' } : null;
    const titleCount = new Set(items.map(item => item.parentMetaId)).size;
    content = items.length === 0
      ? <div className="downloads-empty"><p className="downloads-empty-text">{t('downloads_empty_title')}</p><p className="downloads-empty-message">{t('downloads_empty_message')}</p></div>
      : <>
        {summary([tp('downloads_titles', titleCount, [titleCount]), totalSize(items)])}
        {active.length > 0 && <section className="downloads-section">
          {header(t('downloads_section_active'), bulk && <button type="button" className="text-button downloads-bulk" disabled={busy === BULK} onClick={() => void run(bulk.method, BULK)}>{bulk.label}</button>)}
          <div className="downloads-rows">{active.map(item => row(item))}</div>
        </section>}
        {entries.length > 0 && <section className="downloads-section">{header(t('downloads_section_downloaded'))}<div className="downloads-rows">{entries.map(entry => {
          if (entry.movie) return row(entry.movie);
          const episodes = entry.episodes!;
          const show = episodes[0];
          const downloading = downloadingByShow.get(show.parentMetaId) ?? 0;
          const art = posterArt(show);
          return <button type="button" className="downloads-row downloads-show" key={entry.key} onClick={() => navigate(downloadsShowPath(show.parentMetaId))}>
            <span className="downloads-art poster">{art ? <img src={art} alt="" loading="lazy" onError={posterFallback(show)} /> : <Film size={20} aria-hidden="true" />}</span>
            <span className="downloads-row-copy"><strong>{show.title}</strong><small>{[tp('downloads_episodes', episodes.length, [episodes.length]), totalSize(episodes), downloading > 0 ? t('downloads_downloading_count', [downloading]) : null].filter(Boolean).join(SEPARATOR)}</small></span>
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
    {deleting && <Dialog label={t('downloads_delete_title', [displayTitle(deleting)])} onClose={() => setDeleting(null)}>
      <h2>{t('downloads_delete_title', [displayTitle(deleting)])}</h2><p>{sizeOnDisk(deleting) > 0 ? t('downloads_delete_message', [formatDownloadBytes(sizeOnDisk(deleting))]) : t('action_delete_confirm_message')}</p>
      <div className="dialog-actions"><button className="button secondary" onClick={() => setDeleting(null)}>{t('action_no')}</button><button className="button primary destructive" disabled={busy === deleting.id} onClick={() => void run('downloads.remove', deleting.id)}>{t('action_yes')}</button></div>
    </Dialog>}
  </div>;
}

function DownloadRow({ item, inShow, busy, t, onPlay, onPause, onResume, onRetry, onDetails, onDelete }: { item: DownloadItem; inShow: boolean; busy: boolean; t: T; onPlay: () => void; onPause: () => void; onResume: () => void; onRetry: () => void; onDetails: () => void; onDelete: () => void }) {
  const title = displayTitle(item);
  const subtitle = inShow ? (isEpisode(item) ? t('compose_player_episode_code_full', [item.seasonNumber!, item.episodeNumber!]) : '') : displaySubtitle(item, t);
  const action = item.status === 'downloading' || item.status === 'queued' ? { label: t('compose_action_pause'), icon: <Pause size={20} />, run: onPause }
    : item.status === 'paused' ? { label: t('action_resume'), icon: <Play size={20} />, run: onResume }
      : item.status === 'failed' ? { label: t('action_retry'), icon: <RotateCw size={20} />, run: onRetry }
        : { label: t('action_play'), icon: <Play size={20} />, run: onPlay };
  const landscape = isEpisode(item);
  const art = landscape ? landscapeArt(item) : posterArt(item);
  const watchProgress = item.status === 'completed' ? item.watchProgress ?? 0 : 0;
  return <article className={`downloads-row ${item.status} ${item.playable ? 'playable' : ''}`.trim()} aria-label={title}
    onClick={item.playable && !busy ? onPlay : undefined}>
    <div className="downloads-row-main">
      <span className={`downloads-art ${landscape ? 'landscape' : 'poster'}`}>
        {art ? <img src={art} alt="" loading="lazy" onError={posterFallback(item)} /> : <Film size={20} aria-hidden="true" />}
        {watchProgress > 0 && <progress className="downloads-watch-progress" max={1} value={watchProgress} aria-label={`${title} watch progress`} />}
      </span>
      <div className="downloads-row-copy">
        <strong>{title}</strong>
        {subtitle && <small>{subtitle}</small>}
        <span className={`downloads-row-status ${item.status === 'failed' ? 'failed' : ''}`.trim()}>{statusText(item, t)}{item.status === 'completed' && item.watched ? `${SEPARATOR}${t(WATCHED_KEY)}` : ''}</span>
      </div>
      <div className="downloads-row-actions" onClick={event => event.stopPropagation()}>
        <button className="icon-button" type="button" aria-label={action.label} title={action.label} disabled={busy || (action.run === onPlay && !item.playable)} onClick={action.run}>{action.icon}</button>
        <button className="icon-button" type="button" aria-label={`${t(DETAILS_KEY)} ${title}`} title={t(DETAILS_KEY)} onClick={onDetails}><Info size={20} /></button>
        <button className="icon-button" type="button" aria-label={`${t('action_delete')} ${title}`} title={t('action_delete')} disabled={busy} onClick={onDelete}><Trash2 size={20} /></button>
      </div>
    </div>
    {item.status === 'downloading' && (item.totalBytes != null && item.totalBytes > 0
      ? <progress className="downloads-row-progress" max={1} value={item.progress} aria-label={`${title} download progress`} />
      : <progress className="downloads-row-progress" aria-label={`${title} download progress`} />)}
  </article>;
}
