import { describe, expect, it, vi, afterEach } from 'vitest';
import { act, render, cleanup, fireEvent } from '@testing-library/react';
import { Link, MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { createRef, Profiler, StrictMode } from 'react';
import { LiquidNavigation, type LiquidNavigationController } from './LiquidNavigation';

class StubObserver {
  callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) { this.callback = callback; }
  observe() {}
  unobserve() {}
  disconnect() {}
}

function visuals(count: number) {
  return Array.from({ length: count }, (_, index) => <span key={index}>icon{index}</span>);
}

describe('LiquidNavigation selection', () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  it('keeps animating selection after StrictMode restarts effects', () => {
    vi.stubGlobal('ResizeObserver', StubObserver);
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
    const frames = new Map<number, FrameRequestCallback>();
    let frameId = 0, time = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => time);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.set(++frameId, callback);
      return frameId;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => { frames.delete(id); });
    const advance = () => {
      for (let tick = 0; tick < 120; tick++) {
        time += 16;
        const pending = [...frames.values()];
        frames.clear();
        pending.forEach(callback => callback(time));
      }
    };
    const labels = ['Home', 'Search', 'Library', 'Settings'];
    const navigation = (selectedIndex: number) => <StrictMode>
      <LiquidNavigation labels={labels} visuals={visuals(4)} selectedIndex={selectedIndex}
        style="expanded" heroEnabled profileOpen={false} glowEnabled={false}
        routeKey={['/', '/search', '/library', '/settings'][selectedIndex]}
        onDragSelect={() => {}} onDragStart={() => {}}><span>targets</span></LiquidNavigation>
    </StrictMode>;
    const view = render(navigation(0));
    const nav = view.getByRole('navigation');
    Object.defineProperties(nav, { clientWidth: { value: 456 }, clientHeight: { value: 48 } });
    window.dispatchEvent(new Event('resize'));
    advance(); // Complete the batched resize before checking animation-only frames.
    const measurements = vi.spyOn(window, 'getComputedStyle');
    advance();
    expect(measurements).not.toHaveBeenCalled();
    measurements.mockRestore();
    const selected = view.container.querySelector('.liquid-nav-paint.selected') as HTMLElement;
    for (const index of [1, 2, 3, 0]) {
      view.rerender(navigation(index));
      advance();
      // Each tab is 112px wide, with a 4px inset and 20px pill radius.
      const pillStart = Number(selected.style.clipPath.match(/M ([\d.e+-]+)/)?.[1]);
      expect(pillStart).toBeCloseTo(24 + index * 112, 2);
      expect(selected.style.visibility).toBe('visible');
    }
    view.unmount();
    expect(frames.size).toBe(0);
  });
  it('moves the selection pill when selectedIndex changes', () => {
    vi.stubGlobal('ResizeObserver', StubObserver);
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      addEventListener() {},
      removeEventListener() {},
    }));
    const labels = ['Home', 'Search', 'Library', 'Settings'];
    const view = render(
      <MemoryRouter>
        <LiquidNavigation
          labels={labels}
          visuals={visuals(4)}
          selectedIndex={0}
          style="expanded"
          heroEnabled
          profileOpen={false}
          glowEnabled={false}
          routeKey="/"
          onDragSelect={() => {}}
          onDragStart={() => {}}
        >
          <span>targets</span>
        </LiquidNavigation>
      </MemoryRouter>,
    );
    const selected = view.container.querySelector('.liquid-nav-paint.selected') as HTMLElement;
    const before = selected.style.clipPath;
    view.rerender(
      <MemoryRouter>
        <LiquidNavigation
          labels={labels}
          visuals={visuals(4)}
          selectedIndex={3}
          style="expanded"
          heroEnabled
          profileOpen={false}
          glowEnabled={false}
          routeKey="/settings"
          onDragSelect={() => {}}
          onDragStart={() => {}}
        >
          <span>targets</span>
        </LiquidNavigation>
      </MemoryRouter>,
    );
    expect(selected.style.clipPath).not.toBe(before);
    expect(selected.style.visibility).toBe('visible');
  });
});

