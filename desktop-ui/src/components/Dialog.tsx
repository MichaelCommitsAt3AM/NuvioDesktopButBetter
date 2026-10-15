import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export type DialogProps = { label: string; onClose: () => void; children: ReactNode; className?: string; exiting?: boolean };

export function Dialog({ label, onClose, children, className = '', exiting = false }: DialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const exitingRef = useRef(exiting);
  exitingRef.current = exiting;
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
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
  }, []);
  return createPortal(<div className={`dialog-backdrop ${className}`} onMouseDown={(event) => { if (!exiting && event.target === event.currentTarget) onClose(); }}><div className="dialog-surface" ref={dialogRef} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} inert={exiting}>{children}</div></div>, document.body);
}
