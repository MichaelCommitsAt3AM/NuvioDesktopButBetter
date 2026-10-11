import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { actions, useAppState } from '../../bridge';
import './profileChooser.css';

// NuvioLoadingIndicator.kt: invert its cubic Bezier easing, then use the same
// growing/shrinking arc and 363-degree rotation over a two-second cycle.
function loadingEase(value: number) {
  const x = Math.max(0, Math.min(1, value));
  let low = 0, high = 1;
  for (let i = 0; i < 12; i++) {
    const t = (low + high) / 2;
    const position = 3 * (1-t)**2 * t * .333 + 3 * (1-t) * t*t * .667 + t**3;
    if (position < x) low = t; else high = t;
  }
  const t = (low + high) / 2;
  return 3 * (1-t) * t*t + t**3;
}

function LoadingArc() {
  const path = useRef<SVGPathElement>(null);
  useEffect(() => {
    let frameId = 0;
    const startTime = performance.now();
    function draw(now: number) {
      const frame = ((now-startTime) % 2000) / 2000 * 60;
      const start = 99 * loadingEase((frame-10)/50);
      const end = 1 + 99 * loadingEase(frame/50);
      const angle = -90 + frame/60*363 + start*3.6;
      const sweep = Math.max(.01, (end-start)*3.6);
      const point = (degrees: number) => {
        const radians = degrees*Math.PI/180;
        return `${175+112.5*Math.cos(radians)} ${175+112.5*Math.sin(radians)}`;
      };
      path.current?.setAttribute('d', `M ${point(angle)} A 112.5 112.5 0 ${sweep>180?1:0} 1 ${point(angle+sweep)}`);
      frameId = requestAnimationFrame(draw);
    }
    frameId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frameId);
  }, []);
  return <svg className="profile-loading-spinner" viewBox="0 0 350 350" aria-hidden="true"><path ref={path} fill="none" stroke="currentColor" strokeWidth="37.5" strokeLinecap="round" /></svg>;
}

export function ProfileLoadingScreen() {
  const state = useAppState();
  const transition = state.profileTransition;
  const [leaving, setLeaving] = useState(false);
  const ready = transition?.ready && (!state.home.loading || state.status === 'disconnected');
  useEffect(() => {
    if (!ready) return;
    setLeaving(true);
    const timer = setTimeout(() => actions.finishProfileTransition(), 400);
    return () => clearTimeout(timer);
  }, [ready]);
  if (!transition) return null;
  const style = {
    '--profile-color': transition.profile.color,
    ...(transition.backgroundUrl ? { backgroundImage: `linear-gradient(#00000047,#00000047),url("${transition.backgroundUrl}")` } : {}),
  } as CSSProperties;
  return <div className={`profile-picker profile-loading-screen ${leaving?'leaving':''}`} style={style} role="status" aria-label="Loading profile" aria-live="polite">
    <div className="profile-loading-content"><img src="/images/nuvio-wordmark.png" alt="Nuvio" /><LoadingArc /></div>
  </div>;
}
