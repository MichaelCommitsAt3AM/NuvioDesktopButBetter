import { JellyMotion, jellyPillBounds } from './jellyMotion';

export type NavigationGeometry = { width: number; height: number; density: number };
type Nodes = { nav: HTMLElement; pill: HTMLElement; content: HTMLElement; track: HTMLElement; distortion: HTMLElement; panel: HTMLElement };
const STEP = 1 / 120;

/** Sample the original spring once; compositor transforms then need no JS frames. */
export function playNativeJellySelection(initial: JellyMotion, geometry: NavigationGeometry, count: number, nodes: Nodes, finish: (model: JellyMotion) => void) {
  const origin = initial.copy();
  const model = origin.copy();
  const frames = [model.frame];
  for (let step = 0; step < 240 && model.running; step++) { model.advance(STEP); frames.push(model.frame); }
  const duration = Math.max(STEP * 1000, (frames.length - 1) * STEP * 1000);
  const { width, height, density } = geometry;
  const tabWidth = Math.max(1, (width - 8 * density) / count);
  const itemHeight = Math.max(1, height - 8 * density);
  Object.assign(nodes.pill.style, { width: `${tabWidth}px`, height: `${itemHeight}px`, borderRadius: `${Math.min(tabWidth, itemHeight) / 2}px` });
  Object.assign(nodes.content.style, { width: `${width}px`, height: `${height}px` });
  const bounds = frames.map(frame => jellyPillBounds(frame, width / density, height / density, count));
  const options: KeyframeAnimationOptions = { duration, easing: 'linear', fill: 'both' };
  const animations: Animation[] = [];
  const animate = (node: HTMLElement, keyframes: Keyframe[]) => {
    const animation = node.animate(keyframes, options);
    animations.push(animation);
    return animation;
  };
  const primary = animate(nodes.pill, frames.map((frame, index) => ({ transform: `translate(${bounds[index].x * density}px, ${bounds[index].y * density}px) scale(${frame.pillScaleX}, ${frame.pillScaleY})` })));
  animate(nodes.content, frames.map((frame, index) => ({ transform: `scale(${1 / frame.pillScaleX}, ${1 / frame.pillScaleY}) translate(${-bounds[index].x * density}px, ${-bounds[index].y * density}px)` })));
  animate(nodes.track, frames.map(frame => ({ transform: `scale(${frame.trackScale})` })));
  animate(nodes.distortion, frames.map(frame => ({ transform: `translateY(${frame.trackOffsetY * density}px) scaleX(${frame.trackScaleX})` })));
  animate(nodes.panel, frames.map(frame => ({ transform: `translateX(${frame.panelOffset * density}px)` })));
  for (const content of nodes.content.querySelectorAll<HTMLElement>('.liquid-nav-content')) animate(content, frames.map(frame => ({ transform: `scale(${frame.contentScale})` })));
  const avatar = nodes.nav.querySelector<HTMLElement>('.liquid-nav-targets .avatar');
  if (avatar) animate(avatar, frames.map(frame => {
    const coverage = Math.max(0, 1 - Math.abs(frame.position - (count - 1)));
    return { transform: `scale(${1 + (frame.contentScale - 1) * coverage})` };
  }));
  const glow = nodes.nav.querySelector<HTMLElement>('.liquid-nav-surface-clip > .liquid-nav-glow, .liquid-nav-surface > .liquid-nav-glow');
  if (glow) animate(glow, frames.map(frame => ({ opacity: frame.glowOpacity })));
  // Start every layer on the same document timeline, including rapid retargets.
  const timeline = document.timeline?.currentTime;
  if (typeof timeline === 'number') animations.forEach(animation => { animation.startTime = timeline; });
  nodes.nav.dataset.nativeSelection = 'true';
  let cancelled = false;
  void primary.finished.then(() => { if (!cancelled) finish(model); }).catch(() => {});
  return {
    sample() {
      const sampled = origin.copy();
      const current = typeof primary.currentTime === 'number' ? primary.currentTime / 1000 : 0;
      let remaining = Math.min(duration / 1000, current);
      while (remaining > 0) { const step = Math.min(STEP, remaining); sampled.advance(step); remaining -= step; }
      return sampled;
    },
    cancel() {
      cancelled = true;
      animations.forEach(animation => animation.cancel());
      delete nodes.nav.dataset.nativeSelection;
    },
  };
}
