import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export function HorizontalRail({ label, className = 'shelf-track', children }: { label: string; className?: string; children: ReactNode }) {
  const track = useRef<HTMLDivElement>(null);
  const [edges,setEdges] = useState({ start:true,end:true });
  const measure = () => { const element = track.current; if (element) setEdges({ start:element.scrollLeft <= 2,end:element.scrollLeft + element.clientWidth >= element.scrollWidth - 2 }); };
  useEffect(() => { const element = track.current; if (!element) return; const observer = new ResizeObserver(measure); observer.observe(element); for (const child of element.children) observer.observe(child); measure(); return () => observer.disconnect(); }, [children]);
  const page = (direction: number) => { const element = track.current; if (element) element.scrollBy({ left:direction * element.clientWidth * .85,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }); };
  return <div className="horizontal-rail"><div ref={track} className={className} onScroll={measure}>{children}</div><button className="rail-arrow rail-previous" disabled={edges.start} aria-label={`Scroll ${label} left`} onClick={() => page(-1)}><ChevronLeft size={24} /></button><button className="rail-arrow rail-next" disabled={edges.end} aria-label={`Scroll ${label} right`} onClick={() => page(1)}><ChevronRight size={24} /></button></div>;
}