describe('navigation intent independent of the committed route', () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  function setup(reduced = false) {
    vi.stubGlobal('ResizeObserver', StubObserver);
    vi.stubGlobal('matchMedia', () => ({ matches: reduced, addEventListener() {}, removeEventListener() {} }));
    const frames = new Map<number, FrameRequestCallback>();
    let id = 0, time = performance.now();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++id, callback); return id; });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
    const controller = createRef<LiquidNavigationController>();
    const tree = (index: number, version = 'initial') => <StrictMode><LiquidNavigation controllerRef={controller} selectedIndex={index}
      labels={['Home', 'Search', 'Library', 'Settings']} visuals={visuals(4)} style="expanded" heroEnabled profileOpen={false} glowEnabled
      routeKey={['/', '/search', '/library', '/settings'][index]} routeVersion={version} onDragSelect={() => {}} onDragStart={() => {}}><span>targets</span></LiquidNavigation></StrictMode>;
    const view = render(tree(0));
    const nav = view.getByRole('navigation');
    Object.defineProperties(nav, { clientWidth: { value: 456 }, clientHeight: { value: 48 } });
    fireEvent.resize(window);
    const step = (count: number) => act(() => {
      for (let tick = 0; tick < count; tick++) {
        time += 16;
        const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(time));
      }
    });
    step(120);
    return { ...view, controller, tree, step, frames };
  }
  it('moves before navigation, commits only the newest target and never navigates twice', () => {
    const view = setup();
    const search = vi.fn(), library = vi.fn();
    const pill = view.container.querySelector<HTMLElement>('.liquid-nav-paint.selected')!;
    const initial = pill.style.clipPath;
    act(() => view.controller.current!.select(1, search));
    view.step(1);
    expect(pill.style.clipPath).not.toBe(initial);
    expect(search).not.toHaveBeenCalled();
    act(() => view.controller.current!.select(2, library));
    view.step(120);
    expect(search).not.toHaveBeenCalled();
    expect(library).toHaveBeenCalledOnce();
    expect(Number(pill.style.clipPath.match(/M ([\d.e+-]+)/)?.[1])).toBeCloseTo(248, 2);
    view.step(120);
    expect(library).toHaveBeenCalledOnce();
  });
  it('cancels a queued destination on Back/Forward even when the root tab is unchanged', () => {
    const view = setup();
    const commit = vi.fn();
    act(() => view.controller.current!.select(1, commit));
    view.step(1);
    view.rerender(view.tree(0, 'back-entry'));
    view.step(120);
    expect(commit).not.toHaveBeenCalled();
  });
  it('cancels both animation and queued navigation on unmount', () => {
    const view = setup();
    const commit = vi.fn();
    act(() => view.controller.current!.select(3, commit));
    view.unmount();
    view.step(120);
    expect(commit).not.toHaveBeenCalled();
    expect(view.frames.size).toBe(0);
  });
  it('navigates immediately with reduced motion', () => {
    const view = setup(true);
    const commit = vi.fn();
    act(() => view.controller.current!.select(1, commit));
    expect(commit).toHaveBeenCalledOnce();
  });
  it('starts navigation after two frames while the original-speed bubble is still moving', () => {
    const view = setup();
    const commit = vi.fn();
    act(() => view.controller.current!.select(3, commit));
    view.step(1);
    expect(commit).not.toHaveBeenCalled();
    view.step(1);
    expect(commit).toHaveBeenCalledOnce();
    const pill = view.container.querySelector<HTMLElement>('.liquid-nav-paint.selected')!;
    expect(Number(pill.style.clipPath.match(/M ([\d.e+-]+)/)?.[1])).toBeLessThan(360);
    view.step(120);
    expect(Number(pill.style.clipPath.match(/M ([\d.e+-]+)/)?.[1])).toBeCloseTo(360, 2);
  });
  it('does not wait for animation frames when reselecting an already settled tab', () => {
    const view = setup();
    const commit = vi.fn();
    act(() => view.controller.current!.select(0, commit));
    expect(commit).toHaveBeenCalledOnce();
  });
  it('keeps browser playback through its route commit and retargets from the visible position', () => {
    const view = setup();
    const original = HTMLElement.prototype.animate;
    const animations: Array<{ currentTime: number; cancel: ReturnType<typeof vi.fn> }> = [];
    const animate = vi.fn(() => {
      const animation = { currentTime: 0, cancel: vi.fn(), finished: new Promise<void>(() => {}) };
      animations.push(animation);
      return animation as unknown as Animation;
    });
    HTMLElement.prototype.animate = animate;
    try {
      const commit = vi.fn();
      act(() => view.controller.current!.select(1, commit));
      view.step(2);
      expect(commit).toHaveBeenCalledOnce();
      expect(view.frames.size).toBe(0);
      view.rerender(view.tree(1, 'own-route'));
      expect(animations.every(animation => !animation.cancel.mock.calls.length)).toBe(true);
      animations[0].currentTime = 120;
      const previousCount = animations.length;
      const nextCommit = vi.fn();
      act(() => view.controller.current!.select(2, nextCommit));
      expect(animations.slice(0, previousCount).every(animation => animation.cancel.mock.calls.length === 1)).toBe(true);
      const firstFrame = (animate.mock.calls[previousCount] as unknown as [Keyframe[]])[0][0];
      const x = Number(String(firstFrame.transform).match(/translate\(([\d.e+-]+)px/)?.[1]);
      expect(x).toBeGreaterThan(4); expect(x).toBeLessThan(116);
      view.rerender(view.tree(0, 'back-entry'));
      view.step(120);
      expect(nextCommit).not.toHaveBeenCalled();
      expect(animations.every(animation => animation.cancel.mock.calls.length === 1)).toBe(true);
    } finally {
      view.unmount();
      if (original) HTMLElement.prototype.animate = original;
      else delete (HTMLElement.prototype as { animate?: unknown }).animate;
    }
  });
});

