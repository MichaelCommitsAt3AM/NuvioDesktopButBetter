import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DownloadFiltersPage } from './DownloadFilters';

const bridge = vi.hoisted(() => ({ snapshot: undefined as unknown, call: vi.fn(async () => ({})) }));
vi.mock('../../bridge', () => ({
  useFeatureSnapshot: () => bridge.snapshot,
  call: (...args: unknown[]) => (bridge.call as (...a: unknown[]) => Promise<unknown>)(...args),
  refreshFeature: vi.fn(async () => ({})),
}));
const GB = 1024 ** 3;
const filter = (overrides = {}) => ({ filter: {
  maxResolution: 'fhd_1080', maxSizeBytes: 15 * GB, showUnknownSizeStreams: false, allowedSources: ['webdl', 'webrip'], minMaxSizeBytes: 3 * GB, maxMaxSizeBytes: 20 * GB,
  bitrateLimitEnabled: true, maxBitrateKbps: 6000, scaleBitrateByCodec: true, minMaxBitrateKbps: 1000, maxMaxBitrateKbps: 40000,
  dataUse: 'balanced', resolutions: ['uhd_4k', 'fhd_1080', 'hd_720'], tierLimitsKbps: { uhd_4k: 27000, fhd_1080: 6000, hd_720: 2400 },
  levelKbps: { low: 4000, balanced: 6000, high: 8400 }, choicesKbps: { uhd_4k: [20000, 27000], fhd_1080: [4000, 6000], hd_720: [2000, 2400] }, ...overrides,
} });
beforeEach(() => { bridge.snapshot = undefined; bridge.call.mockClear(); });
afterEach(cleanup);
const page = (entry: Parameters<typeof MemoryRouter>[0]['initialEntries'] = ['/settings/downloads']) => render(<MemoryRouter initialEntries={entry}><DownloadFiltersPage /></MemoryRouter>);

it('goes back to Settings by default', () => {
  page();
  expect(screen.getByRole('link', { name: 'Back to Settings' })).toHaveAttribute('href', '/settings');
});

it('goes back to the page that opened it', () => {
  page([{ pathname: '/settings/downloads', state: { returnTo: '/library/downloads' } }]);
  expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/library/downloads');
});

it('offers data use levels with their data per hour and saves the chosen level', () => {
  bridge.snapshot = filter();
  page();
  const levels = screen.getByRole('radiogroup', { name: 'Data use' });
  expect(within(levels).getByRole('radio', { name: /Balanced.*~2\.7 GB\/h/ })).toHaveAttribute('aria-checked', 'true');
  fireEvent.click(within(levels).getByRole('radio', { name: /Low/ }));
  expect(bridge.call).toHaveBeenCalledWith('downloads.filter.setDataUse', { preset: 'LOW' });
  expect(screen.queryByRole('button', { name: /^4K:/ })).toBeNull();
});

it('shows per-resolution limits under Custom and picks one from the options sheet', () => {
  bridge.snapshot = filter({ dataUse: 'custom' });
  page();
  fireEvent.click(screen.getByRole('button', { name: '4K: 27 Mbps' }));
  const sheet = screen.getByRole('listbox', { name: '4K' });
  expect(within(sheet).getByRole('option', { name: /27 Mbps/ })).toHaveAttribute('aria-selected', 'true');
  fireEvent.click(within(sheet).getByRole('option', { name: /20 Mbps · 9\.0 GB\/h/ }));
  expect(bridge.call).toHaveBeenCalledWith('downloads.filter.setTierBitrateKbps', { tier: 'UHD_4K', kbps: 20000 });
});

it('offers sizes from the minimum in a sheet', () => {
  bridge.snapshot = filter();
  page();
  fireEvent.click(screen.getByRole('button', { name: 'Maximum file size: 15 GB' }));
  const sizes = within(screen.getByRole('listbox', { name: 'Maximum file size' })).getAllByRole('option');
  expect(sizes[0]).toHaveTextContent('3 GB');
  fireEvent.click(sizes[1]);
  expect(bridge.call).toHaveBeenCalledWith('downloads.filter.setMaxSizeBytes', { bytes: 4 * GB });
});

it('asks in a sheet before resetting', async () => {
  bridge.snapshot = filter();
  page();
  fireEvent.click(screen.getByRole('button', { name: /Reset to defaults/ }));
  expect(bridge.call).not.toHaveBeenCalledWith('downloads.filter.reset', {});
  fireEvent.click(within(await screen.findByRole('dialog', { name: 'Reset download filter?' })).getByRole('button', { name: 'Reset to defaults' }));
  expect(bridge.call).toHaveBeenCalledWith('downloads.filter.reset', {});
});

it('turns the bitrate limit off with its switch', () => {
  bridge.snapshot = filter();
  page();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Limit by bitrate' }));
  expect(bridge.call).toHaveBeenCalledWith('downloads.filter.setBitrateLimitEnabled', { enabled: false });
});
