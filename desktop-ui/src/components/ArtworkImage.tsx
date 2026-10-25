import { useEffect, useRef, useState, type ImgHTMLAttributes } from 'react';
import { useFeatureSnapshot } from '../bridge';
import type { AppearanceSnapshot } from '../features/settings/appearanceStore';

/** Keep a decoded still beside the browser animation; canvas also works for cross-origin artwork. */
export function ArtworkImage({ onLoad, style, ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  const appearance = useFeatureSnapshot<AppearanceSnapshot>('appearance');
  const mode = appearance?.cardStyle?.animatedArtworkMode ?? 'Always';
  const image = useRef<HTMLImageElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [loaded, setLoaded] = useState<string | null>(null);
  const [captured, setCaptured] = useState<string | null>(null);
  const [hovered, setHovered] = useState(false);
  const paused = mode === 'Off' || (mode === 'OnHover' && !hovered);

  useEffect(() => {
    const parent = image.current?.closest('.home-hero') ?? image.current?.parentElement;
    if (!parent || mode !== 'OnHover') return;
    const enter = () => setHovered(true);
    const leave = () => setHovered(false);
    parent.addEventListener('pointerenter', enter);
    parent.addEventListener('pointerleave', leave);
    return () => { parent.removeEventListener('pointerenter', enter); parent.removeEventListener('pointerleave', leave); };
  }, [mode, props.src]);

  useEffect(() => {
    const source = image.current;
    const target = canvas.current;
    if (mode === 'Always' || !source || !target || loaded !== source.src || !source.complete || !source.naturalWidth) return;
    const context = target.getContext('2d');
    if (!context) return;
    const scale = Math.min(1, Math.sqrt(1_300_000 / (source.naturalWidth * source.naturalHeight)));
    target.width = Math.max(1, Math.round(source.naturalWidth * scale));
    target.height = Math.max(1, Math.round(source.naturalHeight * scale));
    context.drawImage(source, 0, 0, target.width, target.height);
    setCaptured(props.src ?? '');
  }, [mode, props.src, loaded]);

  const showStill = paused && captured === (props.src ?? '');
  return <>
    <img {...props} ref={image} style={{ ...style, visibility: showStill ? 'hidden' : style?.visibility }} onLoad={event => { setLoaded(event.currentTarget.src); onLoad?.(event); }} />
    {mode !== 'Always' && <canvas ref={canvas} aria-hidden="true" className={props.className} style={{ ...style, position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: style?.objectFit ?? 'cover', pointerEvents: 'none', visibility: showStill ? 'visible' : 'hidden' }} />}
  </>;
}
