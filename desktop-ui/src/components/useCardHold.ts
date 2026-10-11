import { useEffect, useRef, type PointerEvent, type MouseEvent } from 'react';

/** A hold opens card actions while a drag remains available to the shelf. */
export function useCardHold(onHold: () => void) {
  const action = useRef(onHold);
  action.current = onHold;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const held = useRef(false);
  const cancel = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; origin.current = null; };
  useEffect(() => cancel, []);
  return {
    onPointerDown(event: PointerEvent) {
      if (event.button !== 0) return;
      cancel(); held.current = false;
      origin.current = { x: event.clientX, y: event.clientY };
      timer.current = setTimeout(() => { timer.current = null; held.current = true; action.current(); }, 500);
    },
    onPointerMove(event: PointerEvent) {
      if (origin.current && Math.hypot(event.clientX - origin.current.x, event.clientY - origin.current.y) > 10) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onPointerLeave: cancel,
    onClickCapture(event: MouseEvent) {
      if (held.current) { event.preventDefault(); event.stopPropagation(); held.current = false; }
    },
  };
}
