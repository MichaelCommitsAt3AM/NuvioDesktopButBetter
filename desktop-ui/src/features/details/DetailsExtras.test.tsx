import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { DetailsExtras, type ExtrasMeta } from './DetailsExtras';

const bridge = vi.hoisted(() => ({ details: {} as unknown, call: vi.fn(), settings: undefined as unknown, downloads: undefined as unknown }));
vi.mock('../../bridge', () => ({
  useSelector: (select: (state: any) => unknown) => select({ details: bridge.details, library: { items: [] } }),
  useFeatureSnapshot: (topic: string) => topic === 'metadataSettings' ? bridge.settings : topic === 'downloads' ? bridge.downloads : undefined,
  refreshFeature: vi.fn(async () => ({})),
  call: (...args: unknown[]) => bridge.call(...args),
}));
const meta = (id = 'movie'): ExtrasMeta => ({
  id, type: 'movie', name: id, poster: null, background: null, logo: null, description: null,
  releaseInfo: '2026', lastAirDate: null, status: null, imdbId: null, rating: null, ageRating: null,
  runtime: null, country: null, awards: null, language: null, website: null, externalRatings: [],
  genres: [], director: [], writer: [], cast: [], productionCompanies: [], networks: [],
  moreLikeThis: [], moreLikeThisSource: null, collectionName: null, collectionItems: [], trailers: [],
  links: [], seasonPosters: {}, videos: [],
});
const trailer = (id: string, type = 'Trailer') => ({ id, type, key: id, name: id, displayName: null, site: 'YouTube', official: true, seasonNumber: null, youtubeUrl: `https://youtube.com/watch?v=${id}` });
function view(id = 'movie') { return <MemoryRouter><DetailsExtras type="movie" id={id} /></MemoryRouter>; }
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  bridge.details = { media: { id: 'movie', type: 'movie' } };
  bridge.settings = { items: [
    { key: 'DETAILS', enabled: true, order: 0, tabGroup: null },
    { key: 'TRAILERS', enabled: true, order: 1, tabGroup: null },
  ] };
  bridge.call.mockReset();
  bridge.downloads = undefined;
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('preserves a touchpad scroll between enrichment capture and commit while compensating for inserted content', async () => {
  let updates = 0;
  let shift = 0;
  const main = document.createElement('main');
  main.className = 'main-area';
  Object.defineProperty(main, 'clientHeight', { value: 1000 });
  document.body.appendChild(main);
  const bounds = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const top = this.hasAttribute('data-details-anchor') ? 100 + shift - main.scrollTop : 0;
    return { top, bottom: top + 40, left: 0, right: 100, width: 100, height: 40 } as DOMRect;
  });
  bridge.call.mockImplementation(async (method: string) => method === 'details.extras' ? { ...meta(), runtime: '90m' } : { loaded: true });
  const onMetaLoaded = () => { if (++updates === 2) { main.scrollTop += 150; shift = 50; } };
  const renderView = () => <MemoryRouter><DetailsExtras type="movie" id="movie" onMetaLoaded={onMetaLoaded} /></MemoryRouter>;
  try {
    const rendered = render(renderView(), { container: main });
    expect(await screen.findByText('1h 30m')).toBeInTheDocument();
    // The reader has scrolled into a section: its box spans the viewport's top edge.
    main.scrollTop = 120;
    bridge.details = { ...bridge.details as object };
    rendered.rerender(renderView());
    await act(async () => {});
    expect(updates).toBe(2);
    expect(main.scrollTop).toBe(320);
  } finally { bounds.mockRestore(); main.remove(); }
});

