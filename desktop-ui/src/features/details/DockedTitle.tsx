import { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';

const DOCK_GAP = 14;
const FALLBACK = { left: 96, centerY: 52 };

/** Where the small title sits: just right of the back button, vertically centred on it. */
export function computeDockPosition(back: { right: number; top: number; height: number } | null) {
  return back
    ? { left: back.right + DOCK_GAP, centerY: back.top + back.height / 2 }
    : FALLBACK;
}

/**
 * Small copy of the title/logo pinned to the top-left while the trailer plays
 * with the page text faded. It is a fixed overlay rather than the in-flow
 * title transformed upward, which the hero's overflow clipped.
 */
export function DockedTitle({ logo, name, visible }: { logo?: string | null; name: string; visible: boolean }) {
  const [position, setPosition] = useState(FALLBACK);
  const [broken, setBroken] = useState(false);

  useLayoutEffect(() => { setBroken(false); }, [logo]);
  useLayoutEffect(() => {
    if (!visible) return;
    const rect = document.querySelector<HTMLElement>('.detail-back')?.getBoundingClientRect();
    setPosition(computeDockPosition(rect && rect.width > 0 ? { right: rect.right, top: rect.top, height: rect.height } : null));
  }, [visible]);

  return createPortal(
    <div className={`detail-docked-title${visible ? ' is-visible' : ''}`} aria-hidden="true" style={{ left: position.left, top: position.centerY }}>
      {logo && !broken
        ? <img src={logo} alt="" decoding="async" onError={() => setBroken(true)} />
        : <span>{name}</span>}
    </div>,
    document.body,
  );
}
