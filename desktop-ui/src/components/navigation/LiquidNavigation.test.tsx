import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { StrictMode } from 'react';
import { LiquidNavigation } from './LiquidNavigation';

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
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
  it('keeps animating selection after StrictMode restarts effects', () => {
    vi.stubGlobal('ResizeObserver', StubObserver);
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
    const frames = new Map<number, FrameRequestCallback>();
    let frameId = 0, time = 0;
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
    advance();
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
