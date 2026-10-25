import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DetailsTitle } from './DetailsTitle';

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
const title = (url: string | null, owner = 'profile:movie:1', loading = false) => <DetailsTitle url={url} name="Movie title" owner={owner} loading={loading} />;
async function load(image: FakeImage) { await act(async () => { image.onload?.(); }); }

it('shows an animated placeholder until the logo has loaded and decoded, without flashing the text title', async () => {
  render(title('logo.png'));
  expect(screen.getByRole('status', { name: 'Loading title artwork' })).toHaveClass('detail-logo-loading');
  expect(screen.queryByRole('heading')).toBeNull();
  let finish!: () => void;
  images[0].decode.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
  act(() => images[0].onload?.());
  expect(screen.queryByRole('img')).toBeNull();
  expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
  await act(async () => finish());
  expect(screen.getByRole('img', { name: 'Movie title' })).toHaveAttribute('src', 'logo.png');
  expect(screen.queryByRole('status')).toBeNull();
  expect(screen.queryByRole('heading')).toBeNull();
});

it('waits for metadata enrichment before choosing the no-logo fallback', () => {
  const view = render(title(null, undefined, true));
  expect(screen.getByRole('status')).toBeVisible();
  view.rerender(title(null));
  expect(screen.getByRole('heading', { name: 'Movie title' })).toBeVisible();
  expect(screen.queryByRole('status')).toBeNull();
});

it.each(['download', 'decode'])('uses the text fallback if logo %s fails', async failure => {
  render(title('broken.png'));
  if (failure === 'download') act(() => images[0].onerror?.());
  else { images[0].decode.mockRejectedValue(new Error('Invalid image')); await load(images[0]); }
  expect(screen.getByRole('heading', { name: 'Movie title' })).toBeVisible();
  expect(screen.queryByRole('status')).toBeNull();
});

it('handles a failure when the decoded logo is painted', async () => {
  render(title('logo.png')); await load(images[0]);
  fireEvent.error(screen.getByRole('img'));
  expect(screen.getByRole('heading', { name: 'Movie title' })).toBeVisible();
});

it('keeps decoded artwork while enrichment loads and if its replacement fails', async () => {
  const view = render(title('addon.png')); await load(images[0]);
  view.rerender(title('enriched.png'));
  expect(screen.getByRole('img')).toHaveAttribute('src', 'addon.png');
  act(() => images[1].onerror?.());
  expect(screen.getByRole('img')).toHaveAttribute('src', 'addon.png');
  expect(screen.queryByRole('status')).toBeNull();
});

it('does not show another title or profile’s logo while the next logo is pending', async () => {
  const view = render(title('first.png')); await load(images[0]);
  view.rerender(title('second.png', 'other-profile:movie:2'));
  expect(screen.queryByRole('img')).toBeNull();
  expect(screen.queryByRole('heading')).toBeNull();
  expect(screen.getByRole('status')).toBeVisible();
  await load(images[1]);
  expect(screen.getByRole('img')).toHaveAttribute('src', 'second.png');
});
