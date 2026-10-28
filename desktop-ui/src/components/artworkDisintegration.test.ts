import { afterEach, expect, it, vi } from 'vitest';
import { animateArtworkDisintegration, captureArtwork } from './artworkDisintegration';

afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

function frame() {
  const node = document.body.appendChild(document.createElement('div'));
  Object.defineProperties(node, { clientWidth: { value: 100 }, clientHeight: { value: 60 } });
  node.style.backgroundColor = '#202225';
  node.style.backgroundImage = 'linear-gradient(0deg, black, transparent), url("https://art.example/title.jpg")';
  node.textContent = 'Original title';
  return node;
}

it('draws artwork underneath the real card text without covering it with the fallback background', async () => {
  const sources: string[] = [];
  class DecodedImage {
    naturalWidth = 100; naturalHeight = 60; onload?: () => void; crossOrigin = '';
    set src(value: string) { sources.push(value); queueMicrotask(() => this.onload?.()); }
  }
  vi.stubGlobal('Image', DecodedImage);
  const context = { save: vi.fn(), beginPath: vi.fn(), roundRect: vi.fn(), clip: vi.fn(), drawImage: vi.fn(), restore: vi.fn(), filter: 'none' };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
  const bitmap = await captureArtwork(frame());
  expect(bitmap.width).toBe(100); expect(bitmap.height).toBe(60);
  expect(sources).toContain('https://art.example/title.jpg');
  const svg = decodeURIComponent(sources.find(url => url.startsWith('data:image/svg+xml'))!.split(',').slice(1).join(','));
  const document = new DOMParser().parseFromString(svg, 'image/svg+xml');
  expect(document.querySelector('parsererror')).toBeNull();
  const card = document.querySelector('foreignObject > div')!;
  expect(card.getAttribute('style')).toContain('background-color: transparent');
  expect(card.textContent).toBe('Original title');
  expect(card.getAttribute('style')).not.toContain('https://art.example');
  expect(context.drawImage).toHaveBeenCalledTimes(2);
});

it('does not strand a destructive action if bitmap capture is unavailable', async () => {
  vi.useFakeTimers();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  const start = vi.fn(), finish = vi.fn();
  const cancel = animateArtworkDisintegration(frame(), start, finish);
  await Promise.resolve(); await Promise.resolve();
  expect(start).toHaveBeenCalledOnce();
  expect(finish).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1500);
  expect(finish).toHaveBeenCalledOnce();
  cancel();
});

it('keeps explicitly visible lifted descendants hidden after the last particle frame and restores them on cancellation', async () => {
  class DecodedImage {
    naturalWidth = 100; naturalHeight = 60; onload?: () => void;
    set src(_value: string) { queueMicrotask(() => this.onload?.()); }
  }
  vi.stubGlobal('Image', DecodedImage);
  const context = { save: vi.fn(), beginPath: vi.fn(), roundRect: vi.fn(), clip: vi.fn(), drawImage: vi.fn(), restore: vi.fn(),
    clearRect: vi.fn(), translate: vi.fn(), getImageData: () => ({ data: new Uint8ClampedArray(100 * 60 * 4) }), filter: 'none' };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
  vi.spyOn(performance, 'now').mockReturnValue(0);
  let draw!: FrameRequestCallback;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { draw = callback; return 1; });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const node = frame();
  const wrapper = node.appendChild(document.createElement('div'));
  wrapper.style.opacity = '.65';
  const clone = wrapper.appendChild(document.createElement('div'));
  // LiftedCardArtwork freezes this on every descendant; parent visibility:hidden
  // cannot hide it. This was missing from the original animation fixture.
  clone.style.visibility = 'visible'; clone.textContent = 'Intact lifted card';
  const start = vi.fn(), finish = vi.fn();
  const cancel = animateArtworkDisintegration(node, start, finish);
  await vi.waitFor(() => expect(start).toHaveBeenCalledOnce());
  expect(wrapper.style.opacity).toBe('0');
  expect(clone.style.visibility).toBe('visible');
  draw(1500);
  expect(finish).toHaveBeenCalledOnce();
  expect(wrapper.style.opacity).toBe('0');
  expect(node.querySelector('canvas')).not.toBeNull();
  cancel();
  expect(wrapper.style.opacity).toBe('0.65');
  expect(node.querySelector('canvas')).toBeNull();
});
