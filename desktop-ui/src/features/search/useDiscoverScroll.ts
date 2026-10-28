import { useLayoutEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useTabNavigationType } from '../../navigation/tabActivity';

const positions = new Map<string, { catalog: string; top: number; renderedCount: number }>();
const MAX_POSITIONS = 40;

/** Keep a Discover history entry's position separate from searches and other profiles. */
export function useDiscoverScroll(profileId: number | null, catalog: string | null, searching: boolean, onPosition: (top: number) => void, active = true) {
  const location = useLocation();
  const navigationType = useTabNavigationType();
  const mayRestore = useRef(navigationType === 'POP');
  const previousActive = useRef(active);
  const restoring = useRef(false);
  const save = useRef(() => {});
  const positionCallback = useRef(onPosition);
  positionCallback.current = onPosition;
  const entry = `${profileId}:${location.key}`;
  const previousEntry = useRef(entry);
  const initialPosition = useRef({ entry, position: navigationType === 'POP' ? positions.get(entry) : undefined });
  const initialVisibleCount = !searching && initialPosition.current.entry === entry && initialPosition.current.position?.catalog === catalog
    ? initialPosition.current.position.renderedCount : 0;

  useLayoutEffect(() => {
    if (!active) {
      // A retained-but-hidden Discover must not record another tab's offset.
      previousActive.current = false;
      return;
    }
    if (!previousActive.current || previousEntry.current !== entry) {
      // Back/Forward can change history entries without ever hiding Search.
      // Re-arm restoration for that visit, but not for catalog/query updates
      // within the same entry.
      mayRestore.current = navigationType === 'POP';
      previousActive.current = true;
      previousEntry.current = entry;
    }
    const main = document.querySelector<HTMLElement>('.main-area');
    if (!main) return;
    save.current = () => {};
    restoring.current = false;
    if (searching) {
      mayRestore.current = false;
      main.scrollTop = 0;
      return;
    }
    // Wait for the catalog snapshot if it has not arrived on return yet.
    if (catalog === null) { main.scrollTop = 0; return; }
    const previous = mayRestore.current ? positions.get(entry) : undefined;
    const target = previous?.catalog === catalog ? previous.top : 0;
    mayRestore.current = false;
    const remember = () => {
      if (restoring.current) return;
      positions.delete(entry);
      const grid = main.querySelector<HTMLElement>('.search-discover .poster-grid');
      positions.set(entry, { catalog, top: main.scrollTop, renderedCount: Number(grid?.dataset.renderedCount) || 0 });
      if (positions.size > MAX_POSITIONS) positions.delete(positions.keys().next().value!);
    };
    save.current = remember;
    restoring.current = target > 0;
    let frame = 0;
    let cancelled = false;
    let observer: ResizeObserver | undefined;
    const deadline = performance.now() + 2000;
    const finish = () => {
      restoring.current = false;
      cancelAnimationFrame(frame);
      observer?.disconnect();
    };
    const restore = () => {
      if (cancelled || !restoring.current) return;
      main.scrollTop = target;
      positionCallback.current(main.scrollTop);
      if (main.scrollTop >= target - 1 || performance.now() >= deadline) finish();
    };
    main.scrollTop = target;
    positionCallback.current(main.scrollTop);
    // Stop before paint once the saved offset is available, rather than
    // reapplying it on later frames as the grid changes.
    if (restoring.current && main.scrollTop >= target - 1) finish();
    if (restoring.current) {
      // Progressive posters and image layout can initially clamp scrollTop.
      // Retry briefly as the grid fills, without fighting subsequent user input.
      observer = new ResizeObserver(restore);
      observer.observe(main.querySelector('.search-discover') ?? main);
      const tick = () => { restore(); if (restoring.current) frame = requestAnimationFrame(tick); };
      frame = requestAnimationFrame(tick);
    } else remember();
    const interrupt = () => { if (restoring.current) { finish(); remember(); } };
    const interruptKey = (event: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) interrupt();
    };
    main.addEventListener('scroll', remember, { passive: true });
    main.addEventListener('wheel', interrupt, { passive: true });
    main.addEventListener('touchstart', interrupt, { passive: true });
    main.addEventListener('pointerdown', interrupt, { passive: true });
    main.addEventListener('keydown', interruptKey);
    return () => {
      cancelled = true;
      finish();
      save.current = () => {};
      main.removeEventListener('scroll', remember);
      main.removeEventListener('wheel', interrupt);
      main.removeEventListener('touchstart', interrupt);
      main.removeEventListener('pointerdown', interrupt);
      main.removeEventListener('keydown', interruptKey);
      // Never save here: the next route may already have shortened the shared scroller.
    };
  }, [entry, catalog, searching, active, navigationType]);

  return { save, restoring, initialVisibleCount };
}
