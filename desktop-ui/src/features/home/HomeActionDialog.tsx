import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Dialog } from '../../components/Dialog';
import { LiftedCardArtwork } from '../../components/LiftedCardArtwork';
import { liveSourceRect, rectOf, type SourceRect } from '../../components/sourceLift';
import { animatePosterArtwork, animatePosterMenu, POSTER_CLOSE_MS, POSTER_EXPAND } from '../../components/posterZoomMotion';
import { animateArtworkDisintegration } from '../../components/artworkDisintegration';
import { ASH_FADE_MS } from '../../components/ashMotion';
import './homeParity.css';

export function HomeActionDialog({title,poster,subtitle,onClose,children,artwork,sourceKey,sourceRect,onDestructiveAction}:{title:string;poster?:string|null;subtitle?:string;onClose:()=>void;children:ReactNode;artwork?:ReactNode;sourceKey?:string;sourceRect?:SourceRect|null;onDestructiveAction?:()=>void|Promise<void>}) {
  const [closing, setClosing] = useState(false);
  const [opening, setOpening] = useState(true);
  const [disintegrating, setDisintegrating] = useState(false);
  const [dissolved, setDissolved] = useState(false);
  const [removalError, setRemovalError] = useState('');
  const cancelDisintegration = useRef<(() => void) | undefined>(undefined);
  const closingRef = useRef(false);
  const operationGeneration = useRef(0);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const artworkRef = useRef<HTMLDivElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const animations = useRef<Animation[]>([]);
  const openAnimation = useRef<Animation | null>(null);
  useEffect(() => () => { operationGeneration.current++; window.clearTimeout(closeTimer.current); cancelDisintegration.current?.(); openAnimation.current?.cancel(); animations.current.forEach(animation => animation.cancel()); }, []);
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

  const destroy = () => {
    if (closingRef.current || !onDestructiveAction) return;
    closingRef.current = true;
    const ticket = ++operationGeneration.current;
    setOpening(false); setDisintegrating(true); setRemovalError('');
    animations.current.forEach(animation => animation.cancel());
    let succeeded = false, animationDone = false;
    const finish = () => {
      if (operationGeneration.current !== ticket || !succeeded || !animationDone) return;
      setDissolved(true);
      closeTimer.current = window.setTimeout(() => onCloseRef.current(), ASH_FADE_MS);
    };
    const perform = () => {
      void Promise.resolve().then(() => operationGeneration.current === ticket ? onDestructiveAction() : undefined).then(() => { succeeded = true; finish(); }).catch(cause => {
        cancelDisintegration.current?.(); closingRef.current = false;
        setDisintegrating(false); setDissolved(false);
        setRemovalError(cause instanceof Error ? cause.message : 'Could not remove this title.');
      });
    };
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || !artworkRef.current) {
      perform();
      closeTimer.current = window.setTimeout(() => { animationDone = true; finish(); }, 160);
    } else {
      cancelDisintegration.current = animateArtworkDisintegration(artworkRef.current, perform, () => { animationDone = true; finish(); });
    }
  };

  return <Dialog label={`Actions for ${title}`} exiting={closing || disintegrating} className={`home-actions-dialog ${opening?'is-opening':''} ${artwork?'home-cw-actions-dialog':''} ${closing?'is-closing':''} ${disintegrating?'is-disintegrating-overlay':''} ${dissolved?'is-dissolved':''}`} onClose={dismiss}>
    <div className="home-actions-content" inert={closing || disintegrating}>
    {(artwork || poster) && <div className="home-actions-artwork" ref={artworkRef}>{artwork ? <LiftedCardArtwork sourceKey={sourceKey} fallback={artwork}/> : <img className="home-actions-poster" src={poster ?? undefined} alt="" onLoad={event => { const image = event.currentTarget; if (image.naturalWidth && image.naturalHeight) artworkRef.current?.style.setProperty('--action-artwork-ratio', String(image.naturalWidth / image.naturalHeight)); }}/>}</div>}
    <div className="home-actions-copy" ref={copyRef}><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
    {removalError && <p role="alert">{removalError}</p>}
    <div className="home-actions-options" ref={menuRef} onClickCapture={event => {
      const button = (event.target as HTMLElement).closest('button.destructive');
      if (onDestructiveAction && button && !(button as HTMLButtonElement).disabled) { event.preventDefault(); event.stopPropagation(); destroy(); }
    }}>{children}</div>
    </div>
  </Dialog>;
}
