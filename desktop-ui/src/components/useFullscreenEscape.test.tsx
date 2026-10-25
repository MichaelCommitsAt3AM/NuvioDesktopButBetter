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
function Navigation({ onBack }: { onBack: () => void }) {
  useFullscreenEscape(onBack);
  return null;
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

it('navigates back in a windowed app and gives dialogs priority', async () => {
  host.isFullscreen.mockResolvedValue(false);
  const back = vi.fn();
  render(<Navigation onBack={back} />);
  fireEvent.keyDown(window, { key: 'Escape' });
  await waitFor(() => expect(back).toHaveBeenCalledTimes(1));
  const dialog = document.body.appendChild(document.createElement('div'));
  dialog.setAttribute('role', 'dialog');
  fireEvent.keyDown(window, { key: 'Escape' });
  await Promise.resolve();
  expect(back).toHaveBeenCalledTimes(1);
  dialog.remove();
});

it('routes mouse Back to an open dialog before navigating', () => {
  const back = vi.fn();
  render(<Navigation onBack={back} />);
  const dialog = document.body.appendChild(document.createElement('div'));
  dialog.setAttribute('role', 'dialog');
  const dismissed = vi.fn();
  document.addEventListener('keydown', dismissed);
  fireEvent.mouseUp(window, { button: 3 });
  expect(dismissed).toHaveBeenCalledTimes(1);
  expect(back).not.toHaveBeenCalled();
  dialog.remove();
  document.removeEventListener('keydown', dismissed);
  fireEvent.mouseUp(window, { button: 3 });
  expect(back).toHaveBeenCalledTimes(1);
});
