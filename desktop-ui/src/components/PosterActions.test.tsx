import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Poster } from './Poster';
import { LibraryPage } from '../features/library/LibraryPage';
import { liveSourceRect } from './sourceLift';

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

it('returns to the poster artwork bounds without including its title and year', () => {
  render(<MemoryRouter><Poster item={movie}/></MemoryRouter>);
  const card = screen.getByRole('button', { name: 'Open Saved Movie' });
  const artwork = card.querySelector<HTMLElement>('.poster-frame')!;
  const artBounds = { left: 20, top: 30, width: 190, height: 285 } as DOMRect;
  const artRect = vi.spyOn(artwork, 'getBoundingClientRect').mockReturnValue(artBounds);
  const cardRect = vi.spyOn(card, 'getBoundingClientRect').mockReturnValue({ ...artBounds, height: 330 });
  try {
    fireEvent.contextMenu(card);
    expect(liveSourceRect(artwork.dataset.sourceKey!)).toEqual({ x: 20, y: 30, width: 190, height: 285 });
    expect(artRect).toHaveBeenCalled();
    expect(cardRect).not.toHaveBeenCalled();
  } finally { artRect.mockRestore(); cardRect.mockRestore(); }
});

it.each(['/', '/library', '/catalog/trending', '/search', '/search?q=movie', '/details/movie/other', '/collections/list', '/person/123'])('uses the same poster action menu at %s', route => {
  render(<MemoryRouter initialEntries={[route]}><Poster item={movie} /></MemoryRouter>);
  fireEvent.contextMenu(screen.getByRole('button', { name: 'Open Saved Movie' }));
  const dialog = screen.getByRole('dialog', { name: 'Actions for Saved Movie' });
  expect(dialog.parentElement).toHaveClass('home-actions-dialog');
  expect(dialog.querySelector('.home-actions-poster')).toHaveAttribute('src', 'poster.jpg');
  expect(within(dialog).getByRole('button', { name: 'Remove from library' })).toBeInTheDocument();
  expect(within(dialog).getByRole('button', { name: 'Mark as watched' })).toBeInTheDocument();
  expect(within(dialog).queryByRole('button', { name: 'Manage lists' })).toBeNull();
  expect(within(dialog).queryByRole('button', { name: 'View details' })).toBeNull();
  expect(document.querySelector('.poster-frame[data-source-key]')).not.toBeNull();
});

it('returns to the category card when cached Home contains the same title', () => {
  const view = render(<MemoryRouter initialEntries={['/catalog/popular']}>
    <div hidden data-testid="cached-home"><Poster item={movie}/></div>
    <div data-testid="category"><Poster item={movie}/></div>
  </MemoryRouter>);
  const hiddenArtwork = view.getByTestId('cached-home').querySelector<HTMLElement>('.poster-frame')!;
  const categoryArtwork = view.getByTestId('category').querySelector<HTMLElement>('.poster-frame')!;
  const hiddenRect = vi.spyOn(hiddenArtwork, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 0, height: 0 } as DOMRect);
  const categoryRect = vi.spyOn(categoryArtwork, 'getBoundingClientRect').mockReturnValue({ left: 300, top: 250, width: 190, height: 285 } as DOMRect);
  try {
    fireEvent.contextMenu(within(view.getByTestId('category')).getByRole('button', { name: 'Open Saved Movie' }));
    expect(liveSourceRect(categoryArtwork.dataset.sourceKey!)).toEqual({ x: 300, y: 250, width: 190, height: 285 });
    expect(hiddenRect).not.toHaveBeenCalled();
  } finally { hiddenRect.mockRestore(); categoryRect.mockRestore(); }
});

it.each(['vertical', 'horizontal'])('renders the Library layout toggle without per-card list buttons in the %s layout', layout => {
  bridge.layout = layout;
  render(<MemoryRouter initialEntries={['/library']}><LibraryPage /></MemoryRouter>);
  expect(screen.getByRole('button', { name: 'Open Saved Movie' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /manage lists/i })).toBeNull();
  expect(screen.queryByRole('button', { name: /^Actions for / })).toBeNull();
  expect(screen.getByRole('button', { name: layout === 'vertical' ? 'Show horizontal shelves' : 'Show vertical grid' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Downloads' })).toHaveTextContent('Downloads');
  const fullscreen = screen.getByRole('button', { name: 'Enter fullscreen' });
  expect(fullscreen).toHaveClass('fullscreen-toggle');
  expect(fullscreen.parentElement).toBe(document.body);
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


it('removes completed poster shimmers and keeps cached cards free of loading animations', () => {
  const item = { ...movie, id: 'shimmer-lifecycle', name: 'Shimmer lifecycle', poster: '/shimmer-lifecycle.jpg' };
  const page = () => <MemoryRouter><Poster item={item} /></MemoryRouter>;
  const view = render(page());
  const frame = view.container.querySelector('.poster-frame')!;
  expect(frame.querySelector('.poster-loading-shimmer')).not.toBeNull();
  fireEvent.load(frame.querySelector('img')!);
  expect(frame.querySelector('.poster-loading-shimmer')).toBeNull();
  expect(frame.querySelector('img')).toHaveClass('poster-image-loaded');
  view.unmount();
  const cached = render(page());
  expect(cached.container.querySelector('.poster-loading-shimmer')).toBeNull();
  fireEvent.error(cached.container.querySelector('.poster-frame img')!);
  expect(cached.container.querySelector('.poster-loading-shimmer')).not.toBeNull();
});
it('keeps loading placeholders for missing artwork', () => {
  const view = render(<MemoryRouter><Poster item={{ ...movie, id: 'no-art', poster: null }} /></MemoryRouter>);
  expect(view.container.querySelector('.poster-loading-shimmer')).not.toBeNull();
});
