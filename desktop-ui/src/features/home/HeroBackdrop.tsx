import type { RefObject } from 'react';
import { useDecodedImage } from '../../components/useDecodedImage';

/** Keep progressive image decoding off screen; start the entrance after decode. */
export function HeroBackdrop({ url, elementRef }: {
  url?: string | null;
  elementRef?: RefObject<HTMLDivElement | null>;
}) {
  const { ready } = useDecodedImage(url);
  return <div
    ref={elementRef}
    className={`home-hero-background${ready ? ' is-ready' : ''}`}
    aria-hidden="true"
    style={{ backgroundImage: ready ? `url(${JSON.stringify(url)})` : undefined }}
  />;
}
