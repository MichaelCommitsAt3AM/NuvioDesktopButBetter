import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useFullscreenEscape } from './useFullscreenEscape';

const host = vi.hoisted(() => ({ isFullscreen: vi.fn(), setFullscreen: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true }));
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => host }));
function App() {
  useFullscreenEscape();
  return <input aria-label="Search" onKeyDown={event => event.stopPropagation()} />;
}
beforeEach(() => {
  host.isFullscreen.mockReset().mockResolvedValue(true);
  host.setFullscreen.mockReset().mockResolvedValue(undefined);
});
afterEach(cleanup);

it('exits native fullscreen even when a focused control stops Escape bubbling', async () => {
  render(<App />);
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
  await waitFor(() => expect(host.setFullscreen).toHaveBeenCalledWith(false));
});

it('leaves a windowed app windowed', async () => {
  host.isFullscreen.mockResolvedValue(false);
  render(<App />);
  fireEvent.keyDown(window, { key: 'Escape' });
  await waitFor(() => expect(host.isFullscreen).toHaveResolvedWith(false));
  expect(host.setFullscreen).not.toHaveBeenCalled();
});

it('ignores other keys and removes its listener on unmount', () => {
  const view = render(<App />);
  fireEvent.keyDown(window, { key: 'Enter' });
  view.unmount();
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(host.isFullscreen).not.toHaveBeenCalled();
});
