import { cloneElement, useLayoutEffect, useRef, useState, type ReactElement } from 'react';
import type { DialogProps } from './Dialog';
import './bottomSheet.css';

/** Retains the last sheet, including its data, while the owning state closes. */
export function BottomSheetPresence({ children, narrowOnly = false, onExitComplete }: {
  children: ReactElement<DialogProps> | null | false;
  narrowOnly?: boolean;
  onExitComplete?: () => void;
}) {
  const [retained, setRetained] = useState(children);
  const onExitRef = useRef(onExitComplete);
  onExitRef.current = onExitComplete;
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const enabled = !narrowOnly || (window.matchMedia?.('(max-width: 650px)').matches ?? false);
  const animate = enabled && !reduced;

  useLayoutEffect(() => {
    if (children) {
      setRetained(children);
      return;
    }
    if (!retained) return;
    if (!animate) {
      setRetained(null);
      onExitRef.current?.();
      return;
    }
    const timer = window.setTimeout(() => {
      setRetained(null);
      onExitRef.current?.();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [children, retained, animate]);

  const content = children || (animate ? retained : null);
  if (!content) return null;
  return cloneElement(content, {
    className: `${content.props.className ?? ''} ${narrowOnly ? 'bottom-sheet-narrow' : 'bottom-sheet-motion'} ${!children ? 'is-sheet-closing' : ''}`,
    exiting: !children,
  });
}
