import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FullscreenButton } from './FullscreenButton';

const host = vi.hoisted(() => ({ fullscreen: false, resized: undefined as (() => Promise<void>) | undefined, unlisten: vi.fn(), setFullscreen: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true }));
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({
  isFullscreen: async () => host.fullscreen,
  setFullscreen: host.setFullscreen,
  onResized: async (listener: () => Promise<void>) => { host.resized = listener; return host.unlisten; },
}) }));
beforeEach(() => {
  host.fullscreen = false;
  host.resized = undefined;
  host.setFullscreen.mockReset().mockImplementation(async (value: boolean) => { host.fullscreen = value; });
  host.unlisten.mockReset();
});
afterEach(cleanup);

it('shows the action for the actual initial window state and updates after both toggles', async () => {
  host.fullscreen = true;
  render(<FullscreenButton onError={vi.fn()} />);
  const exit = await screen.findByRole('button', { name: 'Exit fullscreen' });
  expect(exit).toHaveAttribute('title', 'Exit fullscreen');
  expect(exit.querySelector('svg')).toHaveClass('lucide-minimize');
  fireEvent.click(exit);
  await waitFor(() => expect(host.setFullscreen).toHaveBeenCalledWith(false));
  const enter = await screen.findByRole('button', { name: 'Enter fullscreen' });
  await waitFor(() => expect(enter).toBeEnabled());
  expect(enter.querySelector('svg')).toHaveClass('lucide-maximize');
  fireEvent.click(enter);
  await screen.findByRole('button', { name: 'Exit fullscreen' });
  expect(host.setFullscreen).toHaveBeenLastCalledWith(true);
});

it('follows external fullscreen changes and removes its listener on unmount', async () => {
  const view = render(<FullscreenButton onError={vi.fn()} />);
  await act(async () => {});
  host.fullscreen = true;
  await act(async () => host.resized!());
  expect(screen.getByRole('button', { name: 'Exit fullscreen' })).toBeVisible();
  host.fullscreen = false;
  await act(async () => host.resized!());
  expect(screen.getByRole('button', { name: 'Enter fullscreen' })).toBeVisible();
  view.unmount();
  expect(host.unlisten).toHaveBeenCalledOnce();
});

it('keeps the current action and reports a failed toggle', async () => {
  const onError = vi.fn();
  host.setFullscreen.mockRejectedValueOnce(new Error('Window unavailable'));
  render(<FullscreenButton onError={onError} />);
  fireEvent.click(screen.getByRole('button', { name: 'Enter fullscreen' }));
  await waitFor(() => expect(onError).toHaveBeenCalledWith('Error: Window unavailable'));
  expect(screen.getByRole('button', { name: 'Enter fullscreen' })).toBeEnabled();
});
