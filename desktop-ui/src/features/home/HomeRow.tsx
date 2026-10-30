import { memo, use, useEffect, useRef, useState, type ReactNode } from 'react';
import { TabActivity } from '../../navigation/tabActivity';
import './homeRow.css';

/** Mount near the scroller, then retain state while Chromium skips far-away layout. */
export const HomeRow = memo(function HomeRow({ children, estimatedHeight }: { children: ReactNode; estimatedHeight: number }) {
  const element = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(() => typeof IntersectionObserver === 'undefined');
  // Completed rows do not subscribe their content to tab visibility changes.
  const active = !mounted ? use(TabActivity) : true;
  useEffect(() => {
    if (mounted || !active || !element.current) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setMounted(true); observer.disconnect(); }
    }, { root: element.current.closest('.main-area'), rootMargin: '600px 0px' });
    observer.observe(element.current);
    return () => observer.disconnect();
  }, [mounted, active]);
  return <div ref={element} className="home-row" data-home-row="" aria-busy={!mounted || undefined}
    style={{ containIntrinsicBlockSize: `auto ${estimatedHeight}px` }}>
    {mounted ? children : <div aria-hidden="true" style={{ height: estimatedHeight }} />}
  </div>;
});
