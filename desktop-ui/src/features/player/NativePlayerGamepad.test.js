import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync('../composeApp/src/desktopMain/resources/player-ui/gamepad.js', 'utf8');

let pressed;
let frames;
let keys;
let controls;
let record;

function step() { const pending = frames; frames = []; pending.forEach(callback => callback()); }
function press(index) { pressed.add(index); step(); pressed.delete(index); step(); }

beforeEach(() => {
  pressed = new Set(); frames = []; keys = [];
  controls = { state: { nativeControllerInput: false, isFullscreen: false, isInPip: false }, activeModal: '', send: vi.fn() };
  vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  const pad = () => ({ connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, (_, index) => ({ pressed: pressed.has(index), value: pressed.has(index) ? 1 : 0 })) });
  const navigatorStub = { getGamepads: () => [pad()] };
  const windowStub = { addEventListener: () => {} };
  record = event => keys.push(`${event.type}:${event.code}`);
  document.addEventListener('keydown', record);
  document.addEventListener('keyup', record);
  // controls.js owns `state` and `activeModal` as script globals; the fixture provides them.
  new Function('navigator', 'window', 'requestAnimationFrame', 'controls', `
    with (controls) { ${source} }
  `)(navigatorStub, windowStub, callback => { frames.push(callback); return frames.length; }, controls);
});
afterEach(() => {
  document.removeEventListener('keydown', record);
  document.removeEventListener('keyup', record);
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

it('maps Kotlin controller buttons to the overlay shortcuts', () => {
  press(0); press(1); press(4); press(5); press(2); press(3); press(9); press(8); press(12);
  expect(keys).toEqual([
    'keydown:Space', 'keyup:Space', 'keydown:Escape', 'keydown:ArrowLeft', 'keydown:ArrowRight',
    'keydown:KeyA', 'keydown:KeyS', 'keydown:KeyE', 'keydown:KeyQ', 'keydown:ArrowUp',
  ]);
});

it('picks the focused row with A instead of toggling playback', () => {
  const row = document.createElement('button');
  row.className = 'track-row';
  const click = vi.fn(); row.addEventListener('click', click);
  document.body.append(row); row.focus();
  press(0);
  expect(click).toHaveBeenCalledTimes(1);
  expect(keys).toEqual([]);
});

it('stays off while the Compose app polls the controller natively', () => {
  controls.state.nativeControllerInput = true;
  press(0); press(1);
  expect(keys).toEqual([]);
});

it('goes back with B in fullscreen instead of leaving fullscreen', () => {
  controls.state.isFullscreen = true;
  press(1);
  expect(controls.send).toHaveBeenCalledWith('back', 0);
  expect(keys).toEqual([]);
});

it('still closes an open panel with B in fullscreen', () => {
  controls.state.isFullscreen = true;
  controls.activeModal = 'audio';
  press(1);
  expect(controls.send).not.toHaveBeenCalled();
  expect(keys).toEqual(['keydown:Escape']);
});
