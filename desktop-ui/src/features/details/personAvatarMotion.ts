import type { SourceRect } from '../../components/sourceLift';

const activeMotions = new WeakMap<HTMLElement, () => void>();
let returningAvatarKey: string | null = null;
let cancelReturn: (() => void) | null = null;
export function isReturningPersonAvatar(key: string) { return returningAvatarKey === key; }

/** Navigate first, then land on the restored cast element's live bounds. */
export function returnPersonAvatar(node: HTMLElement | null, key: string | undefined, navigateBack: () => void, railScrollLeft?: number) {
  cancelReturn?.();
  if (!node || !key || !node.animate || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { navigateBack(); return; }
  activeMotions.get(node)?.();
  const start = node.getBoundingClientRect();
  if (start.width <= 0 || start.height <= 0) { navigateBack(); return; }
  const overlay = node.cloneNode(true) as HTMLElement;
  overlay.setAttribute('aria-hidden', 'true');
  Object.assign(overlay.style, { position: 'fixed', left: `${start.left}px`, top: `${start.top}px`, width: `${start.width}px`, height: `${start.height}px`, margin: '0', zIndex: '1000', pointerEvents: 'none', transformOrigin: 'top left' });
  document.body.appendChild(overlay);
  node.style.visibility = 'hidden';
  returningAvatarKey = key;
  document.documentElement.setAttribute('data-person-avatar-returning', '');
  let frame = 0, animation: Animation | null = null, finished = false;
  const cleanup = () => {
    if (finished) return;
    finished = true;
    cancelAnimationFrame(frame);
    animation?.cancel();
    overlay.remove();
    returningAvatarKey = null;
    cancelReturn = null;
    document.documentElement.removeAttribute('data-person-avatar-returning');
  };
  cancelReturn = cleanup;
  const deadline = performance.now() + 2000;
  let previous: DOMRect | null = null, stable = 0;
  let restoredRail = false;
  const findTarget = () => {
    if (finished) return;
    const target = Array.from(document.querySelectorAll<HTMLElement>('[data-person-avatar-key]')).find((element) => element.dataset.personAvatarKey === key);
    if (target && !restoredRail) {
      const rail = target.closest<HTMLElement>('.details-extras-people');
      if (rail && railScrollLeft != null) rail.scrollLeft = railScrollLeft;
      restoredRail = true;
    }
    const bounds = target?.getBoundingClientRect();
    if (bounds && bounds.width > 0 && bounds.height > 0 && bounds.bottom > 0 && bounds.top < window.innerHeight) {
      stable = previous && Math.max(Math.abs(previous.left - bounds.left), Math.abs(previous.top - bounds.top), Math.abs(previous.width - bounds.width), Math.abs(previous.height - bounds.height)) < .25 ? stable + 1 : 0;
      previous = bounds;
      if (stable >= 3) {
        const dx = bounds.left - start.left, dy = bounds.top - start.top;
        const sx = bounds.width / start.width, sy = bounds.height / start.height;
        const omega = Math.sqrt(200), duration = 650;
        const frames = Array.from({ length: 40 }, (_, index) => {
          const offset = index / 39, t = offset * duration / 1000;
          const progress = index === 39 ? 1 : 1 - (1 + omega * t) * Math.exp(-omega * t);
          return { offset, transform: `translate(${dx * progress}px, ${dy * progress}px) scale(${1 + (sx - 1) * progress}, ${1 + (sy - 1) * progress})` };
        });
        animation = node.animate.call(overlay, frames, { duration, easing: 'linear', fill: 'forwards' });
        if (animation?.finished) void animation.finished.then(cleanup, cleanup); else cleanup();
        return;
      }
    } else { previous = null; stable = 0; }
    if (performance.now() >= deadline) { cleanup(); return; }
    frame = requestAnimationFrame(findTarget);
  };
  try { navigateBack(); frame = requestAnimationFrame(findTarget); } catch (error) { cleanup(); throw error; }
}

/** Compose shared-element bounds use a critically damped, medium-low spring. */
export function animatePersonAvatar(node: HTMLElement, source: SourceRect, returning = false): Animation | null {
  activeMotions.get(node)?.();
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || !node.animate) return null;
  const target = node.getBoundingClientRect();
  if (target.width <= 0 || target.height <= 0) return null;
  const dx = source.x - target.left, dy = source.y - target.top;
  const sx = source.width / target.width, sy = source.height / target.height;
  if (!Number.isFinite(dx + dy + sx + sy)) return null;
  const omega = Math.sqrt(200);
  const distance = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(source.width - target.width), Math.abs(source.height - target.height));
  let duration = 0;
  while (duration < 1.2 && (1 + omega * duration) * Math.exp(-omega * duration) * distance > .5) duration += 1 / 60;
  duration = Math.max(duration, .2);
  const frames = Array.from({ length: Math.ceil(duration * 60) + 1 }, (_, index) => index);
  const keyframes = frames.map((_, index) => {
    const offset = index / (frames.length - 1);
    const time = offset * duration;
    const remainder = offset === 1 ? 0 : (1 + omega * time) * Math.exp(-omega * time);
    const amount = returning ? 1 - remainder : remainder;
    return { offset, transform: `translate(${dx * amount}px, ${dy * amount}px) scale(${1 + (sx - 1) * amount}, ${1 + (sy - 1) * amount})` };
  });
  // Shared artwork must travel above both independently clipped scroll panes.
  const overlay = node.cloneNode(true) as HTMLElement;
  overlay.setAttribute('aria-hidden', 'true');
  Object.assign(overlay.style, {
    position: 'fixed', left: `${target.left}px`, top: `${target.top}px`,
    width: `${target.width}px`, height: `${target.height}px`, margin: '0',
    zIndex: '1000', pointerEvents: 'none', transformOrigin: 'top left',
  });
  document.body.appendChild(overlay);
  const visibility = node.style.visibility;
  node.style.visibility = 'hidden';
  const animation = node.animate.call(overlay, keyframes, { duration: duration * 1000, easing: 'linear', fill: returning ? 'forwards' : 'none' });
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    overlay.remove();
    node.style.visibility = visibility;
    activeMotions.delete(node);
  };
  if (animation) activeMotions.set(node, () => { cleanup(); animation.cancel(); });
  if (animation?.finished) void animation.finished.then(cleanup, cleanup);
  else cleanup();
  return animation;
}
