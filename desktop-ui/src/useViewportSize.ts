import { useLayoutEffect, useState } from 'react';
import { subscribeViewportResize } from './viewportResize';

export function useViewportSize(active: boolean) {
  const [viewport, setViewport] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));
  useLayoutEffect(() => {
    if (!active) return;
    const update = () => {
      const width = window.innerWidth, height = window.innerHeight;
      setViewport(previous => previous.width === width && previous.height === height ? previous : { width, height });
    };
    // Catch up before paint when a retained tab becomes visible again.
    update();
    return subscribeViewportResize(update);
  }, [active]);
  return viewport;
}
