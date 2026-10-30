import { useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { createPausedStore, type SnapshotStore } from '../src/navigation/pausedStore';
import { shareSnapshot } from '../src/snapshotSharing';
import { usePlacementFlip } from '../src/components/placementFlip';

type Data = { tick: number; items: { id: string; title: string }[] };
const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

/** Synthetic browser check using production helpers; no account, bridge or network access. */
export async function runChecks() {
  let reads = 0;
  const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetTop')!;
  Object.defineProperty(HTMLElement.prototype, 'offsetTop', { ...descriptor, get() { reads++; return descriptor.get!.call(this); } });
  const results: Record<string, unknown> = {};
  try {
    for (const optimized of [false, true]) {
      let data: Data = { tick: 0, items: Array.from({ length: 500 }, (_, index) => ({ id: String(index), title: `Title ${index}` })) };
      const listeners = new Set<() => void>();
      const source: SnapshotStore<Data> = {
        getSnapshot: () => data,
        subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
      };
      const paused = createPausedStore(source);
      const store = optimized ? paused : source;
      let renders = 0;
      let active = true;
      function List() {
        const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
        const ref = useRef<HTMLDivElement>(null);
        renders++;
        usePlacementFlip(ref, false, optimized ? snapshot.items.map(item => item.id).join(',') : String(renders), optimized ? active : true);
        return <div ref={ref} style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 12 }}>
          {snapshot.items.map(item => <article key={item.id} data-flip-key={item.id} style={{ height: 150, background: '#333', color: '#fff' }}>{item.title}</article>)}
        </div>;
      }
      function Pane() {
        useLayoutEffect(() => { if (optimized) paused.setActive(active); return () => paused.setActive(false); }, [active]);
        return <div style={{ display: active ? 'block' : 'none' }}><List /></div>;
      }
      const host = document.createElement('div');
      document.body.append(host);
      const root = createRoot(host);
      flushSync(() => root.render(<Pane />));
      await frame();
      const update = (next: Data) => {
        const previous = data;
        data = optimized ? shareSnapshot(data, next) : next;
        if (data !== previous) flushSync(() => listeners.forEach(listener => listener()));
      };
      const measure = async (name: string, work: () => void) => {
        reads = 0; renders = 0;
        const start = performance.now();
        work();
        const cpuMs = performance.now() - start;
        await frame();
        return { name, renders, layoutReads: reads, cpuMs: Number(cpuMs.toFixed(2)) };
      };
      const equalRefresh = await measure('six identical snapshots', () => {
        for (let index = 0; index < 6; index++) update(JSON.parse(JSON.stringify(data)));
      });
      const unrelatedUpdate = await measure('six non-layout updates', () => {
        for (let index = 0; index < 6; index++) update({ ...data, tick: data.tick + 1 });
      });
      active = false;
      flushSync(() => root.render(<Pane />));
      await frame();
      const hiddenUpdates = await measure('six hidden snapshot changes', () => {
        for (let index = 0; index < 6; index++) update({ ...data, items: data.items.map(item => ({ ...item, title: `${item.title}.` })) });
      });
      active = true;
      flushSync(() => root.render(<Pane />));
      await frame();
      if (!host.textContent?.includes('Title 0......')) throw new Error('Activation did not catch up to the latest hidden snapshot');
      if (optimized && (equalRefresh.renders || hiddenUpdates.renders || unrelatedUpdate.layoutReads)) throw new Error('Navigation work regression');
      results[optimized ? 'optimized' : 'baseline'] = { equalRefresh, unrelatedUpdate, hiddenUpdates };
      root.unmount(); host.remove();
    }
  } finally { Object.defineProperty(HTMLElement.prototype, 'offsetTop', descriptor); }
  return { scope: '500-card synthetic fixture using production helpers; timings are not native Tauri acceptance', results };
}
