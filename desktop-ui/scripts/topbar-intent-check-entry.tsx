import { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { LiquidNavigation, type LiquidNavigationController } from '../src/components/navigation/LiquidNavigation';

let disposeRoot: (() => void) | undefined;
export function dispose() { disposeRoot?.(); disposeRoot = undefined; }

/** Verify browser-driven bubble movement during a blocking destination render. */
export async function runChecks() {
  const host = document.createElement('div');
  document.body.append(host);
  const labels = ['Home', 'Search', 'Library', 'Settings'];
  let inputAt = 0, commitAt = 0, transformAtCommit = '', heavyMs = 0, nativeAtCommit = false;
  function HeavyPage() {
    useState(() => {
      const start = performance.now();
      while (performance.now() - start < 150) { /* simulate a blocking page commit */ }
      heavyMs = performance.now() - start;
      return true;
    });
    return <p>Search screen ready</p>;
  }
  function Fixture() {
    const controller = useRef<LiquidNavigationController>(null);
    const [route, setRoute] = useState(0);
    return <div className="shell topbar-layout"><header className="topbar"><LiquidNavigation controllerRef={controller}
      labels={labels} visuals={labels.map(label => <span key={label}>●</span>)} selectedIndex={route} routeKey={String(route)}
      style="expanded" heroEnabled glowEnabled profileOpen={false} onDragStart={() => {}} onDragSelect={() => {}}>
      {labels.map((label, index) => <button key={label} className="nav-link" onClick={() => {
        inputAt = performance.now();
        controller.current!.select(index, () => {
          commitAt = performance.now();
          const pill = host.querySelector<HTMLElement>('.liquid-nav-native')!;
          nativeAtCommit = host.querySelector('.liquid-nav')?.getAttribute('data-native-selection') === 'true' && pill.getAnimations().some(animation => animation.playState === 'running');
          transformAtCommit = getComputedStyle(pill).transform;
          flushSync(() => setRoute(index));
        });
      }}>{label}</button>)}
    </LiquidNavigation></header><main>{route === 1 ? <HeavyPage /> : <p>Home screen</p>}</main></div>;
  }
  const root = createRoot(host);
  disposeRoot = () => { root.unmount(); host.remove(); };
  flushSync(() => root.render(<Fixture />));
  await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  // Diagnostic color makes compositor filmstrip movement measurable without OCR.
  host.querySelector<HTMLElement>('.liquid-nav-native')!.style.background = 'rgb(50,150,250)';
  host.querySelectorAll<HTMLButtonElement>('.nav-link')[1].click();
  const deadline = performance.now() + 3000;
  while (!host.textContent?.includes('Search screen ready') && performance.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
  if (!commitAt || !nativeAtCommit || heavyMs < 150 || commitAt - inputAt >= 100) throw new Error('Concurrent bubble/navigation regression');
  return { scope: 'real LiquidNavigation in isolated Edge fixture; destination render deliberately blocks 150ms', timeOrigin: performance.timeOrigin, inputAt, commitAt, inputToNavigationMs: Number((commitAt - inputAt).toFixed(1)), animationRunningWhenNavigationBegan: nativeAtCommit, transformAtCommit, blockingRenderMs: Number(heavyMs.toFixed(1)) };
}
