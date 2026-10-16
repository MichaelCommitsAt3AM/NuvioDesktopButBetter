import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { flipDeltas } from './placementFlip';
import { useDisintegratingRemoval } from './disintegration';
import { useState } from 'react';

afterEach(cleanup);

describe('flipDeltas', () => {
  it('reports only moved keys present in both frames', () => {
    const before = new Map([['a', { left: 0, top: 0 }], ['b', { left: 100, top: 0 }], ['gone', { left: 200, top: 0 }]]);
    const after = new Map([['a', { left: 0, top: 0 }], ['b', { left: 0, top: 0 }], ['new', { left: 300, top: 0 }]]);
    const deltas = flipDeltas(before, after);
    expect([...deltas.keys()]).toEqual(['b']);
    expect(deltas.get('b')).toEqual({ dx: 100, dy: 0 });
  });
});

describe('useDisintegratingRemoval', () => {
  function List({ fail = false }: { fail?: boolean }) {
    const [items, setItems] = useState([{ id: 'a' }, { id: 'b' }]);
    const { visible, bursting, remove } = useDisintegratingRemoval(items, (item) => item.id);
    return <>{visible.map((item) => <button key={item.id} className={bursting.has(item.id) ? 'is-disintegrating' : ''} onClick={() => {
      void remove(item, async () => {
        if (fail) throw new Error('Repository unavailable');
        setItems((current) => current.filter((entry) => entry.id !== item.id));
      }).catch(() => {});
    }}>{item.id}</button>)}</>;
  }

  it('holds the card through the effect and settles neighbors once', async () => {
    vi.useFakeTimers();
    try {
      render(<List />);
      await act(async () => { fireEvent.click(screen.getByText('a')); });
      // Repository data dropped the item, but the bursting card stays mounted.
      expect(screen.getByText('a')).toHaveClass('is-disintegrating');
      expect(screen.getByText('b')).toBeInTheDocument();
      act(() => vi.advanceTimersByTime(550));
      expect(screen.queryByText('a')).toBeNull();
      expect(screen.getByText('b')).toBeInTheDocument();
    } finally { vi.useRealTimers(); }
  });

  it('restores the card when the repository call fails', async () => {
    render(<List fail />);
    fireEvent.click(screen.getByText('a'));
    await act(async () => {});
    expect(screen.getByText('a')).not.toHaveClass('is-disintegrating');
    expect(screen.getByText('b')).toBeInTheDocument();
  });

  it('ignores a second removal while bursting', () => {
    vi.useFakeTimers();
    try {
      render(<List />);
      const card = screen.getByText('a');
      fireEvent.click(card);
      fireEvent.click(card);
      expect(screen.getAllByText('a')).toHaveLength(1);
      act(() => vi.advanceTimersByTime(550));
    } finally { vi.useRealTimers(); }
  });
});
