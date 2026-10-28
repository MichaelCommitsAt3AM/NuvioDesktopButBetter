import { expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const controls = readFileSync('../composeApp/src/desktopMain/resources/player-ui/controls.js', 'utf8');
const hitTesting = controls.slice(controls.indexOf('const getPipEdgeHit ='), controls.indexOf('window.addEventListener("pointerup", () => {', controls.indexOf('const getPipEdgeHit =')));
const pointerDown = controls.slice(controls.indexOf('root.addEventListener("pointerdown", event => {', controls.indexOf('const getPipEdgeHit =')), controls.indexOf('if (pipLockButton) {', controls.indexOf('const getPipEdgeHit =')));

function pip() {
  const root = document.createElement('div');
  const handlers = {};
  root.addEventListener = (type, callback) => { handlers[type] = callback; };
  const send = vi.fn();
  new Function('root', 'window', 'document', 'send', `
    const state = { isInPip: true }, PIP_RESIZE_BORDER = 8;
    const isPipLocked = false, activeModal = null, speedBoostHoldTimer = null;
    let pipPointerDown = false, pipPointerStartX = 0, pipPointerStartY = 0;
    const setSuppressNextRootClick = () => {};
    ${hitTesting}
    ${pointerDown}
  `)(root, { innerWidth: 480, innerHeight: 270, addEventListener: (type, callback) => { handlers[type] = callback; } }, document, send);
  const event = (x, y, target = root) => ({ clientX: x, clientY: y, button: 0, target, preventDefault() {}, stopPropagation() {} });
  return { root, send, down: (x, y, target) => handlers.pointerdown(event(x, y, target)), move: (x, y) => handlers.pointermove(event(x, y)) };
}

it('starts one native drag after movement crosses the threshold', () => {
  const view = pip();
  view.down(220, 100);
  view.move(224, 103);
  expect(view.send).not.toHaveBeenCalled();
  view.move(240, 110);
  view.move(250, 115);
  expect(view.send.mock.calls).toEqual([['dragWindow', 0]]);
});

it.each([[1, 100, 10], [479, 100, 11], [220, 1, 12], [220, 269, 15], [1, 1, 13], [479, 1, 14], [1, 269, 16], [479, 269, 17]])('requests native resizing at (%i, %i) without hiding controls before acknowledgement', (x, y, hit) => {
  const view = pip();
  view.down(x, y);
  view.move(240, 110);
  expect(view.send.mock.calls).toEqual([['resizeWindow', hit]]);
  expect(view.root.classList.contains('native-resizing')).toBe(false);
});

it('keeps playback buttons out of window dragging', () => {
  const view = pip();
  const button = view.root.appendChild(document.createElement('button'));
  view.down(220, 100, button);
  view.move(240, 110);
  expect(view.send).not.toHaveBeenCalled();
});
