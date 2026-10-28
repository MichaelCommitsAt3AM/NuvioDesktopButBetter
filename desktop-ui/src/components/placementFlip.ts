import { useLayoutEffect, useRef, type RefObject } from 'react';
import { sampleSpring } from './posterZoomMotion';

/** Pure FLIP delta computation, unit-tested separately from DOM measurement. */
export function flipDeltas(
  previous: ReadonlyMap<string, { left: number; top: number }>,
  current: ReadonlyMap<string, { left: number; top: number }>,
): Map<string, { dx: number; dy: number }> {
  const deltas = new Map<string, { dx: number; dy: number }>();
  for (const [key, rect] of current) {
    const old = previous.get(key);
    if (!old) continue;
    const dx = old.left - rect.left;
    const dy = old.top - rect.top;
    if (dx !== 0 || dy !== 0) deltas.set(key, { dx, dy });
  }
  return deltas;
}

/**
 * Neighbor placement animation for Continue Watching and Library layouts.
 * After each commit, moved items glide from their previous position with a
 * transform-only animation; mounts, removals, and order-preserving backend
 * updates (e.g. progress ticks) animate nothing. Entrance effects never
 * replay: only keys present in both frames move.
 */
export function usePlacementFlip(container: RefObject<HTMLElement | null>, composeSpring = false): void {
  const previous = useRef(new Map<string, { left: number; top: number }>());
  const lastContainer = useRef<HTMLElement | null>(null);
  const animations = useRef(new Map<string, Animation>());
  const cancelAnimations = () => { for (const animation of animations.current.values()) animation.cancel(); animations.current.clear(); };
  useLayoutEffect(() => () => { cancelAnimations(); }, []);
  useLayoutEffect(() => {
    const element = container.current;
    if (!element || !element.getClientRects().length) {
      previous.current.clear(); lastContainer.current = null; cancelAnimations(); return;
    }
    if (lastContainer.current !== element) {
      previous.current.clear(); cancelAnimations(); lastContainer.current = element;
    }
    // offset coordinates describe layout, unaffected by page/rail scroll,
    // zoomed viewport coordinates, hover transforms, or an active FLIP.
    const origin = layoutPosition(element);
    const current = new Map<string, { left: number; top: number }>();
    for (const child of element.children) {
      const key = child.getAttribute?.('data-flip-key');
      if (!key) continue;
      const position = layoutPosition(child as HTMLElement);
      current.set(key, { left: position.left - origin.left, top: position.top - origin.top });
    }
    for (const [key, animation] of animations.current) {
      if (!current.has(key)) { animation.cancel(); animations.current.delete(key); }
    }
    if (!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      for (const [key, { dx, dy }] of flipDeltas(previous.current, current)) {
        const node = element.querySelector(`[data-flip-key="${CSS.escape(key)}"]`);
        animations.current.get(key)?.cancel();
        // LazyItemScope.animateItem(): critically damped MediumLow (400),
        // with IntOffset's one-pixel visibility threshold.
        const spring = composeSpring ? sampleSpring(400, 1, 1 / Math.max(1, Math.abs(dx), Math.abs(dy))) : null;
        const frames = spring ? spring.values.map(p => ({ transform: `translate(${dx * (1 - p)}px, ${dy * (1 - p)}px)` }))
          : [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0px, 0px)' }];
        const animation = (node as HTMLElement | null)?.animate?.(frames,
          { duration: spring?.duration ?? 220, easing: spring ? 'linear' : 'cubic-bezier(0.2, 0, 0, 1)' });
        if (animation) {
          animations.current.set(key, animation);
          void animation.finished?.then(() => {
            if (animations.current.get(key) === animation) animations.current.delete(key);
          }).catch(() => {});
        }
      }
    } else {
      cancelAnimations();
    }
    previous.current = current;
  });
}

function layoutPosition(element: HTMLElement): { left: number; top: number } {
  let left = 0;
  let top = 0;
  for (let node: HTMLElement | null = element; node; node = node.offsetParent as HTMLElement | null) {
    left += node.offsetLeft;
    top += node.offsetTop;
  }
  return { left, top };
}
