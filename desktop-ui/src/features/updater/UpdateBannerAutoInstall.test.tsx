import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { UpdateBanner } from './UpdateBanner';

const native = vi.hoisted(() => ({
  update: { visible: true, phase: 'available', version: '0.1.27.5', notes: '', progress: null as number | null, error: null as string | null },
  download: vi.fn(), install: vi.fn(), initialize: vi.fn(), dismiss: vi.fn(),
}));
vi.mock('./updater', () => ({
  useUpdater: () => native.update, initializeUpdater: native.initialize,
  downloadUpdate: native.download, installUpdate: native.install, dismissUpdate: native.dismiss,
}));
vi.mock('./updateBannerTest', () => ({
  useTestBanner: () => ({ visible: false, phase: 'idle', progress: 0 }),
  TEST_UPDATE: {}, dismissTestBanner: vi.fn(), startTestDownload: vi.fn(),
}));
beforeEach(() => {
  vi.clearAllMocks();
  native.update = { visible: true, phase: 'available', version: '0.1.27.5', notes: '', progress: null, error: null };
});
afterEach(cleanup);

it('explains automatic installation before the user starts the update', () => {
  render(<UpdateBanner />);
  expect(screen.getByText('Update available • Installs and restarts after download')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Update' }));
  expect(native.download).toHaveBeenCalledOnce();
  expect(native.install).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Install and restart' })).not.toBeInTheDocument();
});

it('shows installation progress without a second install action', () => {
  native.update.phase = 'installing';
  render(<UpdateBanner />);
  expect(screen.getByText('Installing and restarting…')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Update|Install and restart|Dismiss update banner/ })).not.toBeInTheDocument();
});

it('offers an explicit install retry using the verified download after an error', () => {
  native.update.phase = 'downloaded';
  native.update.error = 'Permission cancelled';
  render(<UpdateBanner />);
  expect(screen.getByText('Permission cancelled')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry update' }));
  expect(native.install).toHaveBeenCalledOnce();
  expect(native.download).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Install and restart' })).not.toBeInTheDocument();
});
