import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { DownloadsPage, formatDownloadBytes } from './DownloadsPage';

const bridge = vi.hoisted(() => ({ snapshot: {} as any, call: vi.fn(), refresh: vi.fn() }));
vi.mock('../../bridge', () => ({ useFeatureSnapshot: () => bridge.snapshot, useSelector: (select: (state: any) => unknown) => select({ session: { activeProfile: 7 } }), call: bridge.call, refreshFeature: bridge.refresh }));
const GB = 1024 ** 3;
const base = { poster: null, parentMetaType: 'movie', parentMetaId: 'movie', seasonNumber: null, episodeNumber: null, episodeTitle: null, status: 'completed', downloadedBytes: 2 * GB, totalBytes: 2 * GB, progress: 1, error: null, playable: true };
beforeEach(() => {
  bridge.snapshot = { items: [
    { ...base, id: 'film', title: 'Moon Movie' },
    { ...base, id: 'ep3', title: 'Avatar', parentMetaType: 'series', parentMetaId: 'show', seasonNumber: 2, episodeNumber: 3, episodeTitle: 'Return to Omashu' },
    { ...base, id: 'ep1', title: 'Avatar', parentMetaType: 'series', parentMetaId: 'show', seasonNumber: 1, episodeNumber: 1, episodeTitle: 'The Boy in the Iceberg' },
    { ...base, id: 'active', title: 'Moon Documentary', parentMetaId: 'documentary', status: 'downloading', downloadedBytes: GB / 2, playable: false, progress: 0.25 },
    { ...base, id: 'broken', title: 'Broken Film', parentMetaId: 'broken', status: 'failed', playable: false, error: 'Network lost' },
  ] };
  bridge.call.mockReset().mockResolvedValue({}); bridge.refresh.mockReset().mockResolvedValue({});
});
afterEach(cleanup);
const page = (path = '/library/downloads') => <MemoryRouter initialEntries={[path]}><Routes>
  <Route path="/library/downloads" element={<DownloadsPage />} />
  <Route path="/library/downloads/show/:showId" element={<DownloadsPage />} />
  <Route path="/library" element={<h1>Library destination</h1>} />
</Routes></MemoryRouter>;
const section = (name: string) => screen.getByRole('heading', { name }).closest('section')!;

it('formats sizes like the Kotlin screen', () => {
  expect(formatDownloadBytes(0)).toBe('0 B');
  expect(formatDownloadBytes(1.26 * GB)).toBe('1.2 GB');
  expect(formatDownloadBytes(340.56 * 1024 ** 2)).toBe('340.5 MB');
});

it('uses the details-style back button and returns to Library even on a direct launch', () => {
  render(page());
  expect(screen.getByRole('button', { name: 'Back' })).toHaveClass('screen-back-button');
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  expect(screen.getByRole('heading', { name: 'Library destination' })).toBeInTheDocument();
});

it('groups downloads into Active, Movies and Shows sections', () => {
  render(page());
  expect(screen.getByRole('heading', { level: 1, name: 'Downloads' })).toBeInTheDocument();
  const active = section('Active');
  expect(within(active).getByRole('article', { name: 'Moon Documentary' })).toHaveTextContent('512 MB / 2 GB');
  expect(within(active).getByRole('progressbar', { name: 'Moon Documentary download progress' })).toHaveAttribute('value', '0.25');
  expect(within(active).getByRole('article', { name: 'Broken Film' })).toHaveTextContent('Network lost');
  expect(within(section('Movies')).getByRole('article', { name: 'Moon Movie' })).toBeInTheDocument();
  const show = within(section('Shows')).getByRole('button', { name: /Avatar/ });
  expect(show).toHaveTextContent('2 downloaded episode(s)');
});

it('confirms before deleting a download', () => {
  render(page());
  fireEvent.click(screen.getByRole('button', { name: 'Delete Moon Movie' }));
  const dialog = screen.getByRole('dialog', { name: 'Delete?' });
  expect(bridge.call).not.toHaveBeenCalledWith('downloads.remove', expect.anything());
  fireEvent.click(within(dialog).getByRole('button', { name: 'Yes' }));
  expect(bridge.call).toHaveBeenCalledWith('downloads.remove', { id: 'film' });
});

it('runs the row action for each state', async () => {
  render(page());
  fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
  expect(bridge.call).toHaveBeenCalledWith('downloads.pause', { id: 'active' });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(bridge.call).toHaveBeenCalledWith('downloads.retry', { id: 'broken' });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Delete Moon Movie' })).toBeEnabled());
  fireEvent.click(screen.getByRole('article', { name: 'Moon Movie' }));
  expect(bridge.call).toHaveBeenCalledWith('downloads.play', { id: 'film' });
});

it('opens a show and lists its downloaded episodes by season', () => {
  render(page());
  fireEvent.click(within(section('Shows')).getByRole('button', { name: /Avatar/ }));
  expect(screen.getByRole('heading', { level: 1, name: 'Avatar' })).toBeInTheDocument();
  expect(within(section('Season 1')).getByRole('article', { name: 'The Boy in the Iceberg' })).toHaveTextContent('S1 E1 • Avatar');
  expect(within(section('Season 2')).getByRole('article', { name: 'Return to Omashu' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  expect(screen.getByRole('heading', { level: 1, name: 'Downloads' })).toBeInTheDocument();
});

it('shows the empty state when nothing is downloaded', () => {
  bridge.snapshot = { items: [] };
  render(page());
  expect(screen.getByText('No downloads yet')).toBeInTheDocument();
});

it('opens the managed downloads folder and reports platform failure honestly', async () => {
  render(page());
  expect(screen.getByRole('link', { name: 'Download filter' })).toHaveAttribute('href', '/settings/downloads');
  bridge.call.mockClear();
  fireEvent.click(screen.getByRole('button', { name: 'Open downloads folder' }));
  expect(bridge.call).toHaveBeenCalledWith('downloads.openFolder', {});
  bridge.call.mockRejectedValueOnce(new Error('The downloads folder could not be opened on this device'));
  fireEvent.click(screen.getByRole('button', { name: 'Open downloads folder' }));
  expect(await screen.findByText('The downloads folder could not be opened on this device')).toBeInTheDocument();
});

function FilterProbe() {
  const state = useLocation().state as { returnTo?: string } | null;
  return <p>Filter page, back to {state?.returnTo ?? 'Settings'}</p>;
}

it('tells the download filter page to come back to Downloads', () => {
  render(<MemoryRouter initialEntries={['/library/downloads']}><Routes>
    <Route path="/library/downloads" element={<DownloadsPage />} />
    <Route path="/settings/downloads" element={<FilterProbe />} />
  </Routes></MemoryRouter>);
  fireEvent.click(screen.getByRole('link', { name: 'Download filter' }));
  expect(screen.getByText('Filter page, back to /library/downloads')).toBeInTheDocument();
});
