import { createPortal } from 'react-dom';
import { useEffect, useState, type WheelEvent as ReactWheelEvent } from 'react';
import { ArrowRight, Check, CircleCheck, Plus } from 'lucide-react';
import type { Media } from '../generated/contract';

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
};

/** Shared expanded poster card used by Home, Search Discover, and Library. */
export function forwardPreviewWheel(event: ReactWheelEvent) {
  // The expanded card is portaled to document.body, outside the scrolling
  // .main-area, so wheel input over it would otherwise scroll nothing.
  // Forward it to the page scroller to keep scrolling normal.
  const scroller = document.querySelector('.main-area');
  if (!scroller || (event.deltaX === 0 && event.deltaY === 0)) return;
  const { deltaMode } = event.nativeEvent;
  const unit = deltaMode === 1 ? 16 : deltaMode === 2 ? scroller.clientHeight || window.innerHeight : 1;
  scroller.scrollBy({ left: event.deltaX * unit, top: event.deltaY * unit });
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

export function PosterHoverPreview({ visible = true, item, rect, saved, watched, onOpen, onToggleWatched, onToggleSaved, onMouseEnter, onMouseLeave }: Props) {
  const [present, setPresent] = useState(visible);
  const backdropReady = usePreloadedImage(item.background);
  const logoReady = usePreloadedImage(item.logo);
  useEffect(() => {
    if (visible) { setPresent(true); return; }
    const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 160;
    const timer = window.setTimeout(() => setPresent(false), duration);
    return () => window.clearTimeout(timer);
  }, [visible]);
  const width = 454;
  const height = 510;
  const left = Math.max(12, Math.min(rect.left - 40, window.innerWidth - width - 12));
  const top = Math.max(12, Math.min(rect.top, window.innerHeight - height - 12));

  if (!present) return null;
  return createPortal(<div className={`poster-preview home-preview ${visible ? '' : 'is-closing'}`} inert={!visible} aria-hidden={!visible} style={{ left, top }} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} onWheel={forwardPreviewWheel} onAnimationEnd={event => { if (!visible && event.target === event.currentTarget && event.animationName === 'poster-preview-close') setPresent(false); }} onClick={event => event.stopPropagation()}>
    {item.background && <div className="home-preview-art">{backdropReady && <img className="home-preview-backdrop" src={item.background} alt="" draggable={false} decoding="async" />}</div>}
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
