import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';

const source = readFileSync(resolve(process.cwd(), '../composeApp/src/desktopMain/resources/player-ui/presentation.js'), 'utf8');
const prepare = () => {
  window.eval(source);
  return window.preparePlayerPresentation;
};
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

it('keeps the previous screen until artwork decodes and two frames pass', async () => {
  vi.useFakeTimers();
  let decode;
  const frames = [];
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { frames.push(callback); return frames.length; });
  const present = vi.fn();
  const ready = prepare()([{ getAttribute: () => 'poster.jpg', decode: () => new Promise(resolve => { decode = resolve; }) }], present);
  await vi.advanceTimersByTimeAsync(200);
  expect(present).not.toHaveBeenCalled();
  decode();
  await vi.advanceTimersByTimeAsync(0);
  frames.shift()(0);
  expect(present).not.toHaveBeenCalled();
  frames.shift()(16);
  await ready;
  expect(present).toHaveBeenCalledTimes(1);
});

it('hands off even if artwork and hidden-window animation frames never finish', async () => {
  vi.useFakeTimers();
  vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
  const present = vi.fn();
  const ready = prepare()([{ getAttribute: () => 'poster.jpg', decode: () => new Promise(() => {}) }], present);
  await vi.advanceTimersByTimeAsync(1599);
  expect(present).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  await ready;
  expect(present).toHaveBeenCalledTimes(1);
});

it('failed or missing artwork does not prevent presentation', async () => {
  vi.useFakeTimers();
  const present = vi.fn();
  const ready = prepare()([
    { getAttribute: () => 'broken.jpg', decode: () => Promise.reject(new Error('image unavailable')) },
    { getAttribute: () => '', decode: vi.fn() },
  ], present);
  await vi.runAllTimersAsync();
  await ready;
  expect(present).toHaveBeenCalledTimes(1);
});
