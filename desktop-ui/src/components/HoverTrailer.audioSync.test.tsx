import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';

vi.mock('../bridge', () => ({ call: vi.fn() }));

import { HoverTrailer, VOLUME_FADE_IN_MS } from './HoverTrailer';

let play: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function state(el: HTMLMediaElement, values: { paused: boolean; readyState: number }) {
  Object.defineProperty(el, 'paused', { value: values.paused, configurable: true });
  Object.defineProperty(el, 'readyState', { value: values.readyState, configurable: true });
}

describe('HoverTrailer volume fade-in', () => {
  it('eases the sound in from silence each time playback starts', async () => {
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => { frames.push(callback); return frames.length; });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    render(<HoverTrailer ownerId="o2" type="movie" id="tt2" soundEnabled startSeconds={0} onReady={() => {}} onDone={() => {}}
      prefetched={{ videoUrl: 'https://v/b.mp4', audioUrl: 'https://v/b.m4a' }} />);
    const video = await waitFor(() => { const el = document.querySelector('video'); if (!el) throw new Error('no video'); return el; });
    const audio = document.querySelector('audio')!;
    video.volume = 1;
    audio.volume = 1;
    frames.length = 0;
    fireEvent.playing(video);
    expect(video.volume).toBe(0);
    expect(audio.volume).toBe(0);
    now = 1000 + VOLUME_FADE_IN_MS / 2;
    frames.at(-1)!(now);
    expect(audio.volume).toBeGreaterThan(0);
    expect(audio.volume).toBeLessThan(1);
    now = 1000 + VOLUME_FADE_IN_MS;
    frames.at(-1)!(now);
    expect(video.volume).toBe(1);
    expect(audio.volume).toBe(1);
  });
});

describe('HoverTrailer audio sync', () => {
  it('does not start the separate audio while the video is still buffering, then starts it once the video plays', async () => {
    render(<HoverTrailer ownerId="o1" type="movie" id="tt1" soundEnabled startSeconds={0} onReady={() => {}} onDone={() => {}}
      prefetched={{ videoUrl: 'https://v/a.mp4', audioUrl: 'https://v/a.m4a' }} />);
    const video = await waitFor(() => { const el = document.querySelector('video'); if (!el) throw new Error('no video'); return el; });
    const audio = document.querySelector('audio')!;
    // play() was called (paused=false) but no frames yet.
    state(video, { paused: false, readyState: 0 });
    state(audio, { paused: true, readyState: 1 });
    await waitFor(() => expect(play).toHaveBeenCalled());
    play.mockClear();
    fireEvent.loadedMetadata(audio);
    expect(play).not.toHaveBeenCalled();
    // Frames arrive: the video really plays and the audio joins it.
    state(video, { paused: false, readyState: 4 });
    fireEvent.playing(video);
    await waitFor(() => expect(play).toHaveBeenCalled());
  });
});