const routes = ['/', '/search', '/library', '/settings'];
const tabLabels = ['Home', 'Search', 'Library', 'Settings'];
function DragNavigation({ onSelect, onStart, profileOpen = false }: { onSelect: (index: number) => void; onStart: () => void; profileOpen?: boolean }) {
  const location = useLocation(), navigate = useNavigate();
  return <><output data-testid="route">{location.pathname}</output><LiquidNavigation
    labels={tabLabels} visuals={visuals(4)} selectedIndex={routes.indexOf(location.pathname)}
    style="expanded" heroEnabled profileOpen={profileOpen} glowEnabled routeKey={location.pathname}
    onDragStart={onStart} onDragSelect={index => { onSelect(index); navigate(routes[index]); }}>
    {routes.map((route, index) => <Link key={route} to={route}>{index === 3 && <img src="avatar.png" alt="Profile" />}{tabLabels[index]}</Link>)}
  </LiquidNavigation></>;
}

describe('Kotlin-style navigation dragging', () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  function setup({ reduced = false, density = 1, profileOpen = false, Observer = StubObserver } = {}) {
    vi.stubGlobal('ResizeObserver', Observer);
    vi.stubGlobal('PointerEvent', MouseEvent);
    vi.stubGlobal('matchMedia', () => ({ matches: reduced, addEventListener() {}, removeEventListener() {} }));
    const frames = new Map<number, FrameRequestCallback>();
    let frameId = 0, time = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => time);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++frameId, callback); return frameId; });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
    const onSelect = vi.fn(), onStart = vi.fn();
    const commits = vi.fn();
    const view = render(<Profiler id="navigation" onRender={commits}><div className="shell"><main className="main-area" /><MemoryRouter><DragNavigation onSelect={onSelect} onStart={onStart} profileOpen={profileOpen} /></MemoryRouter></div></Profiler>);
    const nav = view.getByRole('navigation');
    Object.defineProperties(nav, { clientWidth: { value: 456 * density, configurable: true }, clientHeight: { value: 48 * density, configurable: true } });
    nav.style.setProperty('--ui-scale', String(density));
    Object.assign(nav, { setPointerCapture: vi.fn() });
    fireEvent.resize(window);
    const advance = () => {
      for (let tick = 0; tick < 30; tick++) {
        time += 16; const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(time));
      }
    };
    const frame = () => {
      time += 16; const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(time));
    };
    advance(); // Apply the initial viewport measurement before interacting.
    const pointer = (x: number) => ({ button: 0, clientX: x * density, clientY: 24 * density });
    return { ...view, nav, onSelect, onStart, advance, frame, commits, pointer };
  }

  it.each([false, true])('drags across real links, navigating only on release (reduced motion: %s)', reduced => {
    const view = setup({ reduced });
    const home = view.getByRole('link', { name: 'Home' });
    const pill = view.container.querySelector('.liquid-nav-paint.selected') as HTMLElement;
    view.advance(); const initial = pill.style.clipPath;
    fireEvent.pointerDown(home, view.pointer(60));
    // Chromium's default link drag would cancel the pointer stream here.
    expect(fireEvent.dragStart(home)).toBe(false);
    fireEvent.pointerMove(view.nav, view.pointer(284));
    view.advance();
    expect(pill.style.clipPath).not.toBe(initial);
    expect(view.getByTestId('route')).toHaveTextContent(/^\/$/);
    expect(view.onSelect).not.toHaveBeenCalled();
    fireEvent.pointerUp(view.nav, view.pointer(396));
    expect(view.onSelect).toHaveBeenCalledExactlyOnceWith(3);
    expect(view.onStart).toHaveBeenCalledOnce();
    expect(view.getByTestId('route')).toHaveTextContent('/settings');
    fireEvent.click(home);
    expect(view.getByTestId('route')).toHaveTextContent('/settings');
  });

  it('matches Kotlin release rounding with desktop display scaling', () => {
    const view = setup({ density: 1.5 });
    fireEvent.pointerDown(view.getByRole('link', { name: 'Home' }), view.pointer(60));
    fireEvent.pointerMove(view.nav, view.pointer(180));
    fireEvent.pointerUp(view.nav, view.pointer(230));
    expect(view.onSelect).toHaveBeenCalledExactlyOnceWith(2);
    expect(view.getByTestId('route')).toHaveTextContent('/library');
  });

  it('prevents avatar image dragging too', () => {
    const view = setup();
    expect(fireEvent.dragStart(view.getByRole('img', { name: 'Profile' }))).toBe(false);
  });

  it('can drag left from Settings and clamps a release beyond the first tab', () => {
    const view = setup();
    const settings = view.getByRole('link', { name: 'Profile Settings' });
    fireEvent.click(settings);
    fireEvent.pointerDown(settings, view.pointer(396));
    fireEvent.pointerMove(view.nav, view.pointer(172));
    expect(view.getByTestId('route')).toHaveTextContent('/settings');
    fireEvent.pointerUp(view.nav, view.pointer(-80));
    expect(view.onSelect).toHaveBeenCalledExactlyOnceWith(0);
    expect(view.getByTestId('route')).toHaveTextContent(/^\/$/);
  });

  it('cancels the pending gesture if holding Settings opens the profile menu', () => {
    const view = setup();
    fireEvent.pointerDown(view.getByRole('link', { name: 'Profile Settings' }), view.pointer(396));
    view.rerender(<MemoryRouter><DragNavigation onSelect={view.onSelect} onStart={view.onStart} profileOpen /></MemoryRouter>);
    fireEvent.pointerUp(view.nav, view.pointer(396));
    expect(view.onSelect).not.toHaveBeenCalled();
  });

  it.each(['pointerCancel', 'lostPointerCapture'] as const)('returns to the current tab on %s without navigating', event => {
    const view = setup(); view.advance();
    const pill = view.container.querySelector('.liquid-nav-paint.selected') as HTMLElement;
    const initial = pill.style.clipPath;
    fireEvent.pointerDown(view.getByRole('link', { name: 'Home' }), view.pointer(60));
    fireEvent.pointerMove(view.nav, view.pointer(396)); view.advance();
    fireEvent[event](view.nav); for (let i = 0; i < 8; i++) view.advance();
    expect(view.onSelect).not.toHaveBeenCalled();
    expect(pill.style.clipPath).toBe(initial);
  });

  it('preserves normal clicks without claiming a drag', () => {
    const view = setup();
    const search = view.getByRole('link', { name: 'Search' });
    fireEvent.pointerDown(search, view.pointer(172));
    fireEvent.pointerUp(search, view.pointer(174));
    fireEvent.click(search);
    expect(view.onStart).not.toHaveBeenCalled();
    expect(view.onSelect).not.toHaveBeenCalled();
    expect(view.getByTestId('route')).toHaveTextContent('/search');
  });

  it('does not claim navigation gestures while the profile menu is open', () => {
    const view = setup({ profileOpen: true });
    fireEvent.pointerDown(view.nav, view.pointer(60));
    fireEvent.pointerMove(view.nav, view.pointer(396));
    fireEvent.pointerUp(view.nav, view.pointer(396));
    expect(view.onStart).not.toHaveBeenCalled();
    expect(view.onSelect).not.toHaveBeenCalled();
  });

  it('coalesces pointer bursts into animation frames and skips visually unchanged scroll updates', () => {
    const view = setup(); view.advance();
    const pill = view.container.querySelector('.liquid-nav-paint.selected') as HTMLElement;
    const writes = vi.spyOn(pill.style, 'clipPath', 'set');
    fireEvent.pointerDown(view.nav, view.pointer(60));
    for (let x = 70; x <= 300; x += 10) fireEvent.pointerMove(view.nav, view.pointer(x));
    const beforeFrame = writes.mock.calls.length;
    view.frame(); view.frame();
    const afterFrame = writes.mock.calls.length;
    const scroller = view.container.querySelector('.main-area') as HTMLElement;
    view.commits.mockClear();
    for (const top of [1, 5, 10, 15, 20, 25, 30]) { scroller.scrollTop = top; fireEvent.scroll(scroller); }
    expect({ beforeFrame, afterFrame, scrollCommits: view.commits.mock.calls.length }).toEqual({ beforeFrame: 0, afterFrame: 2, scrollCommits: 0 });
  });

  it('uses observer geometry during label expansion without forcing layout or rereading styles', () => {
    let notify: ResizeObserverCallback;
    class Observer extends StubObserver {
      constructor(callback: ResizeObserverCallback) { super(callback); notify = callback; }
    }
    const view = setup({ Observer }); view.advance();
    const pill = view.container.querySelector('.liquid-nav-paint.selected') as HTMLElement;
    const initial = pill.style.clipPath;
    const widthRead = vi.fn(() => 456), heightRead = vi.fn(() => 48);
    Object.defineProperties(view.nav, { clientWidth: { get: widthRead }, clientHeight: { get: heightRead } });
    const computed = vi.spyOn(window, 'getComputedStyle');
    for (const width of [320, 384.6, 456]) {
      notify!([{ target: view.nav, contentRect: new DOMRectReadOnly(0, 0, width, 48), borderBoxSize: [], contentBoxSize: [], devicePixelContentBoxSize: [] }], {} as ResizeObserver);
    }
    expect(pill.style.clipPath).toBe(initial);
    expect(widthRead).not.toHaveBeenCalled(); expect(heightRead).not.toHaveBeenCalled(); expect(computed).not.toHaveBeenCalled();
  });

  it('preserves frosted-scroll thresholds when switching from Home to Settings', () => {
    const view = setup(); view.advance();
    const scroller = view.container.querySelector('.main-area') as HTMLElement;
    const scroll = (top: number) => { scroller.scrollTop = top; fireEvent.scroll(scroller); };
    scroll(35); expect(view.nav).not.toHaveClass('frosted');
    scroll(36); expect(view.nav).toHaveClass('frosted');
    scroll(60);
    fireEvent.click(view.getByRole('link', { name: 'Profile Settings' }));
    expect(view.nav).not.toHaveClass('frosted');
    scroll(70); expect(view.nav).not.toHaveClass('frosted');
    scroll(71); expect(view.nav).toHaveClass('frosted');
    scroll(0); expect(view.nav).not.toHaveClass('frosted');
  });
});
