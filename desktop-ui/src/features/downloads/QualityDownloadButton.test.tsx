import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { QualityDownloadButton, formatDownloadSize } from './QualityDownloadButton';

const bridge = vi.hoisted(() => ({ call: vi.fn(), downloads: undefined as unknown }));
vi.mock('../../bridge', () => ({ call: bridge.call, useFeatureSnapshot: () => bridge.downloads }));
const GB = 1024 ** 3;
const options = (tiers: Array<[string, number | null]>): { loadedStreams: number; runtimeKnown: boolean; options: Array<Record<string, unknown>> } => ({
  loadedStreams: 12, runtimeKnown: true,
  options: tiers.map(([tier, sizeBytes]) => ({ id: `q-${tier}`, tier, sizeBytes, bitrateKbps: 4000, codec: 'hevc', source: 'webdl' })),
});
const button = (onBrowse = vi.fn()) => <QualityDownloadButton type="movie" id="tt1" onBrowseStreams={onBrowse} />;
const open = () => fireEvent.click(screen.getByRole('button', { name: 'Download' }));
beforeEach(() => { bridge.call.mockReset(); bridge.downloads = undefined; });
afterEach(cleanup);

it('formats sizes in GB or MB and handles unknown sizes', () => {
  expect(formatDownloadSize(2.46 * GB)).toBe('2.5 GB');
  expect(formatDownloadSize(14 * GB)).toBe('14 GB');
  expect(formatDownloadSize(700 * 1024 ** 2)).toBe('700 MB');
  expect(formatDownloadSize(null)).toBe('Size unknown');
});

it('loads the streams for the title and only offers the qualities that exist', async () => {
  bridge.call.mockResolvedValue(options([['fhd_1080', 3 * GB], ['hd_720', 1.4 * GB]]));
  render(button());
  open();
  expect(screen.getByRole('status')).toHaveTextContent('Finding the best versions');
  await screen.findByRole('group', { name: 'Download quality' });
  expect(bridge.call).toHaveBeenCalledWith('downloads.qualityOptions', { type: 'movie', id: 'tt1' });
  expect(screen.getByRole('button', { name: /1080p/ })).toHaveTextContent('3.0 GB');
  expect(screen.getByRole('button', { name: /720p/ })).toHaveTextContent('1.4 GB');
  expect(screen.queryByRole('button', { name: /4K/ })).toBeNull();
});

it('labels only an HDR 4K option as HDR', async () => {
  const result = options([['uhd_4k', 9 * GB], ['fhd_1080', 3 * GB]]);
  result.options[0].hdr = true;
  result.options[1].hdr = true; // HDR is only called out on 4K
  bridge.call.mockResolvedValue(result);
  render(button());
  open();
  expect(await screen.findByRole('button', { name: /4K HDR/ })).toBeTruthy();
  expect(screen.getByRole('button', { name: /1080p/ })).not.toHaveTextContent('HDR');
});

it('does not add HDR to a standard-range 4K option', async () => {
  bridge.call.mockResolvedValue(options([['uhd_4k', 9 * GB]]));
  render(button());
  open();
  const row = await screen.findByRole('button', { name: /4K/ });
  expect(row).not.toHaveTextContent('HDR');
});

it('starts the chosen download straight away and closes the picker', async () => {
  const started = vi.fn();
  window.addEventListener('nuvio-download-started', started);
  bridge.call.mockResolvedValueOnce(options([['uhd_4k', 9 * GB], ['fhd_1080', 3 * GB]]));
  bridge.call.mockResolvedValueOnce({ requiresConfirmation: false, snapshot: {} });
  render(button());
  open();
  fireEvent.click(await screen.findByRole('button', { name: /1080p/ }));
  await waitFor(() => expect(screen.queryByRole('group', { name: 'Download quality' })).toBeNull());
  expect(bridge.call).toHaveBeenLastCalledWith('downloads.startQuality', { optionId: 'q-fhd_1080', replaceConfirmed: false });
  expect(started).toHaveBeenCalledTimes(1);
  window.removeEventListener('nuvio-download-started', started);
});

