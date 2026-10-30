import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useEffect } from 'react';
import { HomeRow } from './HomeRow';
import { HorizontalRail } from '../../components/HorizontalRail';
import { TabActivity } from '../../navigation/tabActivity';

const observers: { callback: IntersectionObserverCallback; disconnect: ReturnType<typeof vi.fn>; target?: Element }[] = [];
beforeEach(() => {
  observers.length = 0;
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('IntersectionObserver', class {
    callback: IntersectionObserverCallback; disconnect = vi.fn(); target?: Element;
    constructor(callback: IntersectionObserverCallback) { this.callback = callback; observers.push(this); }
    observe(target: Element) { this.target = target; }
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const intersect = (index: number, isIntersecting: boolean) => act(() => observers[index].callback([{ isIntersecting } as IntersectionObserverEntry], {} as IntersectionObserver));

it('mounts only nearby rows and retains their content when they leave the viewport', () => {
  const mounts = vi.fn(), unmounts = vi.fn();
  function Content() { useEffect(() => { mounts(); return () => unmounts(); }, []); return <button>Card</button>; }
  const page = (active: boolean) => <TabActivity value={active}>{[0, 1, 2].map(key => <HomeRow key={key} estimatedHeight={430}><Content /></HomeRow>)}</TabActivity>;
  const view = render(page(true));
  expect(mounts).not.toHaveBeenCalled();
  expect(view.container.querySelector('.home-row')).toHaveStyle({ containIntrinsicBlockSize: 'auto 430px' });
  intersect(0, true); expect(mounts).toHaveBeenCalledTimes(1);
  view.rerender(page(false)); view.rerender(page(true));
  expect(mounts).toHaveBeenCalledTimes(1); expect(unmounts).not.toHaveBeenCalled();
  expect(view.getAllByText('Card')).toHaveLength(1);
});
it('does not start row mounting while the retained tab is hidden', () => {
  const view = render(<TabActivity value={false}><HomeRow estimatedHeight={430}><button>Card</button></HomeRow></TabActivity>);
  expect(observers).toHaveLength(0); expect(view.queryByText('Card')).toBeNull();
});
it('avoids offscreen rail layout reads and measures when the row approaches', () => {
  const view = render(<div className="home-row"><HorizontalRail label="Movies"><button>Card</button></HorizontalRail></div>);
  const track = view.container.querySelector('.shelf-track')!;
  const read = vi.fn(() => 1000);
  Object.defineProperty(track, 'scrollWidth', { get: read });
  intersect(0, false); expect(read).not.toHaveBeenCalled();
  intersect(0, true); expect(read).toHaveBeenCalledOnce();
  expect(view.getByRole('button', { name: 'Scroll Movies right' })).toBeEnabled();
});
