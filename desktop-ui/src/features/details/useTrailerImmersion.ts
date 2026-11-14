import { useCallback, useEffect, useState } from 'react';

/** How long the page can sit idle over a playing trailer before its text fades out. */
export const IDLE_FADE_MS = 3000;

export type TrailerUiState = 'shown' | 'faded' | 'hidden';

export function trailerUiState(faded: boolean, hidden: boolean): TrailerUiState {
  return hidden ? 'hidden' : faded ? 'faded' : 'shown';
}

/**
 * Netflix-style immersion while a trailer is actually playing:
 * - `faded`: after IDLE_FADE_MS without input the descriptive text fades out;
 *   any mouse move, click, wheel, scroll or key press brings it back.
 * - `hidden`: the viewer asked for an unobstructed view; only input on the
 *   toggle (or Escape) returns the page, ordinary mouse movement does not.
 * Both reset as soon as the trailer stops playing (scrolled away, window
 * unfocused, ended, or turned off).
 */
export function useTrailerImmersion(playing: boolean) {
  const [faded, setFaded] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!playing) {
      setFaded(false);
      setHidden(false);
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
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setHidden(false);
      activity();
    };
    window.addEventListener('mousemove', activity, { passive: true });
    window.addEventListener('pointerdown', activity, { passive: true });
    window.addEventListener('wheel', activity, { passive: true });
    window.addEventListener('scroll', activity, { passive: true, capture: true });
    window.addEventListener('keydown', onKey);
    arm(IDLE_FADE_MS);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('mousemove', activity);
      window.removeEventListener('pointerdown', activity);
      window.removeEventListener('wheel', activity);
      window.removeEventListener('scroll', activity, { capture: true });
      window.removeEventListener('keydown', onKey);
    };
  }, [playing]);

  const toggleHidden = useCallback(() => setHidden((current) => !current), []);
  return { faded, hidden, toggleHidden, state: trailerUiState(faded, hidden) };
}
