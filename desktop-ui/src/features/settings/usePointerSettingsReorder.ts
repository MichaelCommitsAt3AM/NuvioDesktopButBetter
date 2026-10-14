import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type HTMLAttributes } from 'react';

/** Pointer capture works in WebView2 as well as on touch; no HTML drag service is needed. */
export function usePointerSettingsReorder<T extends { key: string; isPinnedToTop?: boolean }>(items: T[], onCommit: (key: string, targetKey: string) => Promise<void>, busy = false) {
  const [preview, setPreview] = useState<string[] | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [saving, setSaving] = useState(false);
  const input = useRef({ items, onCommit, busy }); input.current = { items, onCommit, busy };
  const visualOffset = useRef(0); visualOffset.current = offset;
  const session = useRef<{
    key: string; pointerId: number; handle: HTMLButtonElement; list: HTMLElement;
    startY: number; startTop: number; y: number; keys: string[]; original: string[];
  } | null>(null);
  const frame = useRef(0);
  const before = useRef(new Map<string, number>());
  const signature = items.map(item => item.key).join('|');
  const orderedItems = preview ? preview.map(key => items.find(item => item.key === key)).filter((item): item is T => !!item) : items;

  function rows(list: HTMLElement) { return Array.from(list.querySelectorAll<HTMLElement>('[data-settings-row-key]')); }
  function position() {
    const current = session.current;
    if (!current) return;
    const elements = rows(current.list);
    const row = elements.find(element => element.dataset.settingsRowKey === current.key);
    if (!row) return;
    const baseTop = row.getBoundingClientRect().top - visualOffset.current;
    const nextOffset = current.startTop + current.y - current.startY - baseTop;
    visualOffset.current = nextOffset; setOffset(nextOffset);
    const from = current.keys.indexOf(current.key);
    const target = elements.find(element => {
      const key = element.dataset.settingsRowKey!;
      if (key === current.key || input.current.items.find(item => item.key === key)?.isPinnedToTop) return false;
      const rect = element.getBoundingClientRect();
      const index = current.keys.indexOf(key);
      return current.y >= rect.top && current.y <= rect.bottom && (index < from ? current.y < rect.top + rect.height / 2 : current.y > rect.top + rect.height / 2);
    });
    if (!target) return;
    const to = current.keys.indexOf(target.dataset.settingsRowKey!);
    before.current = new Map(elements.map(element => [element.dataset.settingsRowKey!, element.getBoundingClientRect().top]));
    const next = [...current.keys]; next.splice(from, 1); next.splice(to, 0, current.key);
    current.keys = next; setPreview(next);
  }

  useLayoutEffect(() => {
    const current = session.current;
    if (!current) return;
    for (const element of rows(current.list)) {
      const key = element.dataset.settingsRowKey!;
      const oldTop = before.current.get(key);
      if (key !== current.key && oldTop != null && typeof element.animate === 'function' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        const delta = oldTop - element.getBoundingClientRect().top;
        if (delta) element.animate([{ transform: `translateY(${delta}px)` }, { transform: 'translateY(0)' }], { duration: 180, easing: 'ease-out' });
      }
    }
    before.current.clear();
    const row = rows(current.list).find(element => element.dataset.settingsRowKey === current.key);
    if (row) {
      const next = current.startTop + current.y - current.startY - (row.getBoundingClientRect().top - visualOffset.current);
      visualOffset.current = next; setOffset(next);
    }
  }, [preview]);

  function stop(cancel: boolean) {
    const current = session.current;
    if (!current) return;
    session.current = null; cancelAnimationFrame(frame.current);
    if (current.handle.hasPointerCapture?.(current.pointerId)) current.handle.releasePointerCapture(current.pointerId);
    setActive(null); setOffset(0); visualOffset.current = 0;
    const from = current.original.indexOf(current.key);
    const to = current.keys.indexOf(current.key);
    if (cancel || from === to) { setPreview(null); return; }
    setSaving(true);
    void input.current.onCommit(current.key, current.original[to]).catch(() => {}).finally(() => { setSaving(false); setPreview(null); });
  }
  useEffect(() => {
    const current = session.current;
    // Profile changes/removal must cancel a drag rather than save it to another profile.
    if (current && (items.length !== current.original.length || items.some(item => !current.original.includes(item.key)))) stop(true);
  }, [signature]);
  useEffect(() => () => { session.current = null; cancelAnimationFrame(frame.current); }, []);

  function scroll() {
    const current = session.current;
    if (!current) return;
    const scroller = current.list.scrollHeight > current.list.clientHeight ? current.list : current.list.closest<HTMLElement>('.settings-pane');
    if (scroller) {
      const rect = scroller.getBoundingClientRect();
      const top = Math.max(0, rect.top), bottom = Math.min(window.innerHeight, rect.bottom);
      const speed = current.y < top + 48 ? -Math.min(18, (top + 48 - current.y) / 3) : current.y > bottom - 48 ? Math.min(18, (current.y - bottom + 48) / 3) : 0;
      if (speed) { scroller.scrollTop += speed; position(); }
    }
    frame.current = requestAnimationFrame(scroll);
  }
  function pointer(item: T): { handle: HTMLAttributes<HTMLButtonElement>; style?: CSSProperties; active: boolean } {
    return {
      active: active === item.key,
      style: active === item.key ? { transform: `translateY(${offset}px)` } : undefined,
      handle: {
        onPointerDown: event => {
          if (event.button !== 0 || item.isPinnedToTop || input.current.busy || saving) return;
          const row = event.currentTarget.closest<HTMLElement>('[data-settings-row-key]');
          const list = row?.closest<HTMLElement>('.settings-reorder-list');
          if (!row || !list) return;
          event.preventDefault(); event.currentTarget.setPointerCapture?.(event.pointerId);
          const keys = input.current.items.map(item => item.key);
          session.current = { key: item.key, pointerId: event.pointerId, handle: event.currentTarget, list, startY: event.clientY, y: event.clientY, startTop: row.getBoundingClientRect().top, keys, original: [...keys] };
          setPreview(keys); setActive(item.key); frame.current = requestAnimationFrame(scroll);
        },
        onPointerMove: event => { if (session.current?.pointerId !== event.pointerId) return; session.current.y = event.clientY; position(); },
        onPointerUp: event => { if (session.current?.pointerId === event.pointerId) stop(false); },
        onPointerCancel: () => stop(true),
        onLostPointerCapture: () => stop(true),
      },
    };
  }
  return { items: orderedItems, pointer, saving };
}