it('asks before replacing an existing download', async () => {
  bridge.call.mockResolvedValueOnce(options([['fhd_1080', 3 * GB]]));
  bridge.call.mockResolvedValueOnce({ requiresConfirmation: true, existing: { title: 'Moon Movie' } });
  bridge.call.mockResolvedValueOnce({ requiresConfirmation: false, snapshot: {} });
  render(button());
  open();
  fireEvent.click(await screen.findByRole('button', { name: /1080p/ }));
  expect(await screen.findByText('Replace Moon Movie?')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Replace download' }));
  await waitFor(() => expect(bridge.call).toHaveBeenLastCalledWith('downloads.startQuality', { optionId: 'q-fhd_1080', replaceConfirmed: true }));
});

it('explains when nothing fits and offers the full streams list', async () => {
  const browse = vi.fn();
  bridge.call.mockResolvedValue({ loadedStreams: 8, runtimeKnown: true, options: [] });
  render(button(browse));
  open();
  expect(await screen.findByText(/None of the available streams fit/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Browse all streams' }));
  expect(browse).toHaveBeenCalledTimes(1);
});

it('says so when no streams exist at all', async () => {
  bridge.call.mockResolvedValue({ loadedStreams: 0, runtimeKnown: false, options: [] });
  render(button());
  open();
  expect(await screen.findByText(/No streams were found/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Browse all streams' })).toBeNull();
});

it('shows a failure message instead of hanging', async () => {
  bridge.call.mockRejectedValue(new Error('Title details are unavailable'));
  render(button());
  open();
  expect(await screen.findByRole('alert')).toHaveTextContent('Title details are unavailable');
});

it('loads an episode by video id when used as a standalone sheet', async () => {
  const { QualityDownloadSheet } = await import('./QualityDownloadButton');
  bridge.call.mockResolvedValue(options([['fhd_1080', 1 * GB]]));
  const onClose = vi.fn();
  const view = render(<QualityDownloadSheet type="series" id="tt9" videoId="tt9:2:5" subtitle="S2 E5 · The Episode" open={false} onClose={onClose} onBrowseStreams={vi.fn()} />);
  expect(bridge.call).not.toHaveBeenCalled();
  view.rerender(<QualityDownloadSheet type="series" id="tt9" videoId="tt9:2:5" subtitle="S2 E5 · The Episode" open onClose={onClose} onBrowseStreams={vi.fn()} />);
  await screen.findByRole('group', { name: 'Download quality' });
  expect(bridge.call).toHaveBeenCalledWith('downloads.qualityOptions', { type: 'series', id: 'tt9', videoId: 'tt9:2:5' });
  expect(screen.getByText('S2 E5 · The Episode')).toBeInTheDocument();
});

it('shows the movie download progress as a ring on the button', () => {
  bridge.downloads = { items: [{ parentMetaType: 'movie', parentMetaId: 'tt1', videoId: 'tt1', status: 'downloading', progress: 0.4, updatedAtEpochMs: 2 }] };
  const view = render(button());
  const download = screen.getByRole('button', { name: 'Download, Downloading 40%' });
  expect(download).toHaveClass('in-progress');
  expect(download.querySelector('.download-ring-value')).not.toBeNull();

  bridge.downloads = { items: [{ parentMetaType: 'movie', parentMetaId: 'tt1', videoId: 'tt1', status: 'completed', progress: 1, updatedAtEpochMs: 3 }] };
  view.rerender(button());
  expect(screen.getByRole('button', { name: 'Download, Downloaded' })).toHaveClass('downloaded');
  expect(document.querySelector('.download-ring')).toBeNull();
});

it('opens the Downloads page instead of the sheet while the movie is downloading', () => {
  bridge.downloads = { items: [{ parentMetaType: 'movie', parentMetaId: 'tt1', videoId: 'tt1', status: 'paused', progress: 0.4, updatedAtEpochMs: 2 }] };
  const onOpenDownloads = vi.fn();
  render(<QualityDownloadButton type="movie" id="tt1" onBrowseStreams={vi.fn()} onOpenDownloads={onOpenDownloads} />);
  fireEvent.click(screen.getByRole('button', { name: 'Download, Download paused 40%' }));
  expect(onOpenDownloads).toHaveBeenCalledOnce();
  expect(bridge.call).not.toHaveBeenCalled();
});

it('marks a quality that is only available over the data saver limit as a large file', async () => {
  const result = options([['uhd_4k', 8.2 * GB], ['fhd_1080', 1.7 * GB]]);
  result.options[0].hdr = true;
  result.options[0].overBudget = true;
  bridge.call.mockResolvedValue(result);
  render(button());
  open();
  const fourK = await screen.findByRole('button', { name: /4K HDR/ });
  expect(fourK).toHaveTextContent('Ultra HD · Large file');
  expect(fourK).toHaveTextContent('8.2 GB');
  expect(fourK).toHaveClass('quality-download-large');
  expect(screen.getByRole('button', { name: /1080p/ })).not.toHaveTextContent('Large file');
});
