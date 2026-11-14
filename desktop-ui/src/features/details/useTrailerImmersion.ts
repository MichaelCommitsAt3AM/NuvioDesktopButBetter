import { useEffect, useState } from 'react';

/** How long the page can sit idle over a playing trailer before its text fades out. */
export const IDLE_FADE_MS = 3000;

export type TrailerUiState = 'shown' | 'faded';

/**
 * Netflix-style immersion while a trailer is actually playing: after
 * IDLE_FADE_MS without input the descriptive text fades out, and any mouse
 * move, click, wheel, scroll or key press brings it back. It resets as soon
 * as the trailer stops playing (scrolled away, window unfocused, paused,
 * ended, or turned off).
 */
export function useTrailerImmersion(playing: boolean) {
  const [faded, setFaded] = useState(false);

  useEffect(() => {
    if (!playing) {
      setFaded(false);
      return;
    }
    let last = Date.now();
    let timer = 0;
    let pending = false;
    const arm = (ms: number) => { pending = true; timer = window.setTimeout(check, ms); };
    const check = () => {
      const idle = Date.now() - last;
      if (idle >= IDLE_FADE_MS) { pending = false; setFaded(true); }
      else arm(IDLE_FADE_MS - idle);
    };
    const activity = () => {
      last = Date.now();
      setFaded(false);
      if (!pending) arm(IDLE_FADE_MS);
    };
    window.addEventListener('mousemove', activity, { passive: true });
    window.addEventListener('pointerdown', activity, { passive: true });
    window.addEventListener('wheel', activity, { passive: true });
    window.addEventListener('scroll', activity, { passive: true, capture: true });
    window.addEventListener('keydown', activity);
    arm(IDLE_FADE_MS);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('mousemove', activity);
      window.removeEventListener('pointerdown', activity);
      window.removeEventListener('wheel', activity);
      window.removeEventListener('scroll', activity, { capture: true });
      window.removeEventListener('keydown', activity);
    };
  }, [playing]);

  return { faded, state: (faded ? 'faded' : 'shown') as TrailerUiState };
}
