import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';
import { ArrowRight, Check, CircleCheck, Plus } from 'lucide-react';
import type { Media } from '../generated/contract';
import { HoverTrailer } from './HoverTrailer';

type Props = {
  visible?: boolean;
  item: Media;
  rect: DOMRect;
  saved: boolean;
  watched: boolean;
  onOpen: () => void;
  onToggleWatched: () => void;
  onToggleSaved: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  trailer?: { enabled: boolean; soundEnabled: boolean; startSeconds: number } | null;
};

/**
 * Hover geometry mirrors `HomePosterPreviewPositionProvider`: centered on the
 * anchor with a 24dp top overlap, clamped to 16px viewport margins. Kotlin
 * widths are dp; the desktop scale converts them to CSS pixels.
 */
export const HOVER_PREVIEW_WIDTH_DP = 420;
const HOVER_PREVIEW_EDGE_MARGIN = 16;
const HOVER_PREVIEW_TOP_OVERLAP = 24;
/** Matches `HoverPreviewCloseDelayMillis` / exit duration in `HomePosterHoverPreview.kt`. */
export const HOVER_PREVIEW_CLOSE_DELAY_MS = 120;
export const HOVER_PREVIEW_EXIT_MS = 170;

function uiScale(): number {
  const raw = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui-scale'));
  return Number.isFinite(raw) && raw > 0 ? raw : 1;
}

/**
 * Preloads an image off-DOM and resolves only once the full bitmap is
 * decoded. The caller mounts its <img> after this flips, so the first paint
 * is already complete: slow or progressively-encoded artwork (common on
 * addon/TMDB shelves) can never flash half-loaded, regardless of host,
 * encoding, or cache state. Dead URLs never mount, matching the convention
 * of dropping artwork that cannot load instead of showing broken icons.
 */
function usePreloadedImage(src: string | null): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!src) return;
    let cancelled = false;
    setReady(false);
    const probe = new Image();
    probe.decoding = 'async';
    probe.onload = () => {
      if (typeof probe.decode === 'function') {
        probe.decode().then(
          () => { if (!cancelled) setReady(true); },
          () => { if (!cancelled) setReady(true); },
        );
      } else if (!cancelled) {
        setReady(true);
      }
    };
    probe.onerror = () => { if (!cancelled) setReady(false); };
    probe.src = src;
    return () => {
      cancelled = true;
      probe.onload = null;
      probe.onerror = null;
    };
  }, [src]);
  return ready;
}

export function PosterHoverPreview({ visible = true, item, rect, saved, watched, onOpen, onToggleWatched, onToggleSaved, onMouseEnter, onMouseLeave, trailer }: Props) {
  const [present, setPresent] = useState(visible);
  const [trailerDone, setTrailerDone] = useState(false);
  const backdropReady = usePreloadedImage(item.background);
  const logoReady = usePreloadedImage(item.logo);
  useEffect(() => { setTrailerDone(false); }, [item.type, item.id]);
  useEffect(() => {
    if (visible) { setPresent(true); return; }
    const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : HOVER_PREVIEW_EXIT_MS;
    const timer = window.setTimeout(() => setPresent(false), duration);
    return () => window.clearTimeout(timer);
  }, [visible]);
  const scale = uiScale();
  const width = HOVER_PREVIEW_WIDTH_DP * scale;
  const height = 510 * scale;
  const centeredX = rect.left + ((rect.width || 0) - width) / 2;
  const left = Math.max(HOVER_PREVIEW_EDGE_MARGIN, Math.min(centeredX, window.innerWidth - width - HOVER_PREVIEW_EDGE_MARGIN));
  const top = Math.max(HOVER_PREVIEW_EDGE_MARGIN, Math.min(rect.top - HOVER_PREVIEW_TOP_OVERLAP * scale, window.innerHeight - height - HOVER_PREVIEW_EDGE_MARGIN));

  if (!present) return null;
  // Like Kotlin's scroll listener on the preview, wheel input dismisses
  // instead of scrolling the page behind the card.
  return createPortal(<div className={`poster-preview home-preview ${visible ? '' : 'is-closing'}`} inert={!visible} aria-hidden={!visible} style={{ left, top, width }} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} onWheel={onMouseLeave} onAnimationEnd={event => { if (!visible && event.target === event.currentTarget && event.animationName === 'poster-preview-close') setPresent(false); }} onClick={event => event.stopPropagation()}>
    {item.background && <div className="home-preview-art">{backdropReady && <img className="home-preview-backdrop" src={item.background} alt="" draggable={false} decoding="async" />}{trailer?.enabled && !trailerDone && <HoverTrailer ownerId={`hover:${item.type}:${item.id}`} type={item.type} id={item.id} soundEnabled={trailer.soundEnabled} startSeconds={trailer.startSeconds} onReady={() => {}} onDone={() => setTrailerDone(true)} />}</div>}
    {item.logo && logoReady && <img className="home-preview-logo" src={item.logo} alt={item.name} draggable={false} decoding="async" />}
    <div className="poster-preview-copy">
      {(!item.logo) && <h3 className="home-preview-title">{item.name}</h3>}
      <p>{[item.type.replace(/^./, letter => letter.toUpperCase()), item.releaseInfo, item.rating ? `IMDb ${item.rating}` : null].filter(Boolean).join(' · ')}</p>
      {!!item.genres.length && <p>{item.genres.slice(0, 3).join(' · ')}</p>}
      {item.description && <p className="home-preview-description">{item.description.slice(0, 360)}</p>}
      <div className="home-preview-actions">
        <button className="button primary" onClick={onOpen}>View Details<ArrowRight size={16} /></button>
        <button className={`home-preview-round${watched ? ' active' : ''}`} aria-label={watched ? 'Mark as unwatched' : 'Mark as watched'} aria-pressed={watched} onClick={onToggleWatched}><CircleCheck size={19} /></button>
        <button className={`home-preview-round${saved ? ' active' : ''}`} aria-label={saved ? 'Remove from library' : 'Add to library'} aria-pressed={saved} onClick={onToggleSaved}>{saved ? <Check size={19} /> : <Plus size={19} />}</button>
      </div>
    </div>
  </div>, document.body);
}
