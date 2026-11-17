import { useMemo } from 'react';
import { AlertCircle, Download } from 'lucide-react';
import { useFeatureSnapshot } from '../../bridge';
import './downloadProgressBadge.css';

export type DownloadBadgeState = { status: string; progress: number };
type DownloadSnapshotItem = { parentMetaId: string; parentMetaType: string; videoId: string; status: string; progress: number; updatedAtEpochMs?: number };

function useTitleItems(type: string, id: string) {
  const snapshot = useFeatureSnapshot<{ items?: DownloadSnapshotItem[] }>('downloads');
  return useMemo(() => (snapshot?.items ?? [])
    .filter(item => item.parentMetaId === id && item.parentMetaType === type)
    // Oldest first, so the newest download of a video wins below.
    .sort((a, b) => (a.updatedAtEpochMs ?? 0) - (b.updatedAtEpochMs ?? 0)), [snapshot, type, id]);
}

/** The current download of each video of one title, keyed by video id. */
export function useDownloadsByVideoId(type: string, id: string): Record<string, DownloadBadgeState> {
  const items = useTitleItems(type, id);
  return useMemo(() => {
    const byVideo: Record<string, DownloadBadgeState> = {};
    for (const item of items) if (item.videoId) byVideo[item.videoId] = { status: item.status, progress: item.progress };
    return byVideo;
  }, [items]);
}

/** The newest download of a title (a movie has one video), or null. */
export function useTitleDownload(type: string, id: string): DownloadBadgeState | null {
  const items = useTitleItems(type, id);
  return useMemo(() => {
    const item = items.at(-1);
    return item ? { status: item.status, progress: item.progress } : null;
  }, [items]);
}

export function downloadPercent(state: DownloadBadgeState) {
  return Math.round(Math.min(1, Math.max(0, Number.isFinite(state.progress) ? state.progress : 0)) * 100);
}

/** Whether a download is still running (or paused part way), i.e. whether a ring should show. */
export function isDownloadInProgress(state: DownloadBadgeState | null | undefined): boolean {
  return state?.status === 'downloading' || state?.status === 'paused';
}

const RADIUS = 46;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** A progress ring that fills clockwise from the top. Sized by its parent; place it over a round element. */
export function DownloadRing({ progress, paused = false, className = '' }: { progress: number; paused?: boolean; className?: string }) {
  const value = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0));
  return <svg className={`download-ring ${paused ? 'paused' : ''} ${className}`.trim()} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
    <circle className="download-ring-track" cx="50" cy="50" r={RADIUS} />
    <circle className="download-ring-value" cx="50" cy="50" r={RADIUS} strokeDasharray={CIRCUMFERENCE} strokeDashoffset={CIRCUMFERENCE * (1 - value)} />
  </svg>;
}

/**
 * Small round badge with a download's state, matching the movie Download button: the download icon inside a
 * filling ring while downloading (dimmed when paused), the icon on a white disc once complete (distinct from
 * the watched check) and an alert when it failed.
 */
export function DownloadProgressBadge({ state, label, className = '' }: { state: DownloadBadgeState; label: string; className?: string }) {
  const percent = downloadPercent(state);
  if (state.status === 'completed') {
    return <span className={`download-progress-badge completed ${className}`.trim()} role="img" aria-label={`${label} downloaded`} title="Downloaded"><Download size={14} strokeWidth={2.75} /></span>;
  }
  if (state.status === 'failed') {
    return <span className={`download-progress-badge failed ${className}`.trim()} role="img" aria-label={`${label} download failed`} title="Download failed"><AlertCircle size={16} /></span>;
  }
  const paused = state.status === 'paused';
  return <span className={`download-progress-badge ${paused ? 'paused' : 'downloading'} ${className}`.trim()} role="progressbar"
    aria-label={`${label} download${paused ? ' paused' : ''}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}
    title={paused ? `Download paused · ${percent}%` : `Downloading · ${percent}%`}>
    <DownloadRing progress={state.progress} paused={paused} />
    <Download size={12} strokeWidth={2.75} />
  </span>;
}

/**
 * Round download control with the title's or episode's download state: the download icon, a filling ring around it
 * while downloading (dimmed when paused), a white disc once downloaded and red when the download failed.
 * The movie Download button and the episode cards share it.
 */
export function downloadStateView(state: DownloadBadgeState | null | undefined) {
  const inProgress = isDownloadInProgress(state);
  const paused = state?.status === 'paused';
  const percent = state ? downloadPercent(state) : 0;
  const status = inProgress ? `${paused ? 'Download paused' : 'Downloading'} ${percent}%`
    : state?.status === 'completed' ? 'Downloaded' : state?.status === 'failed' ? 'Download failed' : '';
  const className = inProgress ? (paused ? 'in-progress paused' : 'in-progress') : state?.status === 'completed' ? 'downloaded' : state?.status === 'failed' ? 'failed' : '';
  return { inProgress, paused, status, className, ring: inProgress && state ? <DownloadRing progress={state.progress} paused={paused} /> : null };
}
