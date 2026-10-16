import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { DownloadsPage } from './DownloadsPage';

const bridge = vi.hoisted(() => ({ snapshot: {} as any, call: vi.fn(), refresh: vi.fn() }));
vi.mock('../../bridge', () => ({ useFeatureSnapshot: () => bridge.snapshot, useSelector: (select: (state: any) => unknown) => select({ session: { activeProfile: 7 } }), call: bridge.call, refreshFeature: bridge.refresh }));
beforeEach(() => {
  const item = { poster: null, parentMetaType: 'movie', parentMetaId: 'movie', seasonNumber: null, episodeNumber: null, episodeTitle: null, status: 'completed', downloadedBytes: 20, totalBytes: 20, progress: 1, error: null, playable: true };
  bridge.snapshot = { items: [
    { ...item, id: 'film', title: 'Moon Movie' },
    { ...item, id: 'ep', title: 'Avatar', parentMetaType: 'series', parentMetaId: 'show', seasonNumber: 2, episodeNumber: 3, episodeTitle: 'Return to Omashu' },
    { ...item, id: 'active', title: 'Moon Documentary', parentMetaId: 'documentary', status: 'downloading', playable: false },
  ] };
  bridge.call.mockReset().mockResolvedValue({}); bridge.refresh.mockReset().mockResolvedValue({});
});
afterEach(cleanup);
const page = () => <MemoryRouter initialEntries={['/library/downloads']}><Routes><Route path="/library/downloads" element={<DownloadsPage />} /><Route path="/library" element={<h1>Library destination</h1>} /></Routes></MemoryRouter>;

it('uses the details-style back button and returns to Library even on a direct launch', () => {
  render(page());
  expect(screen.getByRole('button', { name: 'Back' })).toHaveClass('screen-back-button');
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  expect(screen.getByRole('heading', { name: 'Library destination' })).toBeInTheDocument();
});

it('searches movie titles without case or surrounding whitespace affecting matches', () => {
  render(page());
  fireEvent.change(screen.getByRole('textbox', { name: 'Search downloads' }), { target: { value: '  mOoN mOvIe  ' } });
  expect(screen.getByRole('heading', { name: 'Moon Movie' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Avatar' })).toBeNull();
  expect(screen.queryByRole('heading', { name: 'Moon Documentary' })).toBeNull();
});

it('searches episode titles and clearing the search restores every item', () => {
  render(page());
  const search = screen.getByRole('textbox', { name: 'Search downloads' });
  fireEvent.change(search, { target: { value: 'OMASHU' } });
  expect(screen.getByRole('heading', { name: 'Avatar' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Moon Movie' })).toBeNull();
  fireEvent.change(search, { target: { value: '' } });
  expect(screen.getAllByRole('progressbar')).toHaveLength(3);
});

it('combines text search with status and content type filters', () => {
  render(page());
  fireEvent.change(screen.getByRole('textbox', { name: 'Search downloads' }), { target: { value: 'moon' } });
  fireEvent.click(screen.getByRole('button', { name: 'completed' }));
  expect(screen.getByRole('heading', { name: 'Moon Movie' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Moon Documentary' })).toBeNull();
  fireEvent.change(screen.getByRole('combobox', { name: 'Download type' }), { target: { value: 'series' } });
  expect(screen.queryByRole('progressbar')).toBeNull();
  fireEvent.change(screen.getByRole('textbox', { name: 'Search downloads' }), { target: { value: 'avatar' } });
  expect(screen.getByRole('heading', { name: 'Avatar' })).toBeInTheDocument();
  expect(bridge.call).not.toHaveBeenCalledWith(expect.stringContaining('search'), expect.anything());
});

it('opens the managed downloads folder and reports platform failure honestly', async () => {
  render(page());
  const folder = screen.getByRole('button', { name: 'Open downloads folder' });
  const preferences = screen.getByRole('link', { name: 'Data saver preferences' });
  expect(folder).toHaveTextContent('Open folder');
  expect(preferences).toHaveAttribute('href', '/settings/downloads');
  expect(preferences).toHaveTextContent('');
  expect(folder.parentElement).toHaveClass('downloads-header-actions');
  expect(preferences.parentElement).toBe(folder.parentElement);
  bridge.call.mockClear();
  fireEvent.click(screen.getByRole('button', { name: 'Open downloads folder' }));
  expect(bridge.call).toHaveBeenCalledWith('downloads.openFolder', {});
  bridge.call.mockRejectedValueOnce(new Error('The downloads folder could not be opened on this device'));
  fireEvent.click(screen.getByRole('button', { name: 'Open downloads folder' }));
  expect(await screen.findByText('The downloads folder could not be opened on this device')).toBeInTheDocument();
});
