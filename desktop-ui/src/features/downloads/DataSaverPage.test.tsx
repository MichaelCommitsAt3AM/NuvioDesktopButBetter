import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DataSaverPage } from './DataSaverPage';

const bridge = vi.hoisted(() => ({ snapshot: undefined as unknown, call: vi.fn(async () => ({})) }));
vi.mock('../../bridge', () => ({
  useFeatureSnapshot: () => bridge.snapshot,
  call: (...args: unknown[]) => (bridge.call as (...a: unknown[]) => Promise<unknown>)(...args),
  refreshFeature: vi.fn(async () => ({})),
}));
const GB = 1024 ** 3;
const snapshot = (overrides = {}) => ({
  enabled: false, dataUse: 'low', maxResolution: 'fhd_1080', resolutions: ['uhd_4k', 'fhd_1080', 'hd_720'],
  targetsKbps: { uhd_4k: 10700, fhd_1080: 3400, hd_720: 1700 }, levelKbps: { low: 3400, balanced: 5000, high: 7000 },
  choicesKbps: { uhd_4k: [10000, 10700], fhd_1080: [3000, 3400], hd_720: [1500, 1700] },
  allowedSources: ['webdl', 'webrip'], maxSizeBytes: 8 * GB, minMaxSizeBytes: GB, maxMaxSizeBytes: 20 * GB, showUnknownSizeStreams: false, ...overrides,
});
beforeEach(() => { bridge.snapshot = undefined; bridge.call.mockClear(); });
afterEach(cleanup);
const page = () => render(<MemoryRouter initialEntries={['/settings/data-saver']}><DataSaverPage /></MemoryRouter>);

it('goes back to the page that opened it', () => {
  bridge.snapshot = snapshot();
  render(<MemoryRouter initialEntries={[{ pathname: '/settings/data-saver', state: { returnTo: '/settings/playback' } }]}><DataSaverPage /></MemoryRouter>);
  expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/settings/playback');
});

it('turns Data Saver on and goes back to Settings by default', () => {
  bridge.snapshot = snapshot();
  page();
  expect(screen.getByRole('link', { name: 'Back to Settings' })).toHaveAttribute('href', '/settings');
  fireEvent.click(screen.getByRole('checkbox', { name: 'Data Saver' }));
  expect(bridge.call).toHaveBeenCalledWith('dataSaver.setEnabled', { enabled: true });
});

it('lists resolutions lowest first and saves the maximum', () => {
  bridge.snapshot = snapshot();
  page();
  const segments = within(screen.getByRole('radiogroup', { name: 'Max resolution' })).getAllByRole('radio');
  expect(segments.map(item => item.textContent)).toEqual(['720p', '1080p', '4K']);
  fireEvent.click(segments[2]);
  expect(bridge.call).toHaveBeenCalledWith('dataSaver.setMaxResolution', { tier: 'UHD_4K' });
});

it('offers custom targets only up to the maximum resolution', () => {
  bridge.snapshot = snapshot({ dataUse: 'custom' });
  page();
  expect(screen.queryByRole('button', { name: /^4K:/ })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '1080p: 3.4 Mbps' }));
  fireEvent.click(within(screen.getByRole('listbox', { name: '1080p' })).getByRole('option', { name: /^3 Mbps/ }));
  expect(bridge.call).toHaveBeenCalledWith('dataSaver.setTargetKbps', { tier: 'FHD_1080', kbps: 3000 });
});

it('saves allowed file types', () => {
  bridge.snapshot = snapshot();
  page();
  fireEvent.click(within(screen.getByLabelText('Allowed file types')).getByRole('checkbox', { name: 'HDTV' }));
  expect(bridge.call).toHaveBeenCalledWith('dataSaver.setSourceAllowed', { source: 'HDTV', allowed: true });
});
