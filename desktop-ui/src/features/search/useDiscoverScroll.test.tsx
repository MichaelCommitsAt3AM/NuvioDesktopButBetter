import { useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { useDiscoverScroll } from './useDiscoverScroll';

let notifyResize: () => void;
let sequence = 0;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { notifyResize = callback; }
    observe() {} disconnect() {}
  });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

function Discover() {
  const navigate = useNavigate();
  const [catalog, setCatalog] = useState('movies');
  const [profile, setProfile] = useState(1);
  const [searching, setSearching] = useState(false);
  const scroll = useDiscoverScroll(profile, catalog, searching, () => {});
  return <section className="search-discover" onClickCapture={() => scroll.save.current()}>
    <div className="poster-grid" data-rendered-count="72" data-initial-count={scroll.initialVisibleCount} />
    <button onClick={() => navigate('/details/movie')}>Open title</button>
    <button onClick={() => setCatalog('series')}>Change catalog</button>
    <button onClick={() => setProfile(2)}>Change profile</button>
    <button onClick={() => setSearching(true)}>Start search</button>
  </section>;
}
function Detail() {
  const navigate = useNavigate();
  return <><button onClick={() => navigate(-1)}>Back</button><button onClick={() => navigate('/search')}>Fresh Search entry</button></>;
}
const page = () => <MemoryRouter initialEntries={[{ pathname: '/search', key: `discover-scroll-${sequence++}` }]}>
  <main className="main-area"><Routes><Route path="/search" element={<Discover />} /><Route path="/details/movie" element={<Detail />} /></Routes></main>
</MemoryRouter>;
function scrollTo(top: number) {
  const main = document.querySelector<HTMLElement>('.main-area')!;
  main.scrollTop = top;
  fireEvent.scroll(main);
  return main;
}

it('restores a Discover history entry after opening a title without saving the details offset', () => {
  render(page());
  const main = scrollTo(1600);
  fireEvent.click(screen.getByText('Open title'));
  main.scrollTop = 0;
  fireEvent.scroll(main);
  fireEvent.click(screen.getByText('Back'));
  expect(main.scrollTop).toBe(1600);
  expect(document.querySelector('.poster-grid')).toHaveAttribute('data-initial-count', '72');
  // Reaching the saved position must not leave a later-frame scroll running.
  expect(vi.getTimerCount()).toBe(0);
});

it.each(['Start search', 'Change catalog', 'Change profile'])('starts at the top for %s', action => {
  render(page());
  const main = scrollTo(1600);
  fireEvent.click(screen.getByText(action));
  expect(main.scrollTop).toBe(0);
});

it('does not apply an old offset to a fresh Search navigation entry', () => {
  render(page());
  const main = scrollTo(1600);
  fireEvent.click(screen.getByText('Open title'));
  fireEvent.click(screen.getByText('Fresh Search entry'));
  expect(main.scrollTop).toBe(0);
  expect(document.querySelector('.poster-grid')).toHaveAttribute('data-initial-count', '0');
});

it.each([false, true])('retries a clamped grid and respects user interruption (%s)', interrupt => {
  render(page());
  const main = scrollTo(1800);
  fireEvent.click(screen.getByText('Open title'));
  let maximum = 400;
  let actual = 0;
  Object.defineProperty(main, 'scrollTop', { configurable: true, get: () => actual, set: value => { actual = Math.min(value, maximum); } });
  fireEvent.click(screen.getByText('Back'));
  expect(main.scrollTop).toBe(400);
  if (interrupt) fireEvent.wheel(main, { deltaY: -100 });
  maximum = 2400;
  act(() => notifyResize());
  expect(main.scrollTop).toBe(interrupt ? 400 : 1800);
});
