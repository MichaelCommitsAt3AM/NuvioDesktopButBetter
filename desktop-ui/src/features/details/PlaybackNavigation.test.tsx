import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { DetailsPage } from './DetailsPage';
import { StreamsPage } from '../streams/StreamsPage';

const bridge = vi.hoisted(() => ({
  state: {} as any,
  primaryAction: null as any,
  call: vi.fn(),
  loadStreams: vi.fn(),
}));
vi.mock('../../bridge', () => ({
  useSelector: (select: (state: any) => unknown) => select(bridge.state),
  useFeatureSnapshot: (topic: string) => topic === 'playbackSettings'
    ? { streamAutoPlayMode: 'FIRST_STREAM', showPlayerLoadingStatus: true }
    : topic === 'streamSelection' ? { autoPlayStreamId: null, autoPlay: { enabled: true, overlayVisible: true } } : undefined,
  refreshFeature: vi.fn(async () => ({ streamAutoPlayMode: 'FIRST_STREAM' })),
  call: (...args: unknown[]) => bridge.call(...args),
  actions: { loadDetails: vi.fn(async () => {}), loadStreams: (...args: unknown[]) => bridge.loadStreams(...args) },
  BridgeError: class extends Error {},
}));
vi.mock('./DetailsExtras', () => ({ DetailsExtras: () => null }));
// These tests check which title owns the artwork; decode timing is covered by StreamsArtwork.test.
vi.mock('../../components/useDecodedImage', () => ({ useDecodedImage: (url?: string) => ({ ready: !!url, failed: false }) }));

const media = (id: string, type = 'movie') => ({ id, type, name: id, background: `${id}-background.jpg`, logo: `${id}-logo.png`, poster: null, genres: [] });
function Location() { const location = useLocation(); return <output data-testid="location">{location.pathname}{location.search}</output>; }
function renderDetails(type = 'movie') {
  return render(<MemoryRouter initialEntries={[`/details/${type}/ted`]}><Routes>
    <Route path="/details/:type/:id" element={<DetailsPage />} />
    <Route path="/details/:type/:id/streams/:videoId" element={<Location />} />
  </Routes></MemoryRouter>);
}
function renderStreams(query = '') {
  return render(<MemoryRouter initialEntries={[`/details/movie/ted/streams/ted${query}`]}><Routes>
    <Route path="/details/:type/:id/streams/:videoId" element={<StreamsPage />} />
  </Routes></MemoryRouter>);
}
beforeEach(() => {
  bridge.state = { details: { media: media('ted'), episodes: [], loading: false }, library: { items: [] }, streams: { groups: [], loading: true }, playback: {}, session: { activeProfile: 7 } };
  bridge.primaryAction = { label: 'Resume', videoId: 'ted', seasonNumber: null, episodeNumber: null, resumePositionMs: 25_000 };
  bridge.call.mockReset();
  bridge.call.mockImplementation(async () => ({ loaded: true, primaryAction: bridge.primaryAction }));
  bridge.loadStreams.mockReset();
  bridge.loadStreams.mockResolvedValue(undefined);
});
afterEach(() => cleanup());

describe('details playback action', () => {
  it('shows Resume and routes the saved movie position to playback', async () => {
    renderDetails();
    fireEvent.click(await screen.findByRole('button', { name: 'Resume' }));
    expect(screen.getByTestId('location').textContent).toContain('/streams/ted?');
    expect(screen.getByTestId('location').textContent).toContain('resumeMs=25000');
  });
  it('shows Play for movies without resumable progress', async () => {
    bridge.primaryAction = { label: 'Play', videoId: 'ted', resumePositionMs: null };
    renderDetails();
    expect(await screen.findByRole('button', { name: 'Play' })).toBeInTheDocument();
  });
  it('uses Kotlin’s series label and opens that episode rather than the series id', async () => {
    bridge.state.details.media = media('ted', 'series');
    bridge.primaryAction = { label: 'Resume S3 E3', videoId: 'ted:3:3', seasonNumber: 3, episodeNumber: 3, resumePositionMs: 25_000 };
    renderDetails('series');
    fireEvent.click(await screen.findByRole('button', { name: 'Resume S3 E3' }));
    expect(screen.getByTestId('location').textContent).toContain('/streams/ted%3A3%3A3?');
    expect(screen.getByTestId('location').textContent).toContain('seasonNumber=3');
  });
  it('keeps long-press manual selection on the resolved resume episode', async () => {
    bridge.state.details.media = media('ted', 'series');
    bridge.primaryAction = { label: 'Resume S3 E3', videoId: 'ted:3:3', seasonNumber: 3, episodeNumber: 3, resumePositionMs: 25_000 };
    renderDetails('series');
    const button = await screen.findByRole('button', { name: 'Resume S3 E3' });
    vi.useFakeTimers();
    try {
      fireEvent.pointerDown(button, { button: 0 });
      await act(async () => { vi.advanceTimersByTime(520); });
      expect(screen.getByTestId('location').textContent).toContain('/streams/ted%3A3%3A3?manual=1');
    } finally { vi.useRealTimers(); }
  });
});

