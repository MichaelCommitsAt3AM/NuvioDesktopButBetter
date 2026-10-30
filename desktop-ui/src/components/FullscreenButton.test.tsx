import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FullscreenButton } from './FullscreenButton';

const host = vi.hoisted(() => ({ fullscreen: false, resized: undefined as (() => Promise<void>) | undefined, unlisten: vi.fn(), setFullscreen: vi.fn(), isFullscreen: vi.fn<() => Promise<boolean>>() }));
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true }));
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({
  isFullscreen: host.isFullscreen,
  setFullscreen: host.setFullscreen,
  onResized: async (listener: () => Promise<void>) => { host.resized = listener; return host.unlisten; },
}) }));
beforeEach(() => {
  host.fullscreen = false;
  host.resized = undefined;
  host.isFullscreen.mockReset().mockImplementation(async () => host.fullscreen);
  host.setFullscreen.mockReset().mockImplementation(async (value: boolean) => { host.fullscreen = value; });
  host.unlisten.mockReset();
});
afterEach(cleanup);

it('waits for the first native state before displaying a mode icon', async () => {
  let resolve!: (value: boolean) => void;
  host.isFullscreen.mockReturnValueOnce(new Promise<boolean>(done => { resolve = done; }));
  render(<FullscreenButton />);
  const button = screen.getByRole('button', { name: 'Checking fullscreen state' });
  expect(button).toBeDisabled();
  expect(button.querySelector('svg')).toBeNull();
  await act(async () => resolve(true));
  expect(screen.getByRole('button', { name: 'Exit fullscreen' })).toBeEnabled();
});

it('shows the action for the actual initial window state and updates after both toggles', async () => {
  host.fullscreen = true;
  render(<FullscreenButton onError={vi.fn()} />);
  const exit = await screen.findByRole('button', { name: 'Exit fullscreen' });
  expect(exit).toHaveAttribute('title', 'Exit fullscreen');
  expect(exit.querySelector('svg')).toHaveAttribute('viewBox', '0 0 385.331 385.331');
  fireEvent.click(exit);
  await waitFor(() => expect(host.setFullscreen).toHaveBeenCalledWith(false));
  const enter = await screen.findByRole('button', { name: 'Enter fullscreen' });
  await waitFor(() => expect(enter).toBeEnabled());
  expect(enter.querySelector('svg')).toHaveAttribute('viewBox', '0 0 24 24');
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
  fireEvent.click(await screen.findByRole('button', { name: 'Enter fullscreen' }));
  await waitFor(() => expect(onError).toHaveBeenCalledWith('Error: Window unavailable'));
  expect(screen.getByRole('button', { name: 'Enter fullscreen' })).toBeEnabled();
});

it.each([true, false])('retains the confirmed fullscreen=%s icon while a new screen queries the window', async (fullscreen) => {
  host.fullscreen = fullscreen;
  const label = fullscreen ? 'Exit fullscreen' : 'Enter fullscreen';
  const firstScreen = render(<FullscreenButton />);
  await screen.findByRole('button', { name: label });
  await act(async () => {});
  firstScreen.unmount();

  let resolve!: (value: boolean) => void;
  host.isFullscreen.mockReturnValueOnce(new Promise<boolean>(done => { resolve = done; }));
  render(<FullscreenButton />);
  expect(screen.getByRole('button', { name: label }).querySelector('svg'))
    .toHaveAttribute('viewBox', fullscreen ? '0 0 385.331 385.331' : '0 0 24 24');
  await act(async () => resolve(fullscreen));
  expect(screen.getByRole('button', { name: label })).toBeEnabled();
});

it('retains a successfully toggled mode when navigating immediately afterward', async () => {
  const firstScreen = render(<FullscreenButton />);
  await act(async () => {});
  fireEvent.click(screen.getByRole('button', { name: 'Enter fullscreen' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Exit fullscreen' })).toBeEnabled());
  firstScreen.unmount();
  host.isFullscreen.mockReturnValueOnce(new Promise<boolean>(() => {}));
  render(<FullscreenButton />);
  expect(screen.getByRole('button', { name: 'Exit fullscreen' }).querySelector('svg')).toHaveAttribute('viewBox', '0 0 385.331 385.331');
});
