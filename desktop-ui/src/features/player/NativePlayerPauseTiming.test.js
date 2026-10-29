import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const controls = readFileSync('../composeApp/src/desktopMain/resources/player-ui/controls.js', 'utf8');
const source = controls.slice(controls.indexOf('const resetPauseMetadataTimer ='), controls.indexOf('const renderPauseMetadataOverlay ='));

afterEach(() => vi.useRealTimers());

it('waits two seconds after controls hide and restarts the pause overlay delay after interaction', () => {
  vi.useFakeTimers();
  const render = vi.fn();
  const view = new Function('window', 'renderChrome', `
    let state = { durationMs: 10000, isPlaying: false, isLoading: false, controlsVisible: true };
    let pauseMetadataTimer = 0, pauseMetadataReady = false, pauseMetadataEligibilityKey = '';
    const prefersReducedMotion = false;
    ${source}
    return { sync: update => { state = { ...state, ...update }; syncPauseMetadataTimer(false); }, ready: () => pauseMetadataReady };
  `)(window, render);
  view.sync({});
  vi.advanceTimersByTime(10000);
  expect(view.ready()).toBe(false);
  view.sync({ controlsVisible: false });
  vi.advanceTimersByTime(1999);
  expect(view.ready()).toBe(false);
  vi.advanceTimersByTime(1);
  expect(view.ready()).toBe(true);
  expect(render).toHaveBeenCalledOnce();
  view.sync({ controlsVisible: true });
  expect(view.ready()).toBe(false);
  view.sync({ controlsVisible: false });
  vi.advanceTimersByTime(1000);
  view.sync({ isPlaying: true });
  vi.advanceTimersByTime(2000);
  expect(view.ready()).toBe(false);
});