it('lets enrichment push content down at the top of the page instead of scrolling it', async () => {
  let updates = 0;
  let shift = 0;
  const main = document.createElement('main');
  main.className = 'main-area';
  Object.defineProperty(main, 'clientHeight', { value: 1000 });
  document.body.appendChild(main);
  const bounds = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const top = this.hasAttribute('data-details-anchor') ? 400 + shift - main.scrollTop : 0;
    return { top, bottom: top + 40, left: 0, right: 100, width: 100, height: 40 } as DOMRect;
  });
  bridge.call.mockImplementation(async (method: string) => method === 'details.extras' ? { ...meta(), runtime: '90m' } : { loaded: true });
  const onMetaLoaded = () => { if (++updates === 2) shift = 80; };
  const renderView = () => <MemoryRouter><DetailsExtras type="movie" id="movie" onMetaLoaded={onMetaLoaded} /></MemoryRouter>;
  try {
    const rendered = render(renderView(), { container: main });
    expect(await screen.findByText('1h 30m')).toBeInTheDocument();
    bridge.details = { ...bridge.details as object };
    rendered.rerender(renderView());
    await act(async () => {});
    expect(updates).toBe(2);
    expect(main.scrollTop).toBe(0);
  } finally { bounds.mockRestore(); main.remove(); }
});

it('updates the first open page when background enrichment finishes without revisiting it', async () => {
  let payload = meta();
  bridge.call.mockImplementation(async (method: string) => method === 'details.extras' ? payload : { loaded: true });
  const rendered = render(view());
  expect(await screen.findByText('2026')).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Trailers' })).toBeNull();
  payload = { ...payload, runtime: '117m', trailers: [trailer('Enriched trailer')] };
  bridge.details = { ...bridge.details as object, related: ['new metadata event'] };
  rendered.rerender(view());
  expect(await screen.findByRole('heading', { name: 'Trailers' })).toBeInTheDocument();
  expect(await screen.findByText('Enriched trailer')).toBeInTheDocument();
  expect(screen.getByText('1h 57m')).toBeInTheDocument();
});

it('ignores a delayed response for a title that has been left', async () => {
  let finishOld!: (value: ExtrasMeta) => void;
  bridge.call.mockImplementation(async (method: string, params: { id: string }) => {
    if (method !== 'details.extras') return { loaded: true };
    if (params.id === 'old') return new Promise<ExtrasMeta>((resolve) => { finishOld = resolve; });
    return { ...meta('new'), runtime: '99m' };
  });
  const rendered = render(view('old'));
  rendered.rerender(view('new'));
  expect(await screen.findByText('1h 39m')).toBeInTheDocument();
  await act(async () => finishOld({ ...meta('old'), runtime: '88m' }));
  expect(screen.queryByText('1h 28m')).toBeNull();
  expect(screen.getByText('1h 39m')).toBeInTheDocument();
});

it('preserves the selected trailer category during later metadata updates', async () => {
  const payload = { ...meta(), trailers: [trailer('Main trailer'), trailer('Selected teaser', 'Teaser')] };
  bridge.call.mockImplementation(async (method: string) => method === 'details.extras' ? payload : { loaded: true });
  const rendered = render(view());
  await screen.findByText('Main trailer');
  fireEvent.click(screen.getByRole('button', { name: 'Trailer category' }));
  fireEvent.click(screen.getByRole('option', { name: 'Teaser (1)' }));
  expect(screen.getByText('Selected teaser')).toBeInTheDocument();
  bridge.details = { updated: true };
  rendered.rerender(view());
  await act(async () => {});
  expect(screen.getByText('Selected teaser')).toBeInTheDocument();
  expect(screen.queryByText('Main trailer')).toBeNull();
});

