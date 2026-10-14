import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CollectionsPage } from './CollectionManagementPage';
const bridge = vi.hoisted(() => ({ items: [] as any[], call: vi.fn(), refresh: vi.fn() }));
vi.mock('../../bridge', () => ({ useFeatureSnapshot: () => ({ items: bridge.items }), call: (...args: unknown[]) => bridge.call(...args), refreshFeature: (...args: unknown[]) => bridge.refresh(...args) }));
function page() { return <MemoryRouter initialEntries={['/collections']}><Routes><Route path="/collections" element={<CollectionsPage />} /><Route path="/collections/:id/edit" element={<div>Collection editor</div>} /></Routes></MemoryRouter>; }
beforeEach(() => { bridge.items = []; bridge.call.mockReset().mockResolvedValue({}); bridge.refresh.mockReset().mockResolvedValue({}); });
afterEach(cleanup);
describe('Kotlin collection management parity', () => {
  it('opens the editor for an existing collection', () => {
    bridge.items = [{ id: 'a', title: 'Movies', folders: [], pinToTop: false }];
    render(page()); fireEvent.click(screen.getByRole('button', { name: 'Edit Movies' }));
    expect(screen.getByText('Collection editor')).toBeInTheDocument();
    expect(bridge.call).not.toHaveBeenCalled();
  });
  it('cancels deletion without removing the collection', () => {
    bridge.items = [{ id: 'a', title: 'Movies', folders: [], pinToTop: false }];
    render(page()); fireEvent.click(screen.getByRole('button', { name: 'Delete Movies' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Delete Collection' })).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull(); expect(bridge.call).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Movies' })).toBeInTheDocument();
  });
  it('retains editable import text and existing collections when importing fails', async () => {
    bridge.items = [{ id: 'a', title: 'Movies', folders: [], pinToTop: false }];
    bridge.call.mockImplementation(method => method === 'collections.validateImport' ? Promise.resolve({ valid: true }) : Promise.reject(new Error('Import unavailable')));
    render(page()); fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'JSON' }), { target: { value: '[]' } });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Import' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Import unavailable'));
    expect(screen.getByRole('textbox', { name: 'JSON' })).toHaveValue('[]');
    expect(screen.getByRole('textbox', { name: 'JSON' })).toBeEnabled();
    expect(screen.getByRole('heading', { name: 'Movies' })).toBeInTheDocument();
  });

  it('shows the summary, single create button and Kotlin empty state with Layout back navigation', () => {
    render(page()); expect(screen.getByText('0 collection(s), 0 folder(s)')).toBeInTheDocument();
    expect(screen.getByText('Create one to organize your catalogs.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/settings/appearance');
    fireEvent.click(screen.getByRole('button', { name: 'New Collection' })); expect(screen.getByText('Collection editor')).toBeInTheDocument();
    expect(bridge.call).not.toHaveBeenCalled();
  });
  it('copies exported JSON directly and reports clipboard failures', async () => {
    bridge.call.mockResolvedValue({ json: '[{"id":"test"}]' });
    const copy = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: copy } });
    render(page()); fireEvent.click(screen.getByRole('button', { name: 'Copy JSON' }));
    await waitFor(() => expect(copy).toHaveBeenCalledWith('[{"id":"test"}]'));
    expect(screen.queryByRole('dialog')).toBeNull();
    copy.mockRejectedValue(new Error('Clipboard unavailable')); fireEvent.click(screen.getByRole('button', { name: 'Copy JSON' }));
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Copy JSON' })).toBeInTheDocument());
  });
  it('validates before importing and keeps invalid input editable', async () => {
    bridge.call.mockImplementation((method) => Promise.resolve(method === 'collections.validateImport' ? { valid: false, error: 'Invalid JSON: test' } : {}));
    render(page()); fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    const dialog = screen.getByRole('dialog', { name: 'Import Collections' });
    expect(within(dialog).getByRole('button', { name: 'Import' })).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox', { name: 'JSON' }), { target: { value: 'bad' } }); fireEvent.click(within(dialog).getByRole('button', { name: 'Import' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Invalid JSON: test'));
    expect(bridge.call).not.toHaveBeenCalledWith('collections.import', expect.anything());
    bridge.call.mockImplementation((method) => Promise.resolve(method === 'collections.validateImport' ? { valid: true } : {}));
    fireEvent.change(screen.getByRole('textbox', { name: 'JSON' }), { target: { value: '[]' } }); fireEvent.click(within(dialog).getByRole('button', { name: 'Import' }));
    await waitFor(() => expect(bridge.call).toHaveBeenCalledWith('collections.import', { json: '[]', confirmed: true }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull()); expect(bridge.refresh).toHaveBeenCalledWith('collections');
  });
  it('renders compact pinned cards, persists reordering and confirms deletion', async () => {
    bridge.items = [{ id: 'a', title: 'Movies', pinToTop: true, folders: [{ id: 'f' }] }, { id: 'b', title: 'Shows', pinToTop: false, folders: [] }];
    render(page()); expect(screen.getByText('2 collection(s), 1 folder(s)')).toBeInTheDocument(); expect(screen.getByText('1 folder(s) · Pinned')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Reorder Movies' }), { key: 'ArrowDown' });
    await waitFor(() => expect(bridge.call).toHaveBeenCalledWith('collections.move', { from: 0, to: 1 }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Delete Movies' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Delete Movies' })); expect(bridge.call).not.toHaveBeenCalledWith('collections.remove', expect.anything());
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Delete Collection' })).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(bridge.call).toHaveBeenCalledWith('collections.remove', { id: 'a' }));
  });
  it('persists pointer drag reordering from the handle', async () => {
    bridge.items = [{ id: 'a', title: 'Movies', folders: [], pinToTop: false }, { id: 'b', title: 'Shows', folders: [], pinToTop: false }];
    const view = render(page());
    const rows = view.container.querySelectorAll('article');
    rows.forEach((row, index) => vi.spyOn(row, 'getBoundingClientRect').mockReturnValue({ top: index * 120, height: 110 } as DOMRect));
    const handle = screen.getByRole('button', { name: 'Reorder Movies' });
    Object.assign(handle, { setPointerCapture: vi.fn(), hasPointerCapture: () => true, releasePointerCapture: vi.fn() });
    const pointer = (type: string, y: number) => { const event = new Event(type, { bubbles: true }); Object.assign(event, { button: 0, pointerId: 1, clientY: y }); fireEvent(handle, event); };
    pointer('pointerdown', 30); pointer('pointermove', 200); pointer('pointerup', 200);
    await waitFor(() => expect(bridge.call).toHaveBeenCalledWith('collections.move', { from: 0, to: 1 }));
  });
  it('retains collections and surfaces failed deletion', async () => {
    bridge.items = [{ id: 'a', title: 'Movies', folders: [], pinToTop: false }]; bridge.call.mockRejectedValue(new Error('Backend unavailable'));
    render(page()); fireEvent.click(screen.getByRole('button', { name: 'Delete Movies' })); fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Backend unavailable')); expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
