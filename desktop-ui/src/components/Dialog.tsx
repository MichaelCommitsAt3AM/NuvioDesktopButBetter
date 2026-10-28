import { useEffect, useLayoutEffect, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTabActive } from '../navigation/tabActivity';

export type DialogProps = {
  label: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  exiting?: boolean;
  /** Enable pointer drag-to-dismiss for bottom-sheet motion. Defaults to true. */
  dragToDismiss?: boolean;
};

/**
 * Distance/velocity dismissal thresholds, calibrated against M3 sheet
 * behavior (`BottomSheet.kt` swipe-dismiss via `SheetState`): a deliberate
 * downward fling or a drag past a quarter of the sheet height dismisses,
 * anything smaller snaps back. Content-scroll arbitration: a downward drag
 * starting inside scrolled content scrolls instead of dismissing.
 */
export const SHEET_DISMISS_FRACTION = 0.25;
export const SHEET_DISMISS_VELOCITY = 0.5; // px per ms

export function Dialog({ label, onClose, children, className = '', exiting = false, dragToDismiss = true }: DialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const exitingRef = useRef(exiting);
  exitingRef.current = exiting;
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  const active = useTabActive();
  const wasActive = useRef(active);
  useLayoutEffect(() => {
    if (active) { wasActive.current = true; return; }
    if (!wasActive.current) return;
    // Retained tabs must not bring a dialog back on their next visit.
    wasActive.current = false;
    closeRef.current();
  }, [active]);
  const drag = useRef<{ startY: number; lastY: number; lastT: number; prevY: number; prevT: number; active: boolean; hijacked: boolean } | null>(null);
  const isSheet = dragToDismiss && (className.includes('bottom-sheet-motion') ||
    (className.includes('bottom-sheet-narrow') && !!window.matchMedia?.('(max-width: 650px)').matches));
  const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isSheet || exitingRef.current || reduced()) return;
    if (event.button > 0) return;
    const target = event.target instanceof Element ? event.target : null;
    // Never hijack gestures that start on interactive content.
    if (target?.closest('button, input, select, textarea, a, [role="menu"], [data-no-drag]')) return;
    const now = performance.now();
    drag.current = { startY: event.clientY, lastY: event.clientY, lastT: now, prevY: event.clientY, prevT: now, active: true, hijacked: false };
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    const surface = dialogRef.current;
    if (!state?.active || !surface || exitingRef.current) return;
    const dy = event.clientY - state.startY;
    if (!state.hijacked) {
      // Content-scroll arbitration: dragging down while scrolled content can
      // still scroll up belongs to the scroller, not the sheet.
      const target = event.target instanceof Element ? event.target : null;
      const scroller = target?.closest('[data-scroll], .dialog-surface');
      if (dy > 0 && scroller && scroller.scrollTop > 0) { drag.current = null; return; }
      if (dy < 5 && event.clientY - state.startY > -5) return;
      state.hijacked = true;
      surface.classList.add('sheet-dragged');
      surface.setPointerCapture?.(event.pointerId);
    }
    const clamped = Math.max(-24, dy);
    surface.style.transition = 'none';
    surface.style.transform = `translateY(${Math.max(0, clamped)}px)`;
    const now = performance.now();
    state.prevY = state.lastY; state.prevT = state.lastT;
    state.lastY = event.clientY; state.lastT = now;
  };
  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    const surface = dialogRef.current;
    drag.current = null;
    if (!state?.hijacked || !surface || exitingRef.current) return;
    const dy = event.clientY - state.startY;
    const dt = Math.max(1, state.lastT - state.prevT);
    const velocity = (state.lastY - state.prevY) / dt;
    const height = surface.getBoundingClientRect().height || 1;
    if (dy > height * SHEET_DISMISS_FRACTION || (velocity > SHEET_DISMISS_VELOCITY && dy > 24)) {
      surface.style.setProperty('--sheet-exit-start', `${Math.max(0, dy)}px`);
      surface.style.transition = '';
      surface.style.transform = '';
      closeRef.current();
      return;
    }
    // Snap back with a short settle; a new drag interrupts it.
    surface.style.transition = 'transform 180ms cubic-bezier(0.2, 0, 0, 1)';
    surface.style.transform = '';
  };

  useEffect(() => {
    if (!active) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.querySelector<HTMLElement>('input,select,textarea,button,[href],[tabindex]:not([tabindex="-1"])')?.focus({ preventScroll: true });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.stopPropagation(); if (!exitingRef.current) closeRef.current(); }
      if (exitingRef.current && event.key === 'Tab') { event.preventDefault(); return; }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const controls = [...dialogRef.current.querySelectorAll<HTMLElement>('input,select,textarea,button,[href],[tabindex]:not([tabindex="-1"])')].filter((item) => !item.hasAttribute('disabled') && item.getClientRects().length > 0);
      if (!controls.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus({ preventScroll: true }); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus({ preventScroll: true }); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('keydown', onKeyDown); previousFocus?.focus({ preventScroll: true }); };
  }, [active]);
  if (!active) return null;
  return createPortal(<div className={`dialog-backdrop ${className}`} onMouseDown={(event) => { if (!exiting && event.target === event.currentTarget) onClose(); }}><div className="dialog-surface" ref={dialogRef} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} inert={exiting} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={() => { drag.current = null; const surface = dialogRef.current; if (surface) { surface.style.transition = ''; surface.style.transform = ''; } }}>{children}</div></div>, document.body);
}
