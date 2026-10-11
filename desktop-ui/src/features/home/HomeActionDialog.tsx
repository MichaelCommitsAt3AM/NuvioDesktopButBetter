import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Dialog } from '../../components/Dialog';

export function HomeActionDialog({title,poster,subtitle,onClose,children,artwork}:{title:string;poster?:string|null;subtitle?:string;onClose:()=>void;children:ReactNode;artwork?:ReactNode}) {
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => () => window.clearTimeout(closeTimer.current), []);
  const dismiss = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    // CSS animates the content as one layer and the scrim separately. Avoid
    // overlapping Web Animations/CSS fades or animating the expensive blur.
    const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 160;
    closeTimer.current = window.setTimeout(() => onCloseRef.current(), duration);
  };

  return <Dialog label={`Actions for ${title}`} className={`home-actions-dialog ${artwork?'home-cw-actions-dialog':''} ${closing?'is-closing':''}`} onClose={dismiss}>
    <div className="home-actions-content" inert={closing}>
    {(artwork || poster) && <div className="home-actions-artwork">{artwork || <img className="home-actions-poster" src={poster ?? undefined} alt=""/>}</div>}
    <h2>{title}</h2>{subtitle && <p>{subtitle}</p>}
    <div className="home-actions-options">{children}</div>
    </div>
  </Dialog>;
}
