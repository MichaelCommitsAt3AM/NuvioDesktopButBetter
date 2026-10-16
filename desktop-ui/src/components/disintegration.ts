import { useLayoutEffect, useRef, useState } from 'react';

/**
 * Destructive-removal state machine mirroring Kotlin's disintegration
 * arming (`MainAppContent.kt`): the user action calls the real repository
 * exactly once; while the ash effect plays the card stays mounted in place
 * so neighbors settle once. Failure restores the card and rethrows for the
 * caller's error path. Reduced motion collapses to a short fade.
 */
export function removalDurationMs(): number {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 160 : 550;
}

export function useDisintegratingRemoval<T>(items: readonly T[], keyOf: (item: T) => string, scope?: string | number | null) {
  const [extra, setExtra] = useState<ReadonlyMap<string, T>>(new Map());
  const [bursting, setBursting] = useState<ReadonlySet<string>>(new Set());
  const timers = useRef<number[]>([]);
  const slots = useRef(new Map<string, number>());
  const removing = useRef(new Set<string>());
  const generation = useRef(0);
  const currentScope = useRef(scope);
  useLayoutEffect(() => {
    generation.current += 1;
    if (currentScope.current !== scope) {
      currentScope.current = scope;
      slots.current.clear(); removing.current.clear();
      setExtra(new Map()); setBursting(new Set());
    }
    return () => { generation.current += 1; timers.current.forEach((timer) => window.clearTimeout(timer)); timers.current = []; };
  }, [scope]);
  const live = new Set(items.map(keyOf));
  // Keep bursting cards mounted until their effect finishes.
  const visible = [...items];
  for (const [key, item] of [...(currentScope.current === scope ? extra : new Map<string, T>())].sort(([a], [b]) => (slots.current.get(a) ?? 0) - (slots.current.get(b) ?? 0))) {
    if (!live.has(key)) visible.splice(Math.min(slots.current.get(key) ?? visible.length, visible.length), 0, item);
  }

  const remove = async (item: T, operation: () => Promise<unknown>): Promise<void> => {
    const ticket = generation.current;
    const key = keyOf(item);
    if (removing.current.has(key)) return;
    removing.current.add(key);
    slots.current.set(key, visible.findIndex((entry) => keyOf(entry) === key));
    setExtra((current) => new Map(current).set(key, item));
    setBursting((current) => new Set(current).add(key));
    try {
      await operation();
    } catch (cause) {
      if (generation.current !== ticket) throw cause;
      removing.current.delete(key);
      slots.current.delete(key);
      setExtra((current) => { const next = new Map(current); next.delete(key); return next; });
      setBursting((current) => { const next = new Set(current); next.delete(key); return next; });
      throw cause;
    }
    if (generation.current !== ticket) return;
    timers.current.push(window.setTimeout(() => {
      removing.current.delete(key);
      slots.current.delete(key);
      setExtra((current) => { const next = new Map(current); next.delete(key); return next; });
      setBursting((current) => { const next = new Set(current); next.delete(key); return next; });
    }, removalDurationMs()));
  };

  return { visible, bursting: currentScope.current === scope ? bursting : new Set<string>(), remove };
}
