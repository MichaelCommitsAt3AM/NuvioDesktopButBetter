import { useLayoutEffect, useEffect, useRef, useState, type ReactNode } from 'react';
import { Download, LoaderCircle } from 'lucide-react';
import { call } from '../../bridge';
import { BottomSheet } from '../../components/BottomSheet';
import { notifyDownloadStarted } from './DownloadNotifications';
import { downloadStateView, useTitleDownload } from './DownloadProgressBadge';
import './downloads.css';

export type QualityOption = { id: string; tier: string; sizeBytes: number | null; bitrateKbps: number | null; codec: string; source: string; hdr?: boolean; overBudget?: boolean };
type QualityOptions = { options: QualityOption[]; loadedStreams: number; runtimeKnown: boolean };
type Phase = { kind: 'loading' } | { kind: 'ready'; result: QualityOptions } | { kind: 'error'; message: string };

const TIER_LABELS: Record<string, [string, string]> = {
  uhd_4k: ['4K', 'Ultra HD'],
  fhd_1080: ['1080p', 'Full HD'],
  hd_720: ['720p', 'HD'],
};

export function formatDownloadSize(bytes: number | null) {
  if (bytes === null || bytes <= 0) return 'Size unknown';
  const gb = bytes / 1024 ** 3;
  return gb >= 1 ? `${gb.toFixed(gb >= 10 ? 0 : 1)} GB` : `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`;
}

/**
 * One-tap download: finds the best stream for each quality (within the user's bitrate budget)
 * and starts the download without opening the streams page. Qualities with no stream are not offered.
 */
export function QualityDownloadButton({ type, id, videoId, onBrowseStreams, onOpenDownloads }: { type: string; id: string; videoId?: string; onBrowseStreams: () => void; onOpenDownloads?: () => void }) {
  const [open, setOpen] = useState(false);
  useEffect(() => { setOpen(false); }, [type, id, videoId]);
  // The button doubles as the title's download indicator: a ring fills around it while downloading.
  const { status, className: stateClass, ring, inProgress } = downloadStateView(useTitleDownload(type, id));
  return <>
    <button className={`detail-download ${stateClass}`.trim()} type="button" onClick={() => { if (inProgress && onOpenDownloads) onOpenDownloads(); else setOpen(true); }} aria-haspopup={inProgress && onOpenDownloads ? undefined : 'dialog'}
      aria-label={status ? `Download, ${status}` : 'Download'} title={status || 'Download'}>
      {ring}
      <Download size={21} />
    </button>
    <QualityDownloadSheet type={type} id={id} videoId={videoId} open={open} onClose={() => setOpen(false)} onBrowseStreams={onBrowseStreams} />
  </>;
}

/**
 * The quality sheet on its own, for callers with their own entry point (the episode actions sheet).
 * Loading starts each time the sheet opens. `subtitle` names what is being downloaded, e.g. an episode.
 */
