import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Poster } from './Poster';
import { LibraryPage } from '../features/library/LibraryPage';

const bridge = vi.hoisted(() => ({
  saved: true, watched: false, layout: 'vertical', call: vi.fn(), remove: vi.fn(), add: vi.fn(), refresh: vi.fn(),
}));
const movie = { id: 'movie', type: 'movie', name: 'Saved Movie', poster: 'poster.jpg', background: null, logo: null, description: '', releaseInfo: '2026', rating: null, genres: [] };
vi.mock('../bridge', () => ({
  useSelector: (select: (state: any) => unknown) => select({ library: { items: bridge.saved ? [movie] : [], loading: false, error: null }, session: { activeProfile: 7 } }),
  useFeatureSnapshot: (topic: string) => topic === 'homeWatched' ? { watchedKeys: bridge.watched ? ['movie:movie:-1:-1'] : [] }
    : topic === 'libraryExtras' ? { layout: bridge.layout, sort: 'added_desc', items: [], sections: [] } : undefined,
  call: (...args: unknown[]) => bridge.call(...args),
  refreshFeature: (...args: unknown[]) => bridge.refresh(...args),
  actions: { removeFromLibrary: (...args: unknown[]) => bridge.remove(...args), addToLibrary: (...args: unknown[]) => bridge.add(...args) },
}));
vi.mock('./ProgressiveMount', () => ({ useProgressiveCount: (count: number) => count }));

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  bridge.saved = true; bridge.watched = false; bridge.layout = 'vertical';
  bridge.call.mockReset().mockResolvedValue({ watched: true });
  bridge.remove.mockReset().mockResolvedValue({}); bridge.add.mockReset().mockResolvedValue({}); bridge.refresh.mockReset().mockResolvedValue({});
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it.each(['/', '/library'])('uses the same poster action menu at %s', route => {
  render(<MemoryRouter initialEntries={[route]}><Poster item={movie} /></MemoryRouter>);
  fireEvent.contextMenu(screen.getByRole('button', { name: 'Open Saved Movie' }));
  const dialog = screen.getByRole('dialog', { name: 'Actions for Saved Movie' });
  expect(dialog.parentElement).toHaveClass('home-actions-dialog');
  expect(dialog.querySelector('.home-actions-poster')).toHaveAttribute('src', 'poster.jpg');
  expect(within(dialog).getByRole('button', { name: 'Remove from library' })).toBeInTheDocument();
  expect(within(dialog).getByRole('button', { name: 'Mark as watched' })).toBeInTheDocument();
  expect(within(dialog).queryByRole('button', { name: 'Manage lists' })).toBeNull();
});

it.each(['vertical', 'horizontal'])('omits per-card list buttons in the Library %s layout', layout => {
  bridge.layout = layout;
  render(<MemoryRouter initialEntries={['/library']}><LibraryPage /></MemoryRouter>);
  expect(screen.getByRole('button', { name: 'Open Saved Movie' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /manage lists/i })).toBeNull();
  expect(screen.queryByRole('button', { name: /Show grid view|Show horizontal shelves/ })).toBeNull();
  expect(screen.getByRole('link', { name: 'Downloads' })).toHaveTextContent('Downloads');
  const fullscreen = screen.getByRole('button', { name: 'Toggle fullscreen' });
  expect(fullscreen).toHaveClass('library-fullscreen');
  expect(fullscreen.closest('.page-heading')).toBeNull();
  fireEvent.contextMenu(screen.getByRole('button', { name: 'Open Saved Movie' }));
  expect(screen.getByRole('dialog').parentElement).toHaveClass('home-actions-dialog');
});

it('removes a Library title through the existing library action', async () => {
  render(<MemoryRouter initialEntries={['/library']}><Poster item={movie} /></MemoryRouter>);
  fireEvent.contextMenu(screen.getByRole('button', { name: 'Open Saved Movie' }));
  fireEvent.click(screen.getByRole('button', { name: 'Remove from library' }));
  await waitFor(() => expect(bridge.remove).toHaveBeenCalledWith('movie', 'movie'));
});

it('shows the watched state and toggles it through the existing backend action', async () => {
  bridge.watched = true;
  render(<MemoryRouter initialEntries={['/library']}><Poster item={movie} /></MemoryRouter>);
  fireEvent.contextMenu(screen.getByRole('button', { name: 'Open Saved Movie' }));
  fireEvent.click(screen.getByRole('button', { name: 'Mark as unwatched' }));
  await waitFor(() => expect(bridge.call).toHaveBeenCalledWith('details.watched.toggle', expect.objectContaining({ type: 'movie', id: 'movie' })));
});
