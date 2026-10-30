// Share one viewport read/update pass per paint, even if native resize events burst.
const listeners = new Set<() => void>();
let frame: number | null = null;
function schedule() {
  if (frame !== null) return;
  frame = requestAnimationFrame(() => {
    frame = null;
    for (const listener of Array.from(listeners)) if (listeners.has(listener)) listener();
  });
}
export function subscribeViewportResize(listener: () => void): () => void {
  if (!listeners.size) window.addEventListener('resize', schedule);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      window.removeEventListener('resize', schedule);
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
    }
  };
}
