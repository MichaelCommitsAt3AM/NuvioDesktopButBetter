import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Poster } from './Poster';

const bridge = vi.hoisted(() => ({ enabled: true, call: vi.fn() }));
vi.mock('../bridge', () => ({
  useSelector: (select: any) => select({ library: { items: [] }, session: { activeProfile: 1 } }),
  useFeatureSnapshot: (topic: string) => topic === 'appearance' ? { posters: { pattern: bridge.enabled ? 'https://custom.test/{imdb_id}' : '', activeScreens: ['home'] } } : undefined,
  call: (...args: unknown[]) => bridge.call(...args),
  actions: { removeFromLibrary: vi.fn(), addToLibrary: vi.fn() },
}));
beforeEach(() => {
  bridge.enabled = true; bridge.call.mockReset().mockResolvedValue({ url: 'https://custom.test/tt123' });
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const item = { id: 'tt123', type: 'movie', name: 'Movie', poster: 'https://custom.test/old', rawPoster: 'https://original.test/poster.jpg', background: null, logo: null, description: null, releaseInfo: null, rating: null, genres: [] };

it('falls back to original artwork once when a custom poster fails', async () => {
  const { container } = render(<MemoryRouter><Poster item={item} /></MemoryRouter>);
  const image = container.querySelector('.poster-frame img')!;
  await waitFor(() => expect(image).toHaveAttribute('src', 'https://custom.test/tt123'));
  fireEvent.error(image);
  expect(image).toHaveAttribute('src', 'https://original.test/poster.jpg');
  fireEvent.error(image);
  expect(image).toHaveAttribute('src', 'https://original.test/poster.jpg');
  expect(bridge.call).toHaveBeenCalledTimes(1);
});

it('restores original artwork when custom posters are disabled', () => {
  bridge.enabled = false;
  const { container } = render(<MemoryRouter><Poster item={item} /></MemoryRouter>);
  expect(container.querySelector('.poster-frame img')).toHaveAttribute('src', 'https://original.test/poster.jpg');
  expect(bridge.call).not.toHaveBeenCalled();
});
