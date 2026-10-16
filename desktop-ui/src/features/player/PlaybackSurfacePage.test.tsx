import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PlaybackSurfacePage } from './PlaybackSurfacePage';

const bridge = vi.hoisted(() => ({ playback: { state: 'playing', isInPip: true }, call: vi.fn() }));
vi.mock('../../bridge', () => ({
  useSelector: (select: (state: unknown) => unknown) => select({ playback: bridge.playback }),
  call: bridge.call,
}));
beforeEach(() => {
  bridge.playback = { state: 'playing', isInPip: true };
  bridge.call.mockReset().mockResolvedValue({});
});
afterEach(cleanup);
const player = () => <MemoryRouter><PlaybackSurfacePage /></MemoryRouter>;

it('shows the Kotlin PiP placeholder and restores through the bridge', () => {
  render(player());
  expect(screen.getByText('Video playing in Picture-in-Picture')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Restore to Main Player' }));
  expect(bridge.call).toHaveBeenCalledWith('playback.restoreFromPip');
});

it('restores on Escape and removes the placeholder and shortcut after native restore', () => {
  const view = render(player());
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(bridge.call).toHaveBeenCalledTimes(1);
  bridge.playback.isInPip = false;
  view.rerender(player());
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(bridge.call).toHaveBeenCalledTimes(1);
});

it('keeps a restore option available after a bridge failure', async () => {
  bridge.call.mockRejectedValueOnce(new Error('disconnected'));
  render(player());
  fireEvent.click(screen.getByRole('button'));
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not restore');
  fireEvent.click(screen.getByRole('button'));
  expect(bridge.call).toHaveBeenCalledTimes(2);
});
