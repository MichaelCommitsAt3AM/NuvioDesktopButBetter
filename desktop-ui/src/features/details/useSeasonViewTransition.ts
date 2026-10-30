import { useLayoutEffect, useRef, type RefObject } from 'react';

/** Kotlin uses Crossfade + animateContentSize, both tween(280). */
export function useSeasonViewTransition(mode: string, viewport: RefObject<HTMLDivElement | null>, content: RefObject<HTMLDivElement | null>) {
  const previous = useRef<{ mode: string; height: number; scrollLeft: number; snapshot: HTMLElement } | null>(null);
  const active = useRef<(() => void) | null>(null);
  useLayoutEffect(() => {
    const frame = viewport.current, current = content.current;
    if (!frame || !current) return;
    const old = previous.current;
    const height = current.offsetHeight;
    const startHeight = active.current ? frame.offsetHeight : old?.height ?? height;
    if (old && old.mode !== mode) {
      active.current?.();
      if (frame.animate && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
        const outgoing = old.snapshot;
        outgoing.setAttribute('aria-hidden', 'true');
        outgoing.setAttribute('inert', '');
        Object.assign(outgoing.style, { position: 'absolute', inset: '0', width: '100%', pointerEvents: 'none' });
        frame.appendChild(outgoing);
        outgoing.scrollLeft = old.scrollLeft;
        frame.style.overflow = 'hidden';
        const options = { duration: 280, easing: 'cubic-bezier(.4,0,.2,1)' };
        const animations = [
          frame.animate([{ height: `${startHeight}px` }, { height: `${height}px` }], options),
          current.animate([{ opacity: 0 }, { opacity: 1 }], options),
          outgoing.animate([{ opacity: 1 }, { opacity: 0 }], options),
        ];
        let cleaned = false;
        const cleanup = () => {
          if (cleaned) return;
          cleaned = true;
          outgoing.remove();
          frame.style.overflow = '';
          animations.forEach(animation => animation?.cancel());
          active.current = null;
        };
        active.current = cleanup;
        void Promise.all(animations.map(animation => animation?.finished)).then(cleanup, cleanup);
      }
    }
    previous.current = { mode, height, scrollLeft: current.scrollLeft, snapshot: current.cloneNode(true) as HTMLElement };
  });
  useLayoutEffect(() => () => active.current?.(), []);
}
