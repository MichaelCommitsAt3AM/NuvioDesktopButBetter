import { rectOf, type SourceRect } from './sourceLift';

// PosterZoomActionOverlay.kt: unit-mass springs, sampled once rather than
// driving React state/layout on every animation frame.
export function sampleSpring(stiffness: number, damping: number, threshold: number) {
  const frequency = Math.sqrt(stiffness);
  const damped = frequency * Math.sqrt(1 - damping * damping);
  const at = (seconds: number) => damping === 1
    ? 1 - (1 + frequency * seconds) * Math.exp(-frequency * seconds)
    : 1 - Math.exp(-damping * frequency * seconds) *
      (Math.cos(damped * seconds) + damping * frequency / damped * Math.sin(damped * seconds));
  const values = [0];
  const step = 1 / 120;
  for (let frame = 1; frame < 240; frame++) {
    const value = at(frame * step);
    const velocity = (value - at(frame * step - 0.0001)) / 0.0001;
    values.push(value);
    // An underdamped spring can briefly enter tolerance on its way through
    // equilibrium. Include the first peak before testing that it has settled.
    const pastPeak = damping === 1 || frame * step >= Math.PI / damped;
    if (pastPeak && Math.abs(1 - value) < threshold && Math.abs(velocity) < threshold * 62.5) break;
  }
  values[values.length - 1] = 1;
  return { values, duration: (values.length - 1) * step * 1000 };
}

export const POSTER_EXPAND = sampleSpring(340, 1, 0.0005);
export const POSTER_COLLAPSE = sampleSpring(460, 1, 0.0005);
export const POSTER_MENU = sampleSpring(420, 0.8, 0.01);
export const POSTER_CLOSE_MS = Math.max(340, POSTER_COLLAPSE.duration);

const clamp = (value: number) => Math.max(0, Math.min(1, value));
export function animatePosterArtwork(node: HTMLElement, source: SourceRect | null, closing = false, current?: SourceRect | null): Animation | null {
  if (!node.animate || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return null;
  const slot = rectOf(node);
  if (!slot) return null;
  const fallback = { x: slot.x + slot.width * 0.075, y: slot.y + slot.height * 0.075, width: slot.width * 0.85, height: slot.height * 0.85 };
  const start = closing ? current ?? slot : source ?? fallback;
  const end = closing ? source ?? fallback : slot;
  const spring = closing ? POSTER_COLLAPSE : POSTER_EXPAND;
  const frames = spring.values.map(progress => {
    const x = start.x + (end.x - start.x) * progress;
    const y = start.y + (end.y - start.y) * progress;
    const width = start.width + (end.width - start.width) * progress;
    const height = start.height + (end.height - start.height) * progress;
    return {
      transformOrigin: 'top left',
      transform: `translate(${x - slot.x}px, ${y - slot.y}px) scale(${width / slot.width}, ${height / slot.height})`,
      opacity: source ? 1 : closing ? 1 - clamp(progress) : clamp(progress),
    };
  });
  return node.animate(frames, { duration: spring.duration, easing: 'linear', fill: 'both' });
}

export function animatePosterMenu(copy: HTMLElement | null, menu: HTMLElement | null): Animation[] {
  if (!menu?.animate || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return [];
  const options: KeyframeAnimationOptions = { duration: POSTER_MENU.duration, delay: 60, easing: 'linear', fill: 'both' };
  const animations = [menu.animate(POSTER_MENU.values.map(progress => ({
    opacity: clamp(progress), transform: `scale(${0.62 + 0.38 * progress})`,
  })), options)];
  if (copy) animations.push(copy.animate(POSTER_MENU.values.map(progress => ({
    opacity: clamp(progress), transform: `translateY(${(1 - clamp(progress)) * 10}px)`,
  })), options));
  Array.from(menu.children).forEach((row, index) => {
    const stagger = index * 0.07;
    animations.push(row.animate(POSTER_MENU.values.map(value => {
      const progress = clamp((clamp(value) - stagger) / Math.max(0.01, 1 - stagger));
      return { opacity: progress, transform: `translateY(${(1 - progress) * 8}px)` };
    }), options));
  });
  return animations;
}
