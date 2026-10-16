import { StrictMode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { LaunchResumePrompt } from './LaunchResumePrompt';

const bridge = vi.hoisted(() => ({ profile: 1 as number | null, call: vi.fn() }));
vi.mock('../../bridge', () => ({
  call: (...args: unknown[]) => bridge.call(...args),
  useSelector: (select: (state: unknown) => unknown) => select({ session: { activeProfile: bridge.profile } }),
}));
const item = { parentMetaId: 'series/1', parentMetaType: 'series', videoId: 'ep:2', title: 'Saved show', subtitle: 'S1 · E2', seasonNumber: 1, episodeNumber: 2, resumePositionMs: 42000, resumeProgressFraction: .3, progressFraction: .3 };
function Location() { const location = useLocation(); return <output>{location.pathname}{location.search}</output>; }
function mount() { return render(<StrictMode><MemoryRouter><LaunchResumePrompt /><Location /></MemoryRouter></StrictMode>); }
beforeEach(() => { bridge.profile = 1; bridge.call.mockReset(); });
afterEach(cleanup);

it('consumes once across StrictMode startup and resumes the saved episode and position', async () => {
  bridge.call.mockResolvedValue(item);
  mount();
  await screen.findByRole('dialog', { name: 'Continue watching?' });
  expect(bridge.call).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByRole('status').textContent).toContain('/details/series/series%2F1/streams/ep%3A2?');
  expect(screen.getByRole('status').textContent).toContain('resumeMs=42000');
  expect(screen.getByRole('status').textContent).toContain('resumeProgress=0.3');
  expect(screen.getByRole('status').textContent).toContain('episodeNumber=2');
});

it('dismisses without starting playback or requesting the prompt again', async () => {
  bridge.call.mockResolvedValue(item);
  const view = mount();
  await screen.findByRole('dialog');
  // Finding the rendered dialog can precede its passive focus/keyboard effect
  // on busy runners. Wait until it is interactive before pressing Escape.
  await waitFor(() => expect(screen.getByRole('button', { name: 'Resume' })).toHaveFocus());
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).toBeNull();
  view.rerender(<StrictMode><MemoryRouter><LaunchResumePrompt /><Location /></MemoryRouter></StrictMode>);
  expect(bridge.call).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('status').textContent).toBe('/');
});

it('shows nothing when the backend reports no prompt or the preference is disabled', async () => {
  bridge.call.mockResolvedValue(null);
  mount();
  await waitFor(() => expect(bridge.call).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('does not consume before profile selection or display a late previous-profile result', async () => {
  let resolve!: (value: typeof item) => void;
  bridge.profile = null;
  const view = mount();
  expect(bridge.call).not.toHaveBeenCalled();
  bridge.profile = 1;
  bridge.call.mockReturnValueOnce(new Promise(done => { resolve = done; })).mockResolvedValue(null);
  view.rerender(<StrictMode><MemoryRouter><LaunchResumePrompt /><Location /></MemoryRouter></StrictMode>);
  bridge.profile = 2;
  view.rerender(<StrictMode><MemoryRouter><LaunchResumePrompt /><Location /></MemoryRouter></StrictMode>);
  resolve(item);
  await waitFor(() => expect(bridge.call).toHaveBeenCalledTimes(2));
  expect(screen.queryByRole('dialog')).toBeNull();
});
