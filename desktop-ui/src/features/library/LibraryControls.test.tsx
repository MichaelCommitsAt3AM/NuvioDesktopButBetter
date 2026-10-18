import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LibraryPage } from './LibraryPage';

const bridge = vi.hoisted(() => ({
  extras: {} as Record<string, unknown>,
  items: [] as unknown[],
  call: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('../../bridge', () => ({
  useSelector: (select: (state: unknown) => unknown) => select({ library: { items: bridge.items, loading: false, error: null }, session: { activeProfile: 7 } }),
  useFeatureSnapshot: (topic: string) => topic === 'libraryExtras' ? bridge.extras : undefined,
  call: (...args: unknown[]) => bridge.call(...args),
  refreshFeature: (...args: unknown[]) => bridge.refresh(...args),
  actions: { addToLibrary: vi.fn(), removeFromLibrary: vi.fn() },
}));
vi.mock('../../components/ProgressiveMount', () => ({ useProgressiveCount: (count: number) => count }));

const media = (id: string, type: string, name: string) => ({ id, type, name, poster: null, background: null, logo: null, description: '', releaseInfo: '2026', rating: null, genres: [] });
const extras = (overrides: Record<string, unknown> = {}) => ({ layout: 'vertical', sort: 'added_desc', source: 'local', sortOptions: ['added_desc', 'title_asc'], orderedKeys: [], items: [], sections: [], ...overrides });
const renderPage = () => render(<MemoryRouter initialEntries={['/library']}><LibraryPage /></MemoryRouter>);

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  bridge.call.mockReset().mockResolvedValue({});
  bridge.refresh.mockReset().mockResolvedValue({});
  bridge.items = [];
  bridge.extras = extras();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('restores the layout toggle and persists the target layout', async () => {
  bridge.extras = extras({ layout: 'horizontal' });
  renderPage();
  fireEvent.click(screen.getByRole('button', { name: 'Show vertical grid' }));
  await waitFor(() => expect(bridge.call).toHaveBeenCalledWith('library.setLayout', { layout: 'vertical' }));
});

it('shows the Kotlin sort chip with the selected label and reports the choice', async () => {
  bridge.items = [media('one', 'movie', 'One')];
  bridge.extras = extras({ sortOptions: ['default', 'added_desc', 'title_asc'], orderedKeys: ['movie|one'], items: [{ id: 'one', type: 'movie', category: 'movie', savedAt: 1, listKeys: [] }] });
  renderPage();
  const chip = screen.getByRole('button', { name: 'Sort library' });
  expect(chip).toHaveTextContent('Recently added');
  fireEvent.click(chip);
  expect(screen.getByRole('option', { name: 'Tracker order' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('option', { name: 'Title A–Z' }));
  await waitFor(() => expect(bridge.call).toHaveBeenCalledWith('library.setSort', { sort: 'title_asc' }));
});

it('shows the tracker list chip for remote sources in grid mode only', () => {
  bridge.items = [media('one', 'movie', 'One')];
  bridge.extras = extras({ source: 'trakt', sections: [{ type: 'movies', title: 'Movies', items: ['movie|one'] }], items: [{ id: 'one', type: 'movie', category: 'movie', savedAt: 1, listKeys: [] }], orderedKeys: ['movie|one'] });
  renderPage();
  expect(screen.getByRole('button', { name: 'Select list' })).toHaveTextContent('Movies');
});

it('hides the tracker list chip for the local source', () => {
  bridge.items = [media('one', 'movie', 'One')];
  bridge.extras = extras({ source: 'local', sections: [{ type: 'movies', title: 'Movies', items: ['movie|one'] }], items: [{ id: 'one', type: 'movie', category: 'movie', savedAt: 1, listKeys: [] }], orderedKeys: ['movie|one'] });
  renderPage();
  expect(screen.queryByRole('button', { name: 'Select list' })).toBeNull();
});

it('filters the grid by type through the Kotlin type chip', () => {
  bridge.items = [media('one', 'movie', 'One'), media('two', 'series', 'Two')];
  bridge.extras = extras({
    source: 'local',
    orderedKeys: ['movie|one', 'series|two'],
    items: [
      { id: 'one', type: 'movie', category: 'movie', savedAt: 1, listKeys: [] },
      { id: 'two', type: 'series', category: 'series', savedAt: 2, listKeys: [] },
    ],
  });
  renderPage();
  expect(screen.getByRole('button', { name: 'Open One' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Open Two' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Select type' }));
  fireEvent.click(screen.getByRole('option', { name: 'Movies' }));
  expect(screen.getByRole('button', { name: 'Open One' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Open Two' })).toBeNull();
});
