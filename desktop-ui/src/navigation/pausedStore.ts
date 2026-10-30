export type SnapshotStore<T> = {
  getSnapshot: () => T;
  subscribe: (listener: () => void) => () => void;
};

/** One upstream subscription per visible tab; hidden trees keep their last snapshot. */
export function createPausedStore<T>(source: SnapshotStore<T>) {
  let snapshot = source.getSnapshot();
  let active = false;
  let detach: (() => void) | undefined;
  const listeners = new Set<() => void>();
  const refresh = () => {
    const next = source.getSnapshot();
    if (Object.is(next, snapshot)) return;
    snapshot = next;
    listeners.forEach(listener => listener());
  };
  const connect = () => {
    if (active && listeners.size && !detach) {
      detach = source.subscribe(refresh);
      // Close the gap between a layout-effect activation and the first
      // passive subscription (also happens during StrictMode restarts).
      refresh();
    }
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      connect();
      return () => {
        listeners.delete(listener);
        if (!listeners.size) { detach?.(); detach = undefined; }
      };
    },
    setActive(value: boolean) {
      active = value;
      if (active) { connect(); refresh(); }
      else { detach?.(); detach = undefined; }
    },
  };
}