it('shows Home-style shimmer placeholders only for enabled, pending sections', async () => {
  let payload = meta();
  bridge.call.mockImplementation(async (method: string) => method === 'details.extras' ? payload : { loaded: true });
  bridge.details = { media: { id: 'movie', type: 'movie' }, loadingSections: ['DETAILS', 'CAST', 'TRAILERS', 'MORE_LIKE_THIS'] };
  const rendered = render(view());
  await screen.findByText('2026');

  const details = document.querySelector('[data-loading-section="DETAILS"]');
  expect(details).toBeNull();
  expect(document.querySelector('.details-info-row-loading .poster-loading-shimmer')).not.toBeNull();
  const trailers = document.querySelector('[data-loading-section="TRAILERS"]');
  expect(trailers).not.toBeNull();
  expect(trailers!.querySelector('.details-skeleton-trailer .details-skeleton-trailer-art.poster-loading-shimmer')).not.toBeNull();
  // Cast and More like this are disabled in metadata settings, so no placeholder leaks in.
  expect(document.querySelector('[data-loading-section="CAST"]')).toBeNull();
  expect(screen.queryByRole('heading', { name: 'Cast' })).toBeNull();
  expect(screen.queryByRole('heading', { name: 'More like this' })).toBeNull();

  payload = { ...payload, runtime: '117m', cast: [{ name: 'Actor', role: 'Hero', photo: null, tmdbId: 9 }], trailers: [trailer('Ready trailer')] };
  bridge.settings = { items: [
    { key: 'DETAILS', enabled: true, order: 0, tabGroup: null },
    { key: 'CAST', enabled: true, order: 1, tabGroup: null },
    { key: 'TRAILERS', enabled: true, order: 2, tabGroup: null },
  ] };
  bridge.details = { media: { id: 'movie', type: 'movie' }, loadingSections: [] };
  rendered.rerender(view());

  expect(await screen.findByText('Ready trailer')).toBeInTheDocument();
  expect(await screen.findByText('Actor')).toBeInTheDocument();
  expect(screen.getByText('1h 57m')).toBeInTheDocument();
  expect(document.querySelector('[data-loading-section]')).toBeNull();
  expect(document.querySelector('.poster-loading-card')).toBeNull();
});

it('removes pending placeholders when enrichment finishes empty or fails', async () => {
  bridge.call.mockImplementation(async (method: string) => method === 'details.extras' ? meta() : { loaded: true });
  bridge.settings = { items: [
    { key: 'CAST', enabled: true, order: 0, tabGroup: null },
    { key: 'TRAILERS', enabled: true, order: 1, tabGroup: null },
  ] };
  bridge.details = { media: { id: 'movie', type: 'movie' }, loadingSections: ['CAST', 'TRAILERS'] };
  const rendered = render(view());
  await screen.findByRole('heading', { name: 'Cast' });
  expect(document.querySelector('[data-loading-section="CAST"]')).not.toBeNull();
  expect(document.querySelector('[data-loading-section="TRAILERS"]')).not.toBeNull();

  // Empty result: the backend clears the pending keys without adding content.
  bridge.details = { media: { id: 'movie', type: 'movie' }, loadingSections: [] };
  rendered.rerender(view());
  await act(async () => {});
  expect(document.querySelector('[data-loading-section]')).toBeNull();
  expect(screen.queryByRole('heading', { name: 'Cast' })).toBeNull();
  expect(screen.queryByRole('heading', { name: 'Trailers' })).toBeNull();

  // A later re-enrichment can show them again, and a failure state removes them.
  bridge.details = { media: { id: 'movie', type: 'movie' }, loadingSections: ['CAST'] };
  rendered.rerender(view());
  await act(async () => {});
  expect(document.querySelector('[data-loading-section="CAST"]')).not.toBeNull();
  bridge.details = { media: { id: 'movie', type: 'movie' }, loadingSections: [], error: 'Enrichment failed' };
  rendered.rerender(view());
  await act(async () => {});
  expect(document.querySelector('[data-loading-section]')).toBeNull();
});

it('does not show a placeholder from a stale title event', async () => {
  bridge.call.mockImplementation(async (method: string) => method === 'details.extras' ? meta() : { loaded: true });
  bridge.settings = { items: [{ key: 'CAST', enabled: true, order: 0, tabGroup: null }] };
  bridge.details = { media: { id: 'another-movie', type: 'movie' }, loadingSections: ['CAST'] };
  render(view());
  await screen.findByRole('button', { name: /Refresh details/ });
  expect(document.querySelector('[data-loading-section="CAST"]')).toBeNull();
});

