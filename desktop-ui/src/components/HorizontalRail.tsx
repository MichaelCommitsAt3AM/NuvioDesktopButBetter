import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export function HorizontalRail({ label, className = 'shelf-track', children, trackRef }: { label: string; className?: string; children: ReactNode; trackRef?: React.RefObject<HTMLDivElement | null> }) {
  const track = useRef<HTMLDivElement>(null);
  const resolved = trackRef ?? track;
  const [edges,setEdges] = useState({ start:true,end:true });
  const measure = () => { const element = resolved.current; if (element) { const start=element.scrollLeft<=2,end=element.scrollLeft+element.clientWidth>=element.scrollWidth-2;setEdges(previous=>previous.start===start&&previous.end===end?previous:{start,end}); } };
  useEffect(() => { const element = resolved.current; if (!element) return; const observer = new ResizeObserver(measure); observer.observe(element); measure(); return () => observer.disconnect(); }, [children]);
  const page = (direction: number) => { const element = resolved.current; if (element) element.scrollBy({ left:direction * element.clientWidth * .85,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }); };
  const handleArrowClick = (direction: number) => (event: React.MouseEvent<HTMLButtonElement>) => {
    page(direction);
    // Pointer clicks leave focus behind, which keeps Home's :focus-within arrows visible
    // after the pointer leaves the rail. Keep focus for keyboard activation.
    if (event.detail > 0) event.currentTarget.blur();
  };
  return <div className="horizontal-rail"><div ref={resolved} className={className} onScroll={measure}>{children}</div><button className="rail-arrow rail-previous" disabled={edges.start} aria-label={`Scroll ${label} left`} onClick={handleArrowClick(-1)}><ChevronLeft size={24} /></button><button className="rail-arrow rail-next" disabled={edges.end} aria-label={`Scroll ${label} right`} onClick={handleArrowClick(1)}><ChevronRight size={24} /></button></div>;
}
