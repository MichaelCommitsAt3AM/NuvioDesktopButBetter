/**
 * Shared scroll-position store for Phase 5 route restoration.
 *
 * Ownership: `.main-area` is the visible scroller for page routes; nested
 * rails scroll themselves and are never saved; sheets are transient and are
 * never saved; `.settings-pane` owns settings child scroll. Every key embeds
 * the profile id plus route identity and list context (query, filters, sort,
 * catalog/provider), so positions never leak across profiles or contexts.
 * Only numeric offsets are retained — never secrets or PIN text.
 */
import { useEffect, useLayoutEffect } from 'react';
import { useSelector } from '../bridge';

const positions = new Map<string, number>();
const MAX_POSITIONS = 100;

export function scrollKey(profileId: number | string | null, route: string, context = ''): string {
  return `${profileId ?? 'default'}|${route}|${context}`;
}

export function saveListPosition(key: string, top: number): void {
  if (!Number.isFinite(top) || top < 0) return;
  positions.delete(key);
  positions.set(key, top);
  if (positions.size > MAX_POSITIONS) positions.delete(positions.keys().next().value!);
}

export function readListPosition(key: string): number | undefined {
  return positions.get(key);
}

export function clearProfilePositions(profileId: number | string | null): void {
  const prefix = `${profileId ?? 'default'}|`;
  for (const key of [...positions.keys()]) {
    if (key.startsWith(prefix)) positions.delete(key);
  }
}

export function mainScroller(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.main-area');
}

/** Routes that fully own their scroll (never reset by the shell). */
const SELF_MANAGED = new Set(['/', '/search']);

/**
 * The shell resets list routes on forward navigation so a new list never
 * inherits an unrelated position. Back/Forward navigation never resets —
 * the returning route restores its own anchor (or keeps the live offset).
 */
export function shouldResetMainScroll(pathname: string, navigationType: string): boolean {
  if (SELF_MANAGED.has(pathname)) return false;
  return navigationType !== 'POP';
}

/**
 * Bounded, cancellable restore of a saved `.main-area` offset. Retries while
 * progressive content fills (offsets clamp low until layout arrives) and
 * yields immediately to user scroll, keys, or unmount.
 */
export function restoreMainScroll(
  target: number,
  options: { deadlineMs?: number; signal?: { cancelled: boolean } } = {},
): () => void {
  const scroller = mainScroller();
  if (!scroller || !Number.isFinite(target) || target < 0) return () => {};
  if (target === 0) { scroller.scrollTop = 0; return () => {}; }
  const deadline = performance.now() + (options.deadlineMs ?? 2000);
  let frame = 0;
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    cancelAnimationFrame(frame);
    scroller.removeEventListener('wheel', interrupt);
    scroller.removeEventListener('touchmove', interrupt);
    scroller.removeEventListener('pointerdown', interrupt);
    scroller.removeEventListener('keydown', interruptKey);
  };
  const interrupt = () => { finish(); };
  const interruptKey = (event: KeyboardEvent) => {
    if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) finish();
  };
  const tick = () => {
    if (done || options.signal?.cancelled) { finish(); return; }
    scroller.scrollTop = target;
    if (scroller.scrollTop >= target - 1 || performance.now() >= deadline) finish();
    else frame = requestAnimationFrame(tick);
  };
  scroller.addEventListener('wheel', interrupt, { passive: true });
  scroller.addEventListener('touchmove', interrupt, { passive: true });
  scroller.addEventListener('pointerdown', interrupt, { passive: true });
  scroller.addEventListener('keydown', interruptKey);
  frame = requestAnimationFrame(tick);
  return finish;
}

/**
 * Profile id for scroll namespacing. Null-safe: isolated component tests may
 * provide a partial store without a session.
 */
export function useActiveProfileId(): number | null {
  try {
    return useSelector((current) => current?.session?.activeProfile ?? null) as number | null;
  } catch {
    return null;
  }
}

/**
 * Save `.main-area` continuously and restore the namespaced anchor on
 * Back/Forward once `ready` (data and layout present). New lists, filter
 * changes, and explicit resets use a fresh key, so they start at the top by
 * construction. Unmount never saves: the next route may already have clamped
 * the shared scroller.
 *
 * `active` is false for a retained-but-hidden screen: it must neither save the
 * visible tab's offset nor restore itself before it is displayed again.
 */
export function useListScrollRestore(key: string, navigationType: string, ready = true, active = true): void {
  useLayoutEffect(() => {
    if (!active || !ready || navigationType !== 'POP') return;
    const saved = readListPosition(key);
    if (saved !== undefined) return restoreMainScroll(saved);
  }, [key, navigationType, ready, active]);
  useEffect(() => {
    if (!active) return;
    const scroller = mainScroller();
    if (!scroller) return;
    const save = () => saveListPosition(key, scroller.scrollTop);
    scroller.addEventListener('scroll', save, { passive: true });
    return () => scroller.removeEventListener('scroll', save);
  }, [key, active]);
}
