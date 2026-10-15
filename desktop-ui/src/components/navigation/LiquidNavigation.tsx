import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { JellyMotion, desktopNavigationLabels, jellyPillBounds, jellyPillPath } from './jellyMotion';
import './liquidNavigation.css';

type Props = { children: ReactNode; visuals: ReactNode[]; labels: string[]; selectedIndex: number; style: string; heroEnabled: boolean; profileOpen: boolean; glowEnabled: boolean; routeKey: string; onDragSelect: (index: number) => void; onDragStart: () => void };
export function LiquidNavigation({ children, visuals, labels, selectedIndex, style, heroEnabled, profileOpen, glowEnabled, routeKey, onDragSelect, onDragStart }: Props) {
  const nav = useRef<HTMLElement>(null);
  const track = useRef<HTMLDivElement>(null), distortion = useRef<HTMLDivElement>(null), panel = useRef<HTMLDivElement>(null);
  const inactive = useRef<HTMLDivElement>(null), active = useRef<HTMLDivElement>(null);
  const motion = useRef(new JellyMotion(selectedIndex, labels.length));
  const raf = useRef<number | null>(null), lastFrame = useRef<number | null>(null);
  const selected = useRef(selectedIndex);
  const geometry = useRef({ width: 0, height: 0, density: 1 });
  const [hovered, setHovered] = useState(false), [focused, setFocused] = useState(false), [scrollOffset, setScrollOffset] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  const down = useRef<{ pointerId: number; x: number; y: number; claimed: boolean } | null>(null);
  const suppressClick = useRef(false), suppressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrolled = scrollOffset > (selectedIndex === labels.length - 1 ? 70 : 35);
  const expanded = desktopNavigationLabels(style, selectedIndex === 0, heroEnabled, hovered || focused, profileOpen, scrolled);
  const frosted = hovered || focused || profileOpen || ((selectedIndex === 0 || selectedIndex === labels.length - 1) && scrolled);
  const paint = useCallback(() => {
    const element = nav.current;
    if (!element) return;
    const { width, height, density } = geometry.current;
    const frame = motion.current.frame;
    if (track.current) track.current.style.transform = 'scale(' + frame.trackScale + ')';
    if (distortion.current) {
      distortion.current.style.transformOrigin = frame.originX * density + 'px 50%';
      distortion.current.style.transform = 'translateY(' + frame.trackOffsetY * density + 'px) scaleX(' + frame.trackScaleX + ')';
    }
    if (panel.current) {
      panel.current.style.transform = 'translateX(' + frame.panelOffset * density + 'px)';
      panel.current.style.setProperty('--nav-glow-x', frame.originX * density + 'px');
      panel.current.style.setProperty('--nav-glow-y', frame.glowY * density + 'px');
      panel.current.style.setProperty('--nav-glow-opacity', String(frame.glowOpacity));
    }
    const bounds = jellyPillBounds(frame, width / density, height / density, labels.length);
    const path = jellyPillPath({ x: bounds.x * density, y: bounds.y * density, width: bounds.width * density, height: bounds.height * density, rx: bounds.rx * density, ry: bounds.ry * density });
    if (active.current) {
      active.current.style.clipPath = 'path("' + path + '")';
      active.current.style.visibility = selected.current >= 0 ? 'visible' : 'hidden';
      active.current.style.setProperty('--nav-content-scale', String(frame.contentScale));
    }
    if (inactive.current) inactive.current.style.clipPath = selected.current >= 0 ? 'path(evenodd, "M -48 -16 H ' + (width + 48) + ' V ' + (height + 16) + ' H -48 Z ' + path + '")' : 'none';
    // The Settings avatar is painted once by the interactive target, like ProfileSwitcherTab.
    const coverage = Math.max(0, 1 - Math.abs(frame.position - (labels.length - 1)));
    element.style.setProperty('--nav-profile-scale', String(1 + (frame.contentScale - 1) * coverage));
  }, [labels.length]);
  const start = useCallback(() => {
    if (raf.current !== null) return;
    lastFrame.current = null;
    const tick = (now: number) => {
      raf.current = null;
      if (lastFrame.current !== null) motion.current.advance((now - lastFrame.current) / 1000);
      lastFrame.current = now; paint();
      if (motion.current.running) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  }, [paint]);
  useLayoutEffect(() => {
    selected.current = selectedIndex;
    if (reducedMotion) { motion.current.settle(selectedIndex); paint(); } else { motion.current.select(selectedIndex); start(); }
    return () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
      // A cancelled frame must not prevent the next effect from starting one.
      raf.current = null;
      lastFrame.current = null;
    };
  }, [selectedIndex, reducedMotion, paint, start]);
  useLayoutEffect(() => {
    const element = nav.current;
    if (!element) return;
    const measure = () => {
      const density = Number(getComputedStyle(element).getPropertyValue('--ui-scale')) || 1;
      const viewportWidth = window.innerWidth / density;
      const iconSize = viewportWidth < 800 ? 26 : viewportWidth > 1600 ? 30 : 28;
      element.style.setProperty('--nav-icon-size', iconSize * density + 'px');
      const width = element.clientWidth, height = element.clientHeight;
      geometry.current = { width, height, density };
      motion.current.resize(width / density, height / density, labels.length);
      paint();
    };
    const observer = new ResizeObserver(measure); observer.observe(element); measure();
    window.addEventListener('resize', measure);
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); };
  }, [paint, labels.length]);
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!media) return;
    const update = () => setReducedMotion(media.matches);
    media.addEventListener('change', update); return () => media.removeEventListener('change', update);
  }, []);
  useLayoutEffect(() => {
    const shell = nav.current?.closest('.shell');
    const readOffset = () => {
      const main = shell?.querySelector<HTMLElement>('.settings-pane, .main-area');
      const settings = shell?.querySelector<HTMLElement>('.settings-pane');
      setScrollOffset((settings ?? main)?.scrollTop ?? 0);
    };
    readOffset(); const first = requestAnimationFrame(readOffset);
    const onScroll = (event: Event) => {
      if (event.target instanceof HTMLElement && (event.target.matches('.main-area') || event.target.matches('.settings-pane'))) setScrollOffset(event.target.scrollTop);
    };
    shell?.addEventListener('scroll', onScroll, true);
    return () => { cancelAnimationFrame(first); shell?.removeEventListener('scroll', onScroll, true); };
  }, [routeKey]);
  useEffect(() => {
    if (profileOpen && motion.current.dragging) { motion.current.cancel(selectedIndex); down.current = null; if (reducedMotion) motion.current.settle(selectedIndex); paint(); if (!reducedMotion) start(); }
  }, [profileOpen, selectedIndex, paint, start, reducedMotion]);
  useEffect(() => () => { if (suppressTimer.current) clearTimeout(suppressTimer.current); }, []);
  function cancel() { down.current = null; motion.current.cancel(selectedIndex); if (reducedMotion) motion.current.settle(selectedIndex); paint(); if (!reducedMotion) start(); }
  function renderVisuals() { return labels.map((label, index) => <div className="liquid-nav-item" key={label}><div className="liquid-nav-content"><span className="liquid-nav-icon">{visuals[index]}</span><span className="liquid-nav-label"><span>{label}</span></span></div></div>); }
  return <nav ref={nav} aria-label="Main navigation" className={'floating-nav liquid-nav' + (frosted ? ' frosted' : '') + (glowEnabled ? ' glow-enabled' : '')} style={{ '--nav-label-fraction': expanded ? 1 : 0, '--nav-count': labels.length, '--nav-glow-strength': glowEnabled ? 1 : 0 } as CSSProperties} data-expanded={expanded} data-reduced-motion={reducedMotion}
    onPointerEnter={event => { if (event.pointerType !== 'touch') setHovered(true); }} onPointerLeave={() => { setHovered(false); if (down.current && !down.current.claimed) cancel(); }}
    onFocusCapture={() => setFocused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false); }}
    onPointerDown={event => {
      if (event.button !== 0 || profileOpen || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      if (down.current) { cancel(); return; }
      suppressClick.current = false;
      const box = event.currentTarget.getBoundingClientRect();
      const density = Number(getComputedStyle(event.currentTarget).getPropertyValue('--ui-scale')) || 1;
      down.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, claimed: false };
      motion.current.begin((event.clientX - box.left) / density, (event.clientY - box.top) / density);
      if (!reducedMotion) start();
    }}
    onPointerMove={event => {
      const gesture = down.current;
      if (!gesture || gesture.pointerId !== event.pointerId || profileOpen) return;
      const density = Number(getComputedStyle(event.currentTarget).getPropertyValue('--ui-scale')) || 1;
      const dx = (event.clientX - gesture.x) / density, dy = (event.clientY - gesture.y) / density;
      if (!gesture.claimed && Math.max(Math.abs(dx), Math.abs(dy)) > 8) { gesture.claimed = true; onDragStart(); event.currentTarget.setPointerCapture(event.pointerId); }
      motion.current.drag(dx, dy); if (gesture.claimed) event.preventDefault(); if (!reducedMotion) { paint(); start(); }
    }}
    onPointerUp={event => {
      const gesture = down.current;
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      down.current = null;
      const index = motion.current.finish();
      if (gesture.claimed) {
        suppressClick.current = true; onDragSelect(index);
        if (suppressTimer.current) clearTimeout(suppressTimer.current);
        suppressTimer.current = setTimeout(() => { suppressClick.current = false; }, 0);
      }
      if (reducedMotion) motion.current.settle(gesture.claimed ? index : selectedIndex); else start();
      paint();
    }}
    onPointerCancel={cancel} onLostPointerCapture={() => { if (down.current) cancel(); }}
    onClickCapture={event => { if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); } }}>
    <div ref={track} className="liquid-nav-track"><div ref={distortion} className="liquid-nav-distortion"><div ref={panel} className="liquid-nav-panel">
      <div className="liquid-nav-surface" aria-hidden="true"><div className="liquid-nav-glow" /></div>
      <div ref={inactive} className="liquid-nav-paint inactive" aria-hidden="true"><div className="liquid-nav-row">{renderVisuals()}</div></div>
      <div ref={active} className="liquid-nav-paint selected" aria-hidden="true"><div className="liquid-nav-glow" /><div className="liquid-nav-row">{renderVisuals()}</div></div>
      <div className="liquid-nav-targets">{children}</div>
    </div></div></div>
  </nav>;
}
