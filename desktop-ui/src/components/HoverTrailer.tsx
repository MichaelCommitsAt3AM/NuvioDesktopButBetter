import { useEffect, useRef, useState } from 'react';
import { call } from '../bridge';

/** How long the sound takes to ease from silence to full volume each time playback starts. */
export const VOLUME_FADE_IN_MS = 900;

export type TrailerSource = { videoUrl: string; audioUrl?: string | null };

// Single-owner policy: only one preview trailer plays at a time. A newly
// opened preview takes ownership; the previous owner stops and falls back to
// artwork. Foreground player playback takes precedence structurally (preview
// hosts unmount when playback starts).
let owner: string | null = null;

export function takeTrailerOwner(id: string): void {
  owner = id;
  window.dispatchEvent(new CustomEvent('nuvio:trailer-owner', { detail: id }));
}

export function releaseTrailerOwner(id: string): void {
  if (owner === id) owner = null;
}

/**
 * In-app preview trailer fed by the backend's supported extraction path
 * (`trailers.resolveHover`, same selection/resolution as Kotlin hover
 * previews). Autoplay starts muted; sound enables only through the saved
 * preference once playback is permitted, otherwise it stays muted rather
 * than fighting the webview's autoplay policy. Any error, ending, owner
 * loss, hidden window, or unmount tears the player down and reports
 * completion so the caller restores the artwork fallback.
 */
