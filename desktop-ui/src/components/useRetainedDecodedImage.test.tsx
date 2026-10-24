import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useRetainedDecodedImage } from './useRetainedDecodedImage';

const images: FakeImage[] = [];
class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  src = '';
  decoding = '';
  complete = false;
  naturalWidth = 0;
  decode = vi.fn(async () => {});
  constructor() { images.push(this); }
}
beforeEach(() => { images.length = 0; vi.stubGlobal('Image', FakeImage); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
async function loaded(image: FakeImage) { await act(async () => { image.onload?.(); }); }

it('keeps the current artwork while the enriched bitmap loads and decodes', async () => {
  const view = renderHook(({ url, owner }) => useRetainedDecodedImage(url, owner), { initialProps: { url: 'addon.jpg', owner: 'child:movie' } });
  await loaded(images[0]);
  expect(view.result.current).toBe('addon.jpg');
  view.rerender({ url: 'tmdb.jpg', owner: 'child:movie' });
  expect(view.result.current).toBe('addon.jpg');
  let finishDecode!: () => void;
  images[1].decode.mockImplementation(() => new Promise<void>((resolve) => { finishDecode = resolve; }));
  act(() => { images[1].onload?.(); });
  expect(view.result.current).toBe('addon.jpg');
  await act(async () => finishDecode());
  expect(view.result.current).toBe('tmdb.jpg');
});

it('keeps good artwork if its replacement fails', async () => {
  const view = renderHook(({ url }) => useRetainedDecodedImage(url, 'movie'), { initialProps: { url: 'addon.jpg' } });
  await loaded(images[0]);
  view.rerender({ url: 'broken.jpg' });
  act(() => { images[1].onerror?.(); });
  expect(view.result.current).toBe('addon.jpg');
});

it('does not retain artwork across titles or profiles and ignores obsolete completions', async () => {
  const view = renderHook(({ url, owner }) => useRetainedDecodedImage(url, owner), { initialProps: { url: 'first.jpg', owner: 'profile1:movie1' } });
  await loaded(images[0]);
  view.rerender({ url: 'pending.jpg', owner: 'profile1:movie1' });
  const obsolete = images[1].onload;
  view.rerender({ url: 'second.jpg', owner: 'profile2:movie2' });
  expect(view.result.current).toBeNull();
  await act(async () => obsolete?.());
  expect(view.result.current).toBeNull();
  await loaded(images[2]);
  expect(view.result.current).toBe('second.jpg');
});
