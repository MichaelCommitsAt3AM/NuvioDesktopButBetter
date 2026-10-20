import { useEffect, type RefObject } from 'react';
import { useDecodedImage } from '../../components/useDecodedImage';

/** Keep progressive image decoding off screen; start the entrance after decode. */
export function HeroBackdrop({ url, elementRef, onSettled }: {
  url?: string | null;
  elementRef?: RefObject<HTMLDivElement | null>;
  onSettled?: () => void;
}) {
  const { ready, failed } = useDecodedImage(url);
  useEffect(() => {
    // Missing/failed artwork still gets a normal display interval and must
    // not strand the carousel. A successful image waits for decoding.
    if (!url || ready || failed) onSettled?.();
  }, [url, ready, failed, onSettled]);
  return <div
    ref={elementRef}
    className={`home-hero-background${ready ? ' is-ready' : ''}`}
    aria-hidden="true"
    style={{ backgroundImage: ready ? `url(${JSON.stringify(url)})` : undefined }}
  />;
}
