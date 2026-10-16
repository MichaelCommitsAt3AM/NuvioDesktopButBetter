import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, CloudDownload, Info, X } from 'lucide-react';
import { Dialog } from '../../components/Dialog';
import { TEST_UPDATE, dismissTestBanner, startTestDownload, useTestBanner } from './updateBannerTest';
import './updater.css';
import { initializeUpdater, useUpdater, dismissUpdate, downloadUpdate, installUpdate } from './updater';

/** Signed release updater, retaining About's isolated banner preview. */
export function UpdateBanner() {
  const test = useTestBanner();
  const update = useUpdater();
  useEffect(initializeUpdater, []);
  const real = update.visible;
  const banner = real ? { visible: update.visible, phase: update.phase, progress: update.progress ?? 0 } : test;
  const release = real ? { tag: `Nuvio ${update.version}`, title: `Nuvio ${update.version}`, sizeLabel: '', notes: update.notes } : TEST_UPDATE;
  const dismiss = real ? dismissUpdate : dismissTestBanner;
  const [notesOpen, setNotesOpen] = useState(false);
  const [present, setPresent] = useState(banner.visible);
  const [closing, setClosing] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!banner.visible) setNotesOpen(false); }, [banner.visible]);
  useEffect(() => {
    if (banner.visible) { setPresent(true); setClosing(false); return; }
    if (!present) return;
    setClosing(true);
    const timer = window.setTimeout(() => { setPresent(false); setClosing(false); }, 260);
    return () => window.clearTimeout(timer);
  }, [banner.visible, present]);
  // The floating nav and shell are fixed-height: track the animated banner
  // height live so they glide with it instead of overlapping it.
  useEffect(() => {
    const root = document.documentElement;
    const node = wrapRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const apply = () => root.style.setProperty('--update-banner-height', `${node.offsetHeight}px`);
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(node);
    return () => { observer.disconnect(); root.style.setProperty('--update-banner-height', '0px'); };
  }, [present]);
  if (!present) return null;
  const complete = banner.phase === 'complete';
  const downloading = banner.phase === 'downloading';
  const installing = banner.phase === 'installing';
  const ready = banner.phase === 'downloaded';
  const subtitle = real && update.error ? update.error : installing ? 'Installing and restarting…' : ready ? 'Preparing installation…' : downloading
    ? real && update.progress === null ? 'Downloading…' : `Downloading… ${Math.round(banner.progress * 100)}%`
    : complete ? 'Banner test complete' : real ? 'Update available • Installs and restarts after download' : 'Update available';
  return <>
    <div className={`update-banner-wrap${closing ? ' is-closing' : ''}`} ref={wrapRef}>
      <div className="update-banner-clip">
      <div className="update-banner" role="region" aria-label={real ? 'Update available' : 'Preview update banner'}>
      <span className="update-banner-progress" aria-hidden="true" style={{ width: `${Math.round(banner.progress * 100)}%` }} />
      <span className="update-banner-icon">{complete ? <CheckCircle2 size={24} /> : <CloudDownload size={24} />}</span>
      <span className="update-banner-copy">
        <strong>{release.tag}{release.sizeLabel ? ` • ${release.sizeLabel}` : ''}</strong>
        <small>{subtitle}</small>
      </span>
      <button type="button" className="update-banner-icon-button is-filled" aria-label="Release notes" onClick={() => setNotesOpen(true)}><Info size={20} /></button>
      {!downloading && !complete && !installing && <button type="button" className="update-banner-action" onClick={() => { if (real) { void (ready ? installUpdate() : downloadUpdate()); } else startTestDownload(); }}>{real && update.error ? 'Retry update' : 'Update'}</button>}
      {!downloading && !installing && <button type="button" className="update-banner-icon-button" aria-label="Dismiss update banner" onClick={dismiss}><X size={20} /></button>}
    </div>
      </div>
    </div>
    {notesOpen && <Dialog label="Release notes" onClose={() => setNotesOpen(false)}>
      <h2>Release notes</h2>
      <p className="update-banner-notes-title">{release.title}</p>
      <p className="update-banner-notes">{release.notes}</p>
      <div className="dialog-actions"><button className="button secondary" onClick={() => setNotesOpen(false)}>Close</button></div>
    </Dialog>}
  </>;
}
