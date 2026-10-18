import { useLayoutEffect, useRef, type ReactNode } from 'react';

/** Keep the source card's typography and layout, scaling the entire card as
 * Kotlin's drawLiftedPoster does, rather than laying out a second text design. */
export function LiftedCardArtwork({ sourceKey, fallback }: { sourceKey?: string; fallback: ReactNode }) {
  const host = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const container = host.current;
    const source = sourceKey ? document.querySelector<HTMLElement>(`[data-source-key="${CSS.escape(sourceKey)}"]`) : null;
    if (!container || !source || !source.offsetWidth || !source.offsetHeight) return;
    const width = source.offsetWidth;
    const height = source.offsetHeight;
    const clone = source.cloneNode(true) as HTMLElement;
    const originals = [source, ...source.querySelectorAll<HTMLElement>('*')];
    const copies = [clone, ...clone.querySelectorAll<HTMLElement>('*')];
    // Freeze only this small card once. No style reads or React updates while
    // the spring plays; ancestor selectors and page zoom cannot relayout it.
    originals.forEach((element, index) => {
      const copy = copies[index];
      const computed = getComputedStyle(element);
      for (const property of Array.from(computed)) copy.style.setProperty(property, computed.getPropertyValue(property));
      copy.removeAttribute('data-source-key');
      copy.removeAttribute('id');
      copy.style.visibility = 'visible';
      copy.style.animation = 'none';
      copy.style.transition = 'none';
    });
    Object.assign(clone.style, { position: 'absolute', left: '0', top: '0', margin: '0', width: `${width}px`, height: `${height}px`, zoom: '1', transformOrigin: 'top left', pointerEvents: 'none' });
    clone.inert = true;
    const resize = () => { clone.style.transform = `scale(${container.clientWidth / width}, ${container.clientHeight / height})`; };
    const fallbackNode = container.firstElementChild as HTMLElement | null;
    if (fallbackNode) fallbackNode.hidden = true;
    container.appendChild(clone);
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    return () => { observer.disconnect(); clone.remove(); if (fallbackNode) fallbackNode.hidden = false; };
  }, [sourceKey]);
  return <div ref={host} className="lifted-card-artwork" aria-hidden="true"><div>{fallback}</div></div>;
}
