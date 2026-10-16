import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { CollectionEditorPage } from './collections/CollectionsPages';
import { useDisintegratingRemoval } from '../components/disintegration';
import { saveListPosition, useListScrollRestore } from '../navigation/scrollStore';
import { EntityPage } from './details/EntityPage';

const bridge = vi.hoisted(() => ({ editor: null as unknown, call: vi.fn(async (..._: unknown[]): Promise<unknown> => ({})) }));
vi.mock('../bridge', () => ({
  call: (...args: unknown[]) => bridge.call(...args), refreshFeature: vi.fn(async () => ({})),
  useFeatureSnapshot: (topic: string) => topic === 'collectionEditor' ? bridge.editor : undefined,
  useSelector: (select: (state: unknown) => unknown) => select({ session: { activeProfile: 7 }, library: { items: [] } }),
}));
afterEach(() => { cleanup(); document.querySelector('.main-area')?.remove(); vi.useRealTimers(); });

it('collection editor can transition from cold loading to a loaded snapshot', () => {
  bridge.editor = null;
  const page = () => <MemoryRouter><CollectionEditorPage /></MemoryRouter>;
  const view = render(page());
  bridge.editor = { isNew: true, title: 'Review fixture', folders: [], availableCatalogs: [], editingFolder: null };
  expect(() => view.rerender(page())).not.toThrow();
});

it('a removed card retains its original position while disintegrating', async () => {
  vi.useFakeTimers();
  const initial = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const view = renderHook(({ items }) => useDisintegratingRemoval(items, (item) => item.id), { initialProps: { items: initial } });
  await act(async () => { await view.result.current.remove(initial[1], async () => {}); });
  view.rerender({ items: [initial[0], initial[2]] });
  expect(view.result.current.visible.map(item => item.id)).toEqual(['a', 'b', 'c']);
});

it('Back restores a saved top-of-list position instead of inheriting details scroll', () => {
  const scroller = document.createElement('main');
  scroller.className = 'main-area';
  document.body.appendChild(scroller);
  scroller.scrollTop = 450;
  saveListPosition('review-zero', 0);
  renderHook(() => useListScrollRestore('review-zero', 'POP', true));
  expect(scroller.scrollTop).toBe(0);
});

it('does not merge an old company page into a newly opened company', async () => {
  const media = (id: string) => ({ id, type: 'movie', name: id, poster: null, background: null, logo: null, description: null, releaseInfo: null, rating: null, genres: [] });
  let release!: (value: unknown) => void;
  const delayed = new Promise(resolve => { release = resolve; });
  bridge.call.mockImplementation(async (method, params) => {
    if (method === 'details.entity.page') return delayed;
    const id = (params as { entityId: number }).entityId;
    return { header: { name: `Studio ${id}`, kind: 'company' }, rails: [{ mediaType: 'movie', railType: 'popular', currentPage: 1, hasMore: true, items: [media(`Studio ${id} movie`)] }] };
  });
  render(<MemoryRouter initialEntries={['/entity/company/1']}><Link to="/entity/company/2">Next studio</Link><Routes><Route path="/entity/:kind/:entityId" element={<EntityPage />} /></Routes></MemoryRouter>);
  await screen.findByRole('heading', { name: 'Studio 1' });
  fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
  fireEvent.click(screen.getByRole('link', { name: 'Next studio' }));
  await screen.findByRole('heading', { name: 'Studio 2' });
  await act(async () => release({ page: 2, hasMore: false, items: [media('Late Studio 1 movie')] }));
  expect(screen.queryByRole('button', { name: 'Open Late Studio 1 movie' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Open Studio 2 movie' })).toBeInTheDocument();
});

it('does not save the collection after its latest title commit failed', async () => {
  bridge.editor = { isNew: true, title: 'Old title', folders: [], availableCatalogs: [], editingFolder: null };
  bridge.call.mockReset();
  bridge.call.mockImplementation(async (method) => {
    if (method === 'collections.editor.setTitle') throw new Error('Setter failed');
    return {};
  });
  render(<MemoryRouter><CollectionEditorPage /></MemoryRouter>);
  const input = screen.getByRole('textbox', { name: 'Collection name' });
  act(() => input.focus());
  fireEvent.change(input, { target: { value: 'Latest unsaved title' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save collection' }));
  await act(async () => new Promise(resolve => setTimeout(resolve, 150)));
  expect(bridge.call.mock.calls.some(([method]) => method === 'collections.editor.save')).toBe(false);
});
