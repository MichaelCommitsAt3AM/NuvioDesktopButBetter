import { cleanup, render, renderHook, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { DownloadProgressBadge, useDownloadsByVideoId } from './DownloadProgressBadge';

const bridge = vi.hoisted(() => ({ snapshot: undefined as unknown }));
vi.mock('../../bridge', () => ({ useFeatureSnapshot: () => bridge.snapshot }));
afterEach(cleanup);

it('shows a progress ring with the percentage while downloading', () => {
  render(<DownloadProgressBadge state={{ status: 'downloading', progress: 0.42 }} label="Pilot" />);
  const ring = screen.getByRole('progressbar', { name: 'Pilot download' });
  expect(ring).toHaveAttribute('aria-valuenow', '42');
  expect(ring).toHaveClass('downloading');
});

it('marks a paused download and clamps bad progress values', () => {
  render(<DownloadProgressBadge state={{ status: 'paused', progress: 7 }} label="Pilot" />);
  const ring = screen.getByRole('progressbar', { name: 'Pilot download paused' });
  expect(ring).toHaveAttribute('aria-valuenow', '100');
  expect(ring).toHaveClass('paused');
});

it('shows a completed or failed state without a ring', () => {
  render(<><DownloadProgressBadge state={{ status: 'completed', progress: 1 }} label="Pilot" /><DownloadProgressBadge state={{ status: 'failed', progress: 0.3 }} label="Finale" /></>);
  expect(screen.getByRole('img', { name: 'Pilot downloaded' })).toBeInTheDocument();
  expect(screen.getByRole('img', { name: 'Finale download failed' })).toBeInTheDocument();
  expect(screen.queryByRole('progressbar')).toBeNull();
});

it('keys downloads of one title by video id', () => {
  bridge.snapshot = { items: [
    { parentMetaType: 'series', parentMetaId: 'tt1', videoId: 'tt1:1:1', status: 'downloading', progress: 0.5 },
    { parentMetaType: 'series', parentMetaId: 'tt1', videoId: 'tt1:1:2', status: 'completed', progress: 1 },
    { parentMetaType: 'series', parentMetaId: 'tt2', videoId: 'tt2:1:1', status: 'completed', progress: 1 },
  ] };
  const { result } = renderHook(() => useDownloadsByVideoId('series', 'tt1'));
  expect(result.current).toEqual({ 'tt1:1:1': { status: 'downloading', progress: 0.5 }, 'tt1:1:2': { status: 'completed', progress: 1 } });
});
