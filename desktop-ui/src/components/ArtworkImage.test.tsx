import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { ArtworkImage } from './ArtworkImage';

const settings = vi.hoisted(() => ({ mode: 'OnHover' }));
vi.mock('../bridge', () => ({ useFeatureSnapshot: () => ({ cardStyle: { animatedArtworkMode: settings.mode } }) }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); settings.mode = 'OnHover'; });

it('freezes artwork outside hover and bounds the still bitmap allocation', () => {
  const draw = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: draw } as any);
  const view = render(<div><ArtworkImage src="https://art.test/animated.webp" alt="Poster" /></div>);
  const image = view.getByAltText('Poster') as HTMLImageElement;
  Object.defineProperties(image, { complete: { value: true }, naturalWidth: { value: 4000 }, naturalHeight: { value: 4000 } });
  fireEvent.load(image);
  const canvas = view.container.querySelector('canvas')!;
  expect(canvas.width * canvas.height).toBeLessThanOrEqual(1_301_000);
  expect(draw).toHaveBeenCalledTimes(1);
  expect(image.style.visibility).toBe('hidden');
  fireEvent.pointerEnter(image.parentElement!);
  expect(image.style.visibility).toBe('');
  expect(canvas.style.visibility).toBe('hidden');
  fireEvent.pointerLeave(image.parentElement!);
  expect(image.style.visibility).toBe('hidden');
  view.rerender(<div><ArtworkImage src="https://art.test/replacement.webp" alt="Poster" /></div>);
  // Never display the old title's canvas while replacement artwork loads.
  expect(image.style.visibility).toBe('');
});

it('uses the browser image directly in Always mode', () => {
  settings.mode = 'Always';
  const view = render(<ArtworkImage src="https://art.test/animated.gif" />);
  expect(view.container.querySelector('canvas')).toBeNull();
});
