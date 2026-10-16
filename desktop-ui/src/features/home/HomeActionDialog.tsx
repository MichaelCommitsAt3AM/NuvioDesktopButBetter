import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Dialog } from '../../components/Dialog';
import { animateLift, animateReturn, liveSourceRect, type SourceRect } from '../../components/sourceLift';

export function HomeActionDialog({title,poster,subtitle,onClose,children,artwork,sourceKey,sourceRect}:{title:string;poster?:string|null;subtitle?:string;onClose:()=>void;children:ReactNode;artwork?:ReactNode;sourceKey?:string;sourceRect?:SourceRect|null}) {
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const artworkRef = useRef<HTMLDivElement>(null);
  const openAnimation = useRef<Animation | null>(null);
  useEffect(() => () => { window.clearTimeout(closeTimer.current); openAnimation.current?.cancel(); }, []);
  // Lift from the source card into the overlay; backdrop blur/scrim and menu
  // reveal keep their CSS sequence. No source means a plain fade entrance.
  useEffect(() => {
    const node = artworkRef.current;
    if (node && sourceRect) openAnimation.current = animateLift(node, sourceRect);
    return () => openAnimation.current?.cancel();
  }, [sourceRect]);
  const dismiss = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    openAnimation.current?.cancel();
    // Return toward the card's live bounds (it may have scrolled); when the
    // source vanished through data, route, or profile changes, fall back to
    // the CSS fade instead of flying toward stale coordinates.
    const node = artworkRef.current;
    const live = sourceKey ? liveSourceRect(sourceKey) : null;
    if (node && live) animateReturn(node, live);
    // CSS animates the content as one layer and the scrim separately. Avoid
    // overlapping Web Animations/CSS fades or animating the expensive blur.
    const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 160;
    closeTimer.current = window.setTimeout(() => onCloseRef.current(), duration);
  };

  return <Dialog label={`Actions for ${title}`} className={`home-actions-dialog ${artwork?'home-cw-actions-dialog':''} ${closing?'is-closing':''}`} onClose={dismiss}>
    <div className="home-actions-content" inert={closing}>
    {(artwork || poster) && <div className="home-actions-artwork" ref={artworkRef}>{artwork || <img className="home-actions-poster" src={poster ?? undefined} alt=""/>}</div>}
    <h2>{title}</h2>{subtitle && <p>{subtitle}</p>}
    <div className="home-actions-options">{children}</div>
    </div>
  </Dialog>;
}
