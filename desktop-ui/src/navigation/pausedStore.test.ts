import { expect, it, vi } from 'vitest';
import { createPausedStore } from './pausedStore';

function source() {
  let value = { version: 0 };
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => value,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    update(version: number) { value = { version }; listeners.forEach(listener => listener()); },
    listeners,
  };
}

it('shares one subscription, freezes hidden snapshots and catches up once on activation', () => {
  const upstream = source();
  const store = createPausedStore(upstream);
  const changed = vi.fn();
  const stop = store.subscribe(changed);
  const stopOther = store.subscribe(vi.fn());
  store.setActive(true);
  expect(upstream.listeners.size).toBe(1);
  upstream.update(1);
  expect(changed).toHaveBeenCalledOnce();
  store.setActive(false);
  const hidden = store.getSnapshot();
  expect(upstream.listeners.size).toBe(0);
  upstream.update(2);
  upstream.update(3);
  expect(store.getSnapshot()).toBe(hidden);
  expect(changed).toHaveBeenCalledOnce();
  store.setActive(true);
  expect(store.getSnapshot()).toBe(upstream.getSnapshot());
  expect(changed).toHaveBeenCalledTimes(2);
  store.setActive(true);
  expect(changed).toHaveBeenCalledTimes(2);
  stop(); stopOther();
  expect(upstream.listeners.size).toBe(0);
});

it('supports effect cleanup/restart and independent profile stores', () => {
  const upstream = source();
  const old = createPausedStore(upstream);
  const oldChanged = vi.fn();
  const stop = old.subscribe(oldChanged);
  old.setActive(true);
  old.setActive(false); stop();
  const fresh = createPausedStore(upstream);
  const changed = vi.fn();
  fresh.subscribe(changed);
  fresh.setActive(true);
  upstream.update(2);
  expect(oldChanged).not.toHaveBeenCalled();
  expect(changed).toHaveBeenCalledOnce();
  fresh.setActive(false);
  fresh.setActive(true);
  upstream.update(3);
  expect(changed).toHaveBeenCalledTimes(2);
});

it('catches updates between activation and the first subscriber', () => {
  const upstream = source();
  const store = createPausedStore(upstream);
  store.setActive(true);
  upstream.update(1);
  store.subscribe(vi.fn());
  expect(store.getSnapshot()).toBe(upstream.getSnapshot());
});