export function HoverTrailer({ ownerId, type, id, soundEnabled, startSeconds, onReady, onDone, prefetched, paused = false, holdWhenHidden = false }: {
  ownerId: string;
  type: string;
  id: string;
  soundEnabled: boolean;
  startSeconds: number;
  onReady: () => void;
  onDone: () => void;
  /** Already-resolved source (e.g. prefetched by the details hero); skips the bridge call. */
  prefetched?: TrailerSource;
  /** Holds playback (e.g. the hero scrolled out of view) without tearing the player down. */
  paused?: boolean;
  /** When the window is hidden, only pause (the owner resumes it via `paused`) instead of ending playback. */
  holdWhenHidden?: boolean;
}) {
  const [source, setSource] = useState<TrailerSource | null>(null);
  const [ready, setReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const readyRef = useRef(onReady);
  readyRef.current = onReady;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const holdRef = useRef(holdWhenHidden);
  holdRef.current = holdWhenHidden;
  const soundRef = useRef(soundEnabled);
  soundRef.current = soundEnabled;
  // Sound eases in whenever playback (re)starts, so a loud first frame is not abrupt.
  // Both elements are driven together: the video's volume is only a control value
  // while a separate audio track plays.
  const rampRef = useRef(0);
  const rampVolume = () => {
    cancelAnimationFrame(rampRef.current);
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!video) return;
    const started = performance.now();
    const apply = (level: number) => { video.volume = level; if (audio) audio.volume = level; };
    apply(0);
    const step = (now: number) => {
      const progress = Math.min(1, Math.max(0, (now - started) / VOLUME_FADE_IN_MS));
      apply(progress * progress);
      if (progress < 1) rampRef.current = requestAnimationFrame(step);
    };
    rampRef.current = requestAnimationFrame(step);
  };
  useEffect(() => () => cancelAnimationFrame(rampRef.current), []);

  useEffect(() => {
    let active = true;
    takeTrailerOwner(ownerId);
    setSource(null);
    setReady(false);
    if (prefetched) setSource(prefetched);
    else void call<TrailerSource>('trailers.resolveHover', { type, id })
      .then((result) => {
        if (!active || owner !== ownerId) return;
        if (result?.videoUrl) setSource({ videoUrl: result.videoUrl, audioUrl: result.audioUrl ?? null });
        else doneRef.current();
      })
      .catch(() => { if (active) doneRef.current(); });
    const takeover = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== ownerId) {
        videoRef.current?.pause();
        audioRef.current?.pause();
        doneRef.current();
      }
    };
    const hidden = () => {
      if (document.visibilityState === 'hidden') {
        videoRef.current?.pause();
        audioRef.current?.pause();
        if (!holdRef.current) doneRef.current();
      }
    };
    window.addEventListener('nuvio:trailer-owner', takeover);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      active = false;
      window.removeEventListener('nuvio:trailer-owner', takeover);
      document.removeEventListener('visibilitychange', hidden);
      videoRef.current?.pause();
      audioRef.current?.pause();
      releaseTrailerOwner(ownerId);
    };
  }, [ownerId, type, id, prefetched]);

  useEffect(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!video || !source) return;
    let cancelled = false;
    const start = async () => {
      try {
        video.muted = true;
        if (pausedRef.current) return;
        await video.play();
        if (cancelled || owner !== ownerId) return;
        if (!soundEnabled && audio) { audio.muted = true; audio.pause(); }
        if (soundEnabled) {
          try {
            if (audio) {
              audio.currentTime = video.currentTime;
              rampVolume();
              audio.muted = false;
              await audio.play();
            } else {
              rampVolume();
              video.muted = false;
              await video.play();
            }
          } catch {
            // Autoplay policy refused sound; stay muted rather than failing.
            if (!cancelled) { video.muted = true; if (audio) { audio.muted = true; audio.pause(); } }
          }
        }
      } catch {
        if (!cancelled) doneRef.current();
      }
    };
    void start();
    return () => { cancelled = true; video.pause(); audio?.pause(); };
  }, [source, soundEnabled]);

  // Scroll/visibility hold: pause in place, resume where playback left off.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !source) return;
    if (paused) { video.pause(); audioRef.current?.pause(); }
    else if (video.paused && !video.ended && video.readyState >= 2) {
      if (soundRef.current && !audioRef.current) { rampVolume(); video.muted = false; }
      void video.play().catch(() => { video.muted = true; void video.play().catch(() => {}); });
    }
  }, [paused, source]);

  if (!source) return null;
  const alignAudio = (resume: boolean) => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!video || !audio || owner !== ownerId) return;
    if (Math.abs(audio.currentTime - video.currentTime) > 0.25) audio.currentTime = video.currentTime;
    audio.volume = video.volume;
    // `video.paused` flips to false the moment play() is called, while the video
    // may still be buffering. Starting the audio then plays sound with no picture
    // and the later resync replays its first moments. Wait for real playback.
    const videoRunning = !video.paused && !video.seeking && video.readyState >= 3;
    if (resume && soundEnabled && videoRunning && audio.paused) {
      audio.muted = false;
      void audio.play()?.catch(() => { audio.muted = true; audio.pause(); });
    }
  };
  return <><video
    ref={videoRef}
    className={`hover-trailer${ready ? ' is-ready' : ''}`}
    src={source.videoUrl}
    muted
    playsInline
    disablePictureInPicture
    onLoadedMetadata={(event) => {
      if (startSeconds > 0 && Number.isFinite(startSeconds)) {
        try { event.currentTarget.currentTime = Math.min(startSeconds, (event.currentTarget.duration || startSeconds + 1) - 0.5); } catch { /* ignore */ }
      }
    }}
    onCanPlay={() => { setReady(true); readyRef.current(); }}
    onPlaying={() => { if (soundRef.current) rampVolume(); alignAudio(true); }}
    onTimeUpdate={() => alignAudio(false)}
    onSeeked={() => alignAudio(true)}
    onSeeking={() => audioRef.current?.pause()}
    onWaiting={() => audioRef.current?.pause()}
    onPause={() => audioRef.current?.pause()}
    onEnded={() => { audioRef.current?.pause(); doneRef.current(); }}
    onError={() => { audioRef.current?.pause(); doneRef.current(); }}
    aria-hidden="true"
  />{source.audioUrl && <audio ref={audioRef} src={source.audioUrl} preload={soundEnabled ? 'auto' : 'none'}
    onLoadedMetadata={() => alignAudio(true)} onError={() => { audioRef.current?.pause(); }} aria-hidden="true" />}</>;
}
