import { ArtworkImage } from '../../components/ArtworkImage';
import { useFeatureSnapshot } from '../../bridge';
import type { AppearanceSnapshot } from '../settings/appearanceStore';
import { useEffect, type RefObject } from 'react';
import { useDecodedImage } from '../../components/useDecodedImage';

/** Keep progressive image decoding off screen; start the entrance after decode. */
export function HeroBackdrop({ url, elementRef, onSettled }: {
  url?: string | null;
  elementRef?: RefObject<HTMLDivElement | null>;
  onSettled?: () => void;
}) {
  const appearance = useFeatureSnapshot<AppearanceSnapshot>('appearance');
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
  >{ready && appearance?.cardStyle?.animatedArtworkMode && appearance.cardStyle.animatedArtworkMode !== 'Always' && <ArtworkImage src={url ?? undefined} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 20%' }} />}</div>;
}
