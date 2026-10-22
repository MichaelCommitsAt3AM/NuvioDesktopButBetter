import { expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const controls = readFileSync('../composeApp/src/desktopMain/resources/player-ui/controls.js', 'utf8');
const start = controls.indexOf('document.addEventListener("pointermove", event => {');
const source = controls.slice(start, controls.indexOf('document.addEventListener("pointerup"', start));

function player(initial = {}, error = '') {
  const render = vi.fn();
  const activity = vi.fn();
  let handler;
  const fixture = new Function('document', 'renderChrome', 'noteChromeActivity', 'error', `
    let state = { isFullscreen: true, controlsVisible: false, isLocked: false };
    let isPointerWithinPlayer = true;
    const syncChromeWithPointerPolicy = () => {};
    const noteCursorActivity = () => {};
    const isChromeInteractionTarget = () => false;
    const updateChromePointerInside = () => {};
    const playbackErrorText = () => error;
    ${source}
    return { set: value => { state = { ...state, ...value }; }, get: () => state };
  `)({ addEventListener: (_, callback) => { handler = callback; } }, render, activity, error);
  fixture.set(initial);
  return { move: () => handler({ target: null }), state: fixture.get, render, activity };
}

it('reveals idle fullscreen controls on mouse movement without a click, including repeated idle cycles', () => {
  const view = player();
  view.move();
  expect(view.state().controlsVisible).toBe(true);
  expect(view.render).toHaveBeenCalledOnce();
  expect(view.activity).toHaveBeenCalledWith(true);
  view.state().controlsVisible = false;
  view.move();
  expect(view.state().controlsVisible).toBe(true);
  expect(view.render).toHaveBeenCalledTimes(2);
});

it.each([
  [{ isLocked: true }, ''],
  [{}, 'Playback failed'],
  [{ isFullscreen: false }, ''],
])('preserves locked, error and windowed visibility policy (%j)', (state, error) => {
  const view = player(state, error);
  view.move();
  expect(view.state().controlsVisible).toBe(false);
  expect(view.render).not.toHaveBeenCalled();
});