export function QualityDownloadSheet({ type, id, videoId, subtitle, open, onClose, onBrowseStreams }: { type: string; id: string; videoId?: string; subtitle?: string; open: boolean; onClose: () => void; onBrowseStreams: () => void }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [busy, setBusy] = useState('');
  const [replace, setReplace] = useState<{ optionId: string; title: string } | null>(null);
  const [error, setError] = useState('');
  const requestSerial = useRef(0);

  useEffect(() => {
    const serial = ++requestSerial.current;
    setReplace(null); setError(''); setBusy('');
    if (!open) return;
    setPhase({ kind: 'loading' });
    call<QualityOptions>('downloads.qualityOptions', { type, id, ...(videoId ? { videoId } : {}) })
      .then(result => { if (serial === requestSerial.current) setPhase({ kind: 'ready', result }); })
      .catch(cause => { if (serial === requestSerial.current) setPhase({ kind: 'error', message: cause instanceof Error ? cause.message : String(cause) }); });
  }, [open, type, id, videoId]);

  const close = () => { requestSerial.current += 1; onClose(); };
  const start = async (optionId: string, replaceConfirmed = false) => {
    setBusy(optionId); setError('');
    try {
      const result = await call<{ requiresConfirmation: boolean; existing?: { title: string } }>('downloads.startQuality', { optionId, replaceConfirmed });
      if (result.requiresConfirmation) setReplace({ optionId, title: result.existing?.title ?? 'this title' });
      else { close(); notifyDownloadStarted(); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(''); }
  };

  return <BottomSheet label="Download" open={open} onClose={close}>
    {replace ? <>
      <h2>Replace {replace.title}?</h2>
      <p>The existing download and its local file will be removed before the new download starts.</p>
      {error && <p className="nuvio-bottom-sheet-error" role="alert">{error}</p>}
      <div className="dialog-actions">
        <button className="button secondary" onClick={() => setReplace(null)}>Keep existing</button>
        <button className="button primary" disabled={!!busy} onClick={() => void start(replace.optionId, true)}>Replace download</button>
      </div>
    </> : <>
      <h2>Download</h2>
      {subtitle && <p className="quality-download-subtitle">{subtitle}</p>}
      <AnimatedPhase phaseKey={phase.kind}>
      {phase.kind === 'loading' && <p className="quality-download-status" role="status"><LoaderCircle className="quality-download-spinner" size={18} />Finding the best versions to download…</p>}
      {phase.kind === 'error' && <p className="nuvio-bottom-sheet-error" role="alert">{phase.message}</p>}
      {phase.kind === 'ready' && (phase.result.options.length > 0 ? <>
        <p className="nuvio-bottom-sheet-note">Choose a quality. Each option is the best-looking version that stays a sensible size.</p>
        <div className="quality-download-options" role="group" aria-label="Download quality">
          {phase.result.options.map(option => {
            const [tierLabel, name] = TIER_LABELS[option.tier] ?? [option.tier, ''];
            // HDR is only called out on 4K, and only when this particular file is HDR.
            const label = option.tier === 'uhd_4k' && option.hdr ? `${tierLabel} HDR` : tierLabel;
            // Every stream of this quality is over the data saver budget: this is the smallest, offered anyway.
            return <button key={option.id} className={`nuvio-bottom-sheet-row ${option.overBudget ? 'quality-download-large' : ''}`.trim()} disabled={!!busy} onClick={() => void start(option.id)}
              title={option.overBudget ? 'Every version at this quality is above your data saver limit. This is the smallest.' : undefined}>
              <span><strong>{label}</strong><small>{option.overBudget ? `${name} · Large file` : name}</small></span>
              <span className="nuvio-bottom-sheet-row-end">{busy === option.id ? 'Starting…' : formatDownloadSize(option.sizeBytes)}</span>
            </button>;
          })}
        </div>
      </> : <>
        <p className="nuvio-bottom-sheet-note">{phase.result.loadedStreams === 0
          ? 'No streams were found for this title, so there is nothing to download yet.'
          : 'None of the available streams fit your download quality limits.'}</p>
        {phase.result.loadedStreams > 0 && <button className="button secondary" onClick={() => { close(); onBrowseStreams(); }}>Browse all streams</button>}
      </>)}
      </AnimatedPhase>
      {error && <p className="nuvio-bottom-sheet-error" role="alert">{error}</p>}
    </>}
  </BottomSheet>;
}

/**
 * Matches the mobile sheet's AnimatedContent: when the phase changes (loading -> options), the sheet grows to the
 * new height over 300ms instead of snapping, and the new content fades in after a short delay.
 */
function AnimatedPhase({ phaseKey, children }: { phaseKey: string; children: ReactNode }) {
  const measure = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);
  useLayoutEffect(() => {
    const element = measure.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    setHeight(element.offsetHeight);
    const observer = new ResizeObserver(() => setHeight(element.offsetHeight));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return <div className="quality-download-phase" style={height == null ? undefined : { height }}>
    <div ref={measure}><div className="quality-download-phase-content" key={phaseKey}>{children}</div></div>
  </div>;
}