it('shows episode download progress and downloads an episode from its actions sheet', async () => {
  const episode = (n: number) => ({ id: `show:1:${n}`, title: `Episode title ${n}`, season: 1, episode: n, released: '2020-01-01', thumbnail: null, overview: null, available: true, runtime: null, rating: null, seasonPoster: null });
  const series = { ...meta('show'), type: 'series', videos: [episode(1), episode(2)] } as unknown as ExtrasMeta;
  bridge.details = { media: { id: 'show', type: 'series' } };
  bridge.settings = { items: [{ key: 'EPISODES', enabled: true, order: 0, tabGroup: null }] };
  bridge.downloads = { items: [{ parentMetaType: 'series', parentMetaId: 'show', videoId: 'show:1:1', status: 'downloading', progress: 0.25 }] };
  bridge.call.mockImplementation(async (method: string) => method === 'details.extras' ? series
    : method === 'downloads.qualityOptions' ? { loadedStreams: 3, runtimeKnown: true, options: [{ id: 'q1', tier: 'fhd_1080', sizeBytes: 1024 ** 3, bitrateKbps: 4000, codec: 'hevc', source: 'webdl' }] }
      : {});
  render(<MemoryRouter><DetailsExtras type="series" id="show" /></MemoryRouter>);
  expect(await screen.findByRole('img', { name: 'Episode title 1: Downloading 25%' })).toHaveClass('in-progress');

  fireEvent.contextMenu((await screen.findByText('Episode title 2')).closest('button')!);
  fireEvent.click(await screen.findByRole('button', { name: 'Download' }));
  await screen.findByRole('group', { name: 'Download quality' });
  expect(bridge.call).toHaveBeenCalledWith('downloads.qualityOptions', { type: 'series', id: 'show', videoId: 'show:1:2' });
  expect(screen.getByText('S1 E2 · Episode title 2')).toBeInTheDocument();
});

it('opens the quality sheet from the download control on an episode card', async () => {
  const episode = { id: 'show:1:1', title: 'Pilot', season: 1, episode: 1, released: '2020-01-01', thumbnail: null, overview: null, available: true, runtime: null, rating: null, seasonPoster: null };
  bridge.details = { media: { id: 'show', type: 'series' } };
  bridge.settings = { items: [{ key: 'EPISODES', enabled: true, order: 0, tabGroup: null }] };
  bridge.downloads = { items: [{ parentMetaType: 'series', parentMetaId: 'show', videoId: 'show:1:1', status: 'paused', progress: 0.5 }] };
  bridge.call.mockImplementation(async (method: string) => method === 'details.extras' ? { ...meta('show'), type: 'series', videos: [episode] }
    : method === 'downloads.qualityOptions' ? { loadedStreams: 0, runtimeKnown: true, options: [] } : {});
  bridge.downloads = { items: [{ parentMetaType: 'series', parentMetaId: 'show', videoId: 'show:1:1', status: 'failed', progress: 0.5 }] };
  render(<MemoryRouter><DetailsExtras type="series" id="show" /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('img', { name: 'Pilot: Download failed' }));
  await screen.findByText(/No streams were found/);
  expect(bridge.call).toHaveBeenCalledWith('downloads.qualityOptions', { type: 'series', id: 'show', videoId: 'show:1:1' });
});

it('opens the Downloads page from an episode that is still downloading', async () => {
  const episode = { id: 'show:1:1', title: 'Pilot', season: 1, episode: 1, released: '2020-01-01', thumbnail: null, overview: null, available: true, runtime: null, rating: null, seasonPoster: null };
  bridge.details = { media: { id: 'show', type: 'series' } };
  bridge.settings = { items: [{ key: 'EPISODES', enabled: true, order: 0, tabGroup: null }] };
  bridge.downloads = { items: [{ parentMetaType: 'series', parentMetaId: 'show', videoId: 'show:1:1', status: 'downloading', progress: 0.5 }] };
  bridge.call.mockImplementation(async (method: string) => method === 'details.extras' ? { ...meta('show'), type: 'series', videos: [episode] } : {});
  render(<MemoryRouter initialEntries={['/details/series/show']}><Routes>
    <Route path="/details/series/show" element={<DetailsExtras type="series" id="show" />} />
    <Route path="/library/downloads" element={<p>Downloads page</p>} />
  </Routes></MemoryRouter>);
  fireEvent.click(await screen.findByRole('img', { name: 'Pilot: Downloading 50%' }));
  expect(await screen.findByText('Downloads page')).toBeInTheDocument();
  expect(bridge.call).not.toHaveBeenCalledWith('downloads.qualityOptions', expect.anything());
});