describe('loading artwork identity', () => {
  it('uses the series background rather than episode artwork during stream discovery', () => {
    bridge.state.details = { media: media('ted', 'series'), episodes: [{ id: 'ted:3:3', title: 'Episode', thumbnail: 'episode.jpg', season: 3, episode: 3 }] };
    const view = render(<MemoryRouter initialEntries={['/details/series/ted/streams/ted%3A3%3A3?episodeThumbnail=route-episode.jpg&background=ted-background.jpg']}><Routes><Route path="/details/:type/:id/streams/:videoId" element={<StreamsPage />} /></Routes></MemoryRouter>);
    expect(view.container.querySelector('.streams-backdrop-image')).toHaveAttribute('src', 'ted-background.jpg');
  });
  it('uses Continue Watching artwork immediately even when another title remains in details', async () => {
    bridge.state.details = { media: media('spiderman'), episodes: [{ id: 'ted', title: 'Wrong episode', thumbnail: 'wrong.jpg', season: 9, episode: 9 }], loading: false };
    const view = renderStreams('?title=Ted+2&background=ted-background.jpg&logo=ted-logo.png');
    await act(async () => {});
    expect(view.container.querySelector('.streams-backdrop-image')).toHaveAttribute('src', 'ted-background.jpg');
    expect(view.container.querySelector('.streams-opening-logo')).toHaveAttribute('src', 'ted-logo.png');
    expect(bridge.loadStreams).toHaveBeenCalledWith('movie', 'ted', 'ted', undefined, undefined, false);
    bridge.state.details.media = media('ted');
    bridge.state.details.episodes = [];
    view.rerender(<MemoryRouter initialEntries={['/details/movie/ted/streams/ted?title=Ted+2&background=ted-background.jpg&logo=ted-logo.png']}><Routes><Route path="/details/:type/:id/streams/:videoId" element={<StreamsPage />} /></Routes></MemoryRouter>);
    expect(view.container.querySelector('.streams-backdrop-image')).toHaveAttribute('src', 'ted-background.jpg');
  });
  it('never falls back to unrelated artwork when selected title artwork is unavailable', () => {
    bridge.state.details.media = media('ted', 'series');
    const view = renderStreams('?title=Ted+2');
    expect(view.container.querySelector('.streams-backdrop-image')).toBeNull();
    expect(view.container.querySelector('.streams-opening-logo')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Ted 2' })).toBeInTheDocument();
  });
});


it('keeps the details page and backdrop mounted when enrichment updates the same title', async () => {
  const view = renderDetails();
  await act(async () => {});
  const hero = view.container.querySelector('.detail-content-arrive');
  const backdrop = document.querySelector('.detail-viewport-backdrop');
  expect(hero).not.toBeNull();
  expect(backdrop).not.toBeNull();
  bridge.state.details = { ...bridge.state.details, media: { ...media('ted'), background: 'enriched.jpg', logo: 'enriched-logo.png', description: 'Enriched details' } };
  view.rerender(<MemoryRouter initialEntries={['/details/movie/ted']}><Routes><Route path="/details/:type/:id" element={<DetailsPage />} /></Routes></MemoryRouter>);
  await act(async () => {});
  expect(view.container.querySelector('.detail-content-arrive')).toBe(hero);
  expect(document.querySelector('.detail-viewport-backdrop')).toBe(backdrop);
  expect(screen.queryByRole('status', { name: 'Loading title details' })).toBeNull();
});
