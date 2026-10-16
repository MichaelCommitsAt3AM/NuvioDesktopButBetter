import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { StreamsBackdrop, StreamsTitle } from './StreamsArtwork';

class Probe {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  src = '';
  decoding = '';
  complete = false;
  naturalWidth = 0;
  resolve!: () => void;
  decode = vi.fn(() => new Promise<void>(resolve => { this.resolve = resolve; }));
  constructor() { probes.push(this); }
}
let probes: Probe[];
beforeEach(() => { probes = []; vi.stubGlobal('Image', Probe); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('waits for complete decoding before revealing background and opening logo', async () => {
  const view = render(<><StreamsBackdrop url="background.jpg" /><StreamsTitle url="logo.png" title="Henry Danger" opening /></>);
  expect(view.container.querySelectorAll('img')).toHaveLength(0);
  expect(view.container.querySelector('.streams-opening-logo-slot')).toBeInTheDocument();
  act(() => { probes[0].onload!(); probes[1].onload!(); });
  expect(view.container.querySelectorAll('img')).toHaveLength(0);
  await act(async () => { probes[0].resolve(); probes[1].resolve(); });
  expect(view.container.querySelector('.streams-backdrop-image')).toHaveAttribute('src', 'background.jpg');
  expect(screen.getByRole('img', { name: 'Henry Danger' })).toHaveClass('streams-opening-logo');
});

it('falls back to a title if the logo fails and hides a failed background', () => {
  const view = render(<><StreamsBackdrop url="bad.jpg" /><StreamsTitle url="bad.png" title="Fallback" opening /></>);
  act(() => { probes[0].onerror!(); probes[1].onerror!(); });
  expect(screen.getByRole('heading', { name: 'Fallback' })).toBeInTheDocument();
  expect(view.container.querySelectorAll('img')).toHaveLength(0);
});

it('does not reveal stale artwork after navigating to another title', async () => {
  const view = render(<StreamsBackdrop url="old.jpg" />);
  act(() => probes[0].onload!());
  view.rerender(<StreamsBackdrop url="new.jpg" />);
  await act(async () => probes[0].resolve());
  expect(view.container.querySelector('img')).toBeNull();
  act(() => probes[1].onload!());
  await act(async () => probes[1].resolve());
  expect(view.container.querySelector('img')).toHaveAttribute('src', 'new.jpg');
});
