export type SourceRect = { x: number; y: number; width: number; height: number };

export function rectOf(element: HTMLElement | null): SourceRect | null {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
}

/** Live bounds of the source card; null when it scrolled away, unmounted, or changed. */
export function liveSourceRect(sourceKey: string): SourceRect | null {
  if (!sourceKey) return null;
  const node = document.querySelector<HTMLElement>(`[data-source-key="${CSS.escape(sourceKey)}"]`);
  return rectOf(node);
}

function flipDelta(node: HTMLElement, rect: SourceRect): { dx: number; dy: number; sx: number; sy: number } {
  const live = node.getBoundingClientRect();
  return {
    dx: rect.x - live.left,
    dy: rect.y - live.top,
    sx: rect.width / Math.max(1, live.width),
    sy: rect.height / Math.max(1, live.height),
  };
}

/**
 * Animate the overlay artwork from the captured source card bounds into
 * place (transform/opacity only). Returns the running animation for
 * interruption, or null when reduced motion is preferred.
 */
export function animateLift(node: HTMLElement, from: SourceRect): Animation | null {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return null;
  const { dx, dy, sx, sy } = flipDelta(node, from);
  if (!Number.isFinite(dx + dy + sx + sy)) return null;
  return node.animate(
    [
      { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, opacity: 0.55 },
      { transform: 'translate(0px, 0px) scale(1, 1)', opacity: 1 },
    ],
    { duration: 220, easing: 'cubic-bezier(0.2, 0, 0, 1)' },
  );
}

/**
 * Animate the overlay artwork back toward the source card's live bounds.
 * Null (with no side effects) means the caller must fade instead.
 */
export function animateReturn(node: HTMLElement, to: SourceRect, durationMs = 160): Animation | null {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return null;
  const { dx, dy, sx, sy } = flipDelta(node, to);
  if (!Number.isFinite(dx + dy + sx + sy)) return null;
  return node.animate(
    [
      { transform: 'translate(0px, 0px) scale(1, 1)', opacity: 1 },
      { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, opacity: 0.55 },
    ],
    { duration: durationMs, easing: 'cubic-bezier(0.2, 0, 0, 1)' },
  );
}
