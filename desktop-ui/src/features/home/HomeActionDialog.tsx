import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Dialog } from '../../components/Dialog';
import { LiftedCardArtwork } from '../../components/LiftedCardArtwork';
import { liveSourceRect, rectOf, type SourceRect } from '../../components/sourceLift';
import { animatePosterArtwork, animatePosterMenu, POSTER_CLOSE_MS, POSTER_EXPAND } from '../../components/posterZoomMotion';
import './homeParity.css';

export function HomeActionDialog({title,poster,subtitle,onClose,children,artwork,sourceKey,sourceRect}:{title:string;poster?:string|null;subtitle?:string;onClose:()=>void;children:ReactNode;artwork?:ReactNode;sourceKey?:string;sourceRect?:SourceRect|null}) {
  const [closing, setClosing] = useState(false);
  const [opening, setOpening] = useState(true);
  const closingRef = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const artworkRef = useRef<HTMLDivElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const animations = useRef<Animation[]>([]);
  const openAnimation = useRef<Animation | null>(null);
  useEffect(() => () => { window.clearTimeout(closeTimer.current); openAnimation.current?.cancel(); animations.current.forEach(animation => animation.cancel()); }, []);
  // Measure the untransformed destination and install the lift before paint.
  // CSS must not also scale this node while the destination is measured.
  useLayoutEffect(() => {
    const node = artworkRef.current;
    const source = sourceKey ? document.querySelector<HTMLElement>(`[data-source-key="${CSS.escape(sourceKey)}"]`) : null;
    let observer: ResizeObserver | undefined;
    if (node && !artwork) {
      const image = node.querySelector('img');
      // Fit the frame to the image itself: contain inside a wider fixed box
      // leaves the visible image's corners away from the frame's clipping edge.
      const ratio = image?.naturalWidth && image.naturalHeight
        ? image.naturalWidth / image.naturalHeight
        : sourceRect ? sourceRect.width / sourceRect.height : 2 / 3;
      node.style.setProperty('--action-artwork-ratio', String(ratio));
      if (source?.offsetWidth) {
        const radiusFraction = parseFloat(getComputedStyle(source).borderTopLeftRadius) / source.offsetWidth;
        if (Number.isFinite(radiusFraction)) {
          const fitRadius = () => { node.style.borderRadius = `${node.clientWidth * radiusFraction}px`; };
          fitRadius();
          if (typeof ResizeObserver !== 'undefined') { observer = new ResizeObserver(fitRadius); observer.observe(node); }
        }
      }
    }
    if (node) openAnimation.current = animatePosterArtwork(node, sourceRect ?? null);
    animations.current = animatePosterMenu(copyRef.current, menuRef.current);
    const timer = window.setTimeout(() => setOpening(false), POSTER_EXPAND.duration);
    return () => { observer?.disconnect(); window.clearTimeout(timer); openAnimation.current?.cancel(); animations.current.forEach(animation => animation.cancel()); };
  }, [sourceRect, sourceKey, !!artwork]);
  const dismiss = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    const node = artworkRef.current;
    const current = rectOf(node);
    openAnimation.current?.cancel();
    // Return toward the card's live bounds (it may have scrolled); when the
    // source vanished through data, route, or profile changes, shrink/fade
    // in place instead of flying toward stale coordinates.
    const live = sourceKey ? liveSourceRect(sourceKey) : null;
    if (node) openAnimation.current = animatePosterArtwork(node, live, true, current);
    animations.current.forEach(animation => animation.cancel());
    const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : POSTER_CLOSE_MS;
    closeTimer.current = window.setTimeout(() => onCloseRef.current(), duration);
  };

  return <Dialog label={`Actions for ${title}`} className={`home-actions-dialog ${opening?'is-opening':''} ${artwork?'home-cw-actions-dialog':''} ${closing?'is-closing':''}`} onClose={dismiss}>
    <div className="home-actions-content" inert={closing}>
    {(artwork || poster) && <div className="home-actions-artwork" ref={artworkRef}>{artwork ? <LiftedCardArtwork sourceKey={sourceKey} fallback={artwork}/> : <img className="home-actions-poster" src={poster ?? undefined} alt="" onLoad={event => { const image = event.currentTarget; if (image.naturalWidth && image.naturalHeight) artworkRef.current?.style.setProperty('--action-artwork-ratio', String(image.naturalWidth / image.naturalHeight)); }}/>}</div>}
    <div className="home-actions-copy" ref={copyRef}><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
    <div className="home-actions-options" ref={menuRef}>{children}</div>
    </div>
  </Dialog>;
}
