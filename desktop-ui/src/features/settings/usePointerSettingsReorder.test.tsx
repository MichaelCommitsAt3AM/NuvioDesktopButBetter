import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ReorderableSettingsRow } from './ReorderableSettingsRow';
import { usePointerSettingsReorder } from './usePointerSettingsReorder';

const commit = vi.fn();
function Harness({ pinned = false }: { pinned?: boolean }) {
  const [items, setItems] = useState([{ key: 'A', isPinnedToTop: pinned }, { key: 'B' }, { key: 'C' }]);
  const reorder = usePointerSettingsReorder(items, async (key, targetKey) => {
    await commit(key, targetKey);
    setItems(current => { const next = [...current]; const from = next.findIndex(item => item.key === key); const to = next.findIndex(item => item.key === targetKey); next.splice(to, 0, next.splice(from, 1)[0]); return next; });
  });
  return <section className="settings-reorder-list">{reorder.items.map(item => <ReorderableSettingsRow key={item.key} rowKey={item.key} title={item.key} description="Description" status="Visible" enabled pinned={item.isPinnedToTop} onToggle={() => {}} pointer={reorder.pointer(item)} drag={{ dragging: false, dropTarget: false, onDragStart() {}, onDragEnd() {}, onDragOver() {}, onDrop() {}, onKeyboardMove() {} }} />)}</section>;
}
beforeEach(() => {
  commit.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal('PointerEvent', MouseEvent);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function(this: HTMLElement) {
    const row = this.closest<HTMLElement>('[data-settings-row-key]');
    const index = row ? Array.from(row.parentElement!.children).indexOf(row) : 0;
    return { top: index * 100, bottom: index * 100 + 100, left: 0, right: 600, width: 600, height: 100, x: 0, y: index * 100, toJSON() {} };
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function order() { return Array.from(document.querySelectorAll('[data-settings-row-key]')).map(row => row.getAttribute('data-settings-row-key')); }
describe('pointer settings reordering', () => {
  it('moves rows live across centers and saves their final position on release', async () => {
    render(<Harness />);
    const handle = screen.getByLabelText('Reorder A');
    fireEvent.pointerDown(handle, { button: 0, clientY: 50 });
    fireEvent.pointerMove(handle, { clientY: 180 });
    expect(order()).toEqual(['B', 'A', 'C']);
    expect(commit).not.toHaveBeenCalled();
    fireEvent.pointerUp(handle, { clientY: 180 });
    await waitFor(() => expect(commit).toHaveBeenCalledWith('A', 'B'));
    await waitFor(() => expect(order()).toEqual(['B', 'A', 'C']));
  });
  it('cancels without saving and does not cross a pinned row', () => {
    render(<Harness pinned />);
    const handle = screen.getByLabelText('Reorder C');
    fireEvent.pointerDown(handle, { button: 0, clientY: 250 });
    fireEvent.pointerMove(handle, { clientY: 10 });
    expect(order()).toEqual(['A', 'B', 'C']);
    fireEvent.pointerCancel(handle);
    expect(commit).not.toHaveBeenCalled();
  });
});
