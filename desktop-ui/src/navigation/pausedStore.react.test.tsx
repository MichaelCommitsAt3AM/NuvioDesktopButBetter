import { memo, StrictMode, useLayoutEffect, useState } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { BridgeStoreContext, getSnapshot, useSelector } from '../bridge';
import { createPausedStore } from './pausedStore';

afterEach(cleanup);

it('keeps mounted component state while hidden snapshots pause, then catches up before paint', () => {
  let snapshot = getSnapshot();
  const listeners = new Set<() => void>();
  const source = {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
  const store = createPausedStore(source);
  const rendered = vi.fn();
  const Probe = memo(function Probe() {
    const count = useSelector(state => state.library.items.length);
    const [draft] = useState('kept');
    rendered();
    return <span>{draft}:{count}</span>;
  });
  function Pane({ active }: { active: boolean }) {
    useLayoutEffect(() => { store.setActive(active); return () => store.setActive(false); }, [active]);
    return <BridgeStoreContext.Provider value={store}><Probe /></BridgeStoreContext.Provider>;
  }
  const tree = (active: boolean) => <StrictMode><Pane active={active} /></StrictMode>;
  const view = render(tree(true));
  view.rerender(tree(false));
  rendered.mockClear();
  act(() => {
    snapshot = { ...snapshot, library: { ...snapshot.library, items: [{ id: 'new', type: 'movie', name: 'New title', poster: null, background: null, logo: null, description: null, releaseInfo: null, rating: null, genres: [] }] } };
    listeners.forEach(listener => listener());
  });
  expect(rendered).not.toHaveBeenCalled();
  expect(screen.getByText('kept:0')).toBeInTheDocument();
  view.rerender(tree(true));
  expect(screen.getByText('kept:1')).toBeInTheDocument();
  view.unmount();
  expect(listeners.size).toBe(0);
});
