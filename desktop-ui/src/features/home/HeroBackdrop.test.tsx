import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { HeroBackdrop } from './HeroBackdrop';

type Probe = { onload: (() => void) | null; src: string; decode: ReturnType<typeof vi.fn>; resolve: () => void; reject: () => void };
let probes: Probe[];
let cached = false;
beforeEach(() => {
  probes = [];
  cached = false;
  vi.stubGlobal('Image', class {
    onload: (() => void) | null = null;
    src = '';
    decoding = '';
    complete = cached;
    naturalWidth = cached ? 1920 : 0;
    resolve!: () => void;
    reject!: () => void;
    decode = vi.fn(() => new Promise<void>((resolve, reject) => {
      this.resolve = resolve;
      this.reject = () => reject(new Error('Decode failed'));
    }));
    constructor() { probes.push(this); }
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('does not paint the first artwork until load AND decode finish, then starts its fade', async () => {
  const onSettled = vi.fn();
  const { container } = render(<HeroBackdrop url="https://example.invalid/first.jpg" onSettled={onSettled} />);
  const backdrop = container.firstElementChild as HTMLElement;
  expect(backdrop.style.backgroundImage).toBe('');
  expect(onSettled).not.toHaveBeenCalled();
  expect(backdrop).not.toHaveClass('is-ready');
  act(() => probes[0].onload!());
  expect(probes[0].decode).toHaveBeenCalledTimes(1);
  expect(backdrop.style.backgroundImage).toBe('');
  await act(async () => probes[0].resolve());
  expect(backdrop).toHaveClass('is-ready');
  expect(backdrop.style.backgroundImage).toContain('first.jpg');
  expect(onSettled).toHaveBeenCalledTimes(1);
});

it('also waits for a cached bitmap to decode', async () => {
  cached = true;
  const { container } = render(<HeroBackdrop url="https://example.invalid/cached.jpg" />);
  expect(probes[0].decode).toHaveBeenCalledTimes(1);
  expect(container.firstElementChild).not.toHaveClass('is-ready');
  await act(async () => probes[0].resolve());
  expect(container.firstElementChild).toHaveClass('is-ready');
});

it('ignores obsolete completions when the featured image changes during decoding', async () => {
  const view = render(<HeroBackdrop url="https://example.invalid/old.jpg" />);
  act(() => probes[0].onload!());
  view.rerender(<HeroBackdrop url="https://example.invalid/new.jpg" />);
  await act(async () => probes[0].resolve());
  const backdrop = view.container.firstElementChild as HTMLElement;
  expect(backdrop.style.backgroundImage).toBe('');
  act(() => probes[1].onload!());
  await act(async () => probes[1].resolve());
  expect(backdrop.style.backgroundImage).toContain('new.jpg');
});

it('never exposes failed decoding or an image that completes after unmount', async () => {
  const onSettled = vi.fn();
  const view = render(<HeroBackdrop url="https://example.invalid/broken.jpg" onSettled={onSettled} />);
  act(() => probes[0].onload!());
  await act(async () => probes[0].reject());
  expect(view.container.firstElementChild).not.toHaveClass('is-ready');
  expect(onSettled).toHaveBeenCalledTimes(1);
  view.rerender(<HeroBackdrop url="https://example.invalid/late.jpg" />);
  act(() => probes[1].onload!());
  view.unmount();
  await act(async () => probes[1].resolve());
  expect(view.container).toBeEmptyDOMElement();
});
