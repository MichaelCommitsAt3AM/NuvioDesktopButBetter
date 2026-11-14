import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Eye, EyeOff, Volume2, VolumeX } from 'lucide-react';
import { useTrailerImmersion, type TrailerUiState } from './useTrailerImmersion';
import { call } from '../../bridge';
import { HoverTrailer, type TrailerSource } from '../../components/HoverTrailer';
import { mainScroller } from '../../navigation/scrollStore';

const MUTE_KEY = 'nuvio.details.trailerMuted';
// Resolved YouTube URLs expire after a few hours; this only needs to survive
// leaving to the streams page and coming straight back.
const CACHE_TTL_MS = 20 * 60_000;
// The trailer pauses once the season picker (or, for titles without one, the
// first section below the hero) has scrolled up to this share of the viewport.
export const PAUSE_VIEWPORT_FRACTION = 0.6;
// Slightly longer than the layer's 600ms opacity transition, so it unmounts only once invisible.
const END_FADE_MS = 700;

const resolved = new Map<string, { at: number; source: TrailerSource }>();
const inflight = new Map<string, Promise<TrailerSource | null>>();

/**
 * Starts resolving the hero trailer. Safe to call repeatedly: concurrent calls
 * share one request and a recent success is reused. Failures resolve to null
 * (the artwork simply stays) and are not cached.
 */
export function prefetchHeroTrailer(type: string, id: string): Promise<TrailerSource | null> {
  const key = `${type}:${id}`;
  const hit = resolved.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return Promise.resolve(hit.source);
  const pending = inflight.get(key);
  if (pending) return pending;
  const request = call<TrailerSource>('trailers.resolveHover', { type, id })
    .then((result) => {
      if (!result?.videoUrl) return null;
      const source = { videoUrl: result.videoUrl, audioUrl: result.audioUrl ?? null };
      resolved.set(key, { at: Date.now(), source });
      return source;
    })
    .catch(() => null)
    .finally(() => { inflight.delete(key); });
  inflight.set(key, request);
  return request;
}

function appIsFocused(): boolean {
  try { return document.hasFocus() && document.visibilityState !== 'hidden'; } catch { return true; }
}

function readMuted(): boolean {
  try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; }
}

/** True when the page has scrolled far enough that the trailer should hold. */
export function shouldPauseHeroTrailer(anchorTop: number | null, scrollTop: number, viewportHeight: number): boolean {
  if (anchorTop !== null) return anchorTop < viewportHeight * PAUSE_VIEWPORT_FRACTION;
  return scrollTop > viewportHeight * (1 - PAUSE_VIEWPORT_FRACTION);
}

function pauseAnchor(): Element | null {
  return document.querySelector('.series-season-selector')
    ?? document.querySelector('.series-episodes')
    ?? document.querySelector('.detail-hero')?.nextElementSibling
    ?? null;
}

/**
 * Netflix-style trailer behind the details artwork. Resolution starts as soon
 * as the page mounts; playback begins the moment the video can play (the
 * resolve time is the "delay"), fading in over the backdrop. Any failure or
 * the trailer ending leaves the artwork untouched.
 */
export function DetailsHeroTrailer({ type, id, enabled, visible = true, onUiState }: {
  type: string;
  id: string;
  enabled: boolean;
  visible?: boolean;
  /** Reports how much of the page UI should show over the playing trailer. */
  onUiState?: (state: TrailerUiState) => void;
}) {
  const [source, setSource] = useState<TrailerSource | null>(null);
  const [done, setDone] = useState(false);
  const [ready, setReady] = useState(false);
  // The trailer finished (or failed): fade back to the artwork, then unmount.
  const [ending, setEnding] = useState(false);
  // Scrolled past the pause line: also fades back to the artwork.
  const [paused, setPaused] = useState(false);
  // Window deactivated or minimized: freeze in place, resume on return.
  const [focused, setFocused] = useState(appIsFocused);
  const [muted, setMuted] = useState(readMuted);

  useEffect(() => {
    const sync = () => setFocused(appIsFocused());
    window.addEventListener('focus', sync);
    window.addEventListener('blur', sync);
    document.addEventListener('visibilitychange', sync);
    sync();
    return () => {
      window.removeEventListener('focus', sync);
      window.removeEventListener('blur', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, []);

  useEffect(() => {
    setSource(null);
    setDone(false);
    setReady(false);
    setEnding(false);
    if (!enabled) return;
    let active = true;
    void prefetchHeroTrailer(type, id).then((next) => {
      if (!active) return;
      if (next) setSource(next); else setDone(true);
    });
    return () => { active = false; };
  }, [type, id, enabled]);

  const playing = enabled && visible && !!source && !done;
  useEffect(() => {
    if (!playing) return;
    const scroller = mainScroller();
    if (!scroller) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const anchor = pauseAnchor();
      setPaused(shouldPauseHeroTrailer(anchor ? anchor.getBoundingClientRect().top : null, scroller.scrollTop, window.innerHeight));
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    scroller.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    update();
    return () => {
      scroller.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [playing, ready, type, id]);

  const toggleMuted = () => {
    setMuted((current) => {
      const next = !current;
      try { localStorage.setItem(MUTE_KEY, next ? '1' : '0'); } catch { /* Mute still works for this visit. */ }
      return next;
    });
  };

  // The text fades only while the trailer is genuinely on screen and moving.
  const immersion = useTrailerImmersion(playing && ready && !paused && focused && !ending);
  useEffect(() => {
    if (!ending) return;
    const timer = window.setTimeout(() => setDone(true), END_FADE_MS);
    return () => window.clearTimeout(timer);
  }, [ending]);
  const onUiStateRef = useRef(onUiState);
  onUiStateRef.current = onUiState;
  useEffect(() => { onUiStateRef.current?.(immersion.state); }, [immersion.state]);
  useEffect(() => () => onUiStateRef.current?.('shown'), []);

  if (!playing || !source) return null;
  return createPortal(<>
    <div className={`detail-hero-trailer${ready ? ' is-ready' : ''}${paused || ending ? ' is-paused' : ''}${immersion.state !== 'shown' ? ' is-immersive' : ''}`} aria-hidden="true">
      <HoverTrailer
        ownerId={`details-hero:${type}:${id}`}
        type={type}
        id={id}
        prefetched={source}
        soundEnabled={!muted}
        startSeconds={0}
        paused={paused || !focused}
        holdWhenHidden
        onReady={() => setReady(true)}
        onDone={() => setEnding(true)}
      />
    </div>
    {ready && !paused && !ending && <>
      <button type="button" className="detail-trailer-mute" aria-label={muted ? 'Unmute trailer' : 'Mute trailer'} aria-pressed={muted} title={muted ? 'Unmute trailer' : 'Mute trailer'} onClick={toggleMuted}>
        {muted ? <VolumeX size={22} /> : <Volume2 size={22} />}
      </button>
      <button type="button" className="detail-trailer-ui-toggle" aria-label={immersion.hidden ? 'Show interface' : 'Hide interface'} aria-pressed={immersion.hidden} title={immersion.hidden ? 'Show interface' : 'Hide interface'} onClick={immersion.toggleHidden}>
        {immersion.hidden ? <Eye size={22} /> : <EyeOff size={22} />}
      </button>
    </>}
  </>, document.body);
}
