import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { HeroTitle } from './HeroTitle';

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

it('reserves the logo area and reveals the title artwork only after load and decode', async () => {
  const open = vi.fn();
  render(<HeroTitle url="https://example.invalid/logo.png" name="Grey’s Anatomy" onOpen={open} />);
  const button = screen.getByRole('button', { name: 'Grey’s Anatomy' });
  expect(button).toHaveClass('hero-logo-button');
  expect(screen.queryByRole('img')).toBeNull();
  act(() => probes[0].onload!());
  expect(screen.queryByRole('img')).toBeNull();
  await act(async () => probes[0].resolve());
  expect(screen.getByRole('img', { name: 'Grey’s Anatomy' })).toHaveClass('hero-logo-ready');
  fireEvent.click(button);
  expect(open).toHaveBeenCalledOnce();
});

it('ignores an old logo finishing after the feature changes', async () => {
  const view = render(<HeroTitle url="https://example.invalid/old.png" name="Old series" onOpen={() => {}} />);
  act(() => probes[0].onload!());
  view.rerender(<HeroTitle url="https://example.invalid/new.png" name="New series" onOpen={() => {}} />);
  await act(async () => probes[0].resolve());
  expect(screen.queryByRole('img')).toBeNull();
  act(() => probes[1].onload!());
  await act(async () => probes[1].resolve());
  expect(screen.getByRole('img', { name: 'New series' })).toHaveAttribute('src', 'https://example.invalid/new.png');
});

it('uses the plain title when artwork fails', () => {
  render(<HeroTitle url="https://example.invalid/broken.png" name="Fallback series" onOpen={() => {}} />);
  act(() => probes[0].onerror!());
  expect(screen.getByRole('heading', { name: 'Fallback series' })).toBeInTheDocument();
  expect(screen.queryByRole('img')).toBeNull();
});

it('renders a plain title immediately if there is no logo', () => {
  render(<HeroTitle url={null} name="No logo" onOpen={() => {}} />);
  expect(screen.getByRole('heading', { name: 'No logo' })).toBeInTheDocument();
  expect(probes).toHaveLength(0);
});
