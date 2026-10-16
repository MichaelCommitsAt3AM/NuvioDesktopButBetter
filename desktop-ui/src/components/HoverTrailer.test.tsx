import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { HoverTrailer, releaseTrailerOwner, takeTrailerOwner } from './HoverTrailer';

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
});
afterEach(() => { cleanup(); releaseTrailerOwner('a'); releaseTrailerOwner('b'); vi.restoreAllMocks(); });

const bridge = vi.hoisted(() => ({ call: vi.fn(async (..._: unknown[]): Promise<{ videoUrl: string | null; audioUrl: string | null }> => ({ videoUrl: 'https://example.test/trailer.mp4', audioUrl: null })) }));
vi.mock('../bridge', () => ({ call: (...args: unknown[]) => bridge.call(...args) }));

describe('HoverTrailer ownership and lifecycle', () => {
  it('plays separate audio when sound is enabled and synchronizes seeks and teardown', async () => {
    bridge.call.mockResolvedValueOnce({ videoUrl: 'https://example.test/video.mp4', audioUrl: 'https://example.test/audio.m4a' });
    render(<HoverTrailer ownerId="a" type="movie" id="separate" soundEnabled startSeconds={2} onReady={() => {}} onDone={() => {}} />);
    await act(async () => {});
    const video = document.querySelector('video')!;
    const audio = document.querySelector('audio')!;
    expect(audio.src).toBe('https://example.test/audio.m4a');
    expect(audio.muted).toBe(false);
    expect(vi.mocked(HTMLMediaElement.prototype.play).mock.contexts).toContain(audio);
    video.currentTime = 15;
    fireEvent.timeUpdate(video);
    expect(audio.currentTime).toBe(15);
    const pause = vi.spyOn(audio, 'pause');
    takeTrailerOwner('b');
    expect(pause).toHaveBeenCalled();
  });
  it('resolves through the backend extraction path and mounts video', async () => {
    const onDone = vi.fn();
    render(<HoverTrailer ownerId="a" type="movie" id="m1" soundEnabled={false} startSeconds={2} onReady={() => {}} onDone={onDone} />);
    await act(async () => {});
    expect(bridge.call).toHaveBeenCalledWith('trailers.resolveHover', { type: 'movie', id: 'm1' });
    expect(document.querySelector('video.hover-trailer')?.getAttribute('src')).toBe('https://example.test/trailer.mp4');
    expect(onDone).not.toHaveBeenCalled();
  });

  it('falls back to artwork when extraction yields nothing', async () => {
    bridge.call.mockResolvedValueOnce({ videoUrl: null, audioUrl: null });
    const onDone = vi.fn();
    render(<HoverTrailer ownerId="a" type="movie" id="m2" soundEnabled={false} startSeconds={0} onReady={() => {}} onDone={onDone} />);
    await act(async () => {});
    expect(document.querySelector('video.hover-trailer')).toBeNull();
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('falls back when extraction fails', async () => {
    bridge.call.mockRejectedValueOnce(new Error('offline'));
    const onDone = vi.fn();
    render(<HoverTrailer ownerId="a" type="movie" id="m3" soundEnabled={false} startSeconds={0} onReady={() => {}} onDone={onDone} />);
    await act(async () => {});
    expect(document.querySelector('video.hover-trailer')).toBeNull();
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('lets a new preview take ownership and stops the previous one', async () => {
    const firstDone = vi.fn();
    render(<HoverTrailer ownerId="a" type="movie" id="m1" soundEnabled={false} startSeconds={0} onReady={() => {}} onDone={firstDone} />);
    await act(async () => {});
    expect(document.querySelector('video.hover-trailer')).not.toBeNull();
    takeTrailerOwner('b');
    expect(firstDone).toHaveBeenCalled();
  });

  it('tears down on unmount without starting hidden players', async () => {
    const onDone = vi.fn();
    const view = render(<HoverTrailer ownerId="a" type="movie" id="m1" soundEnabled={false} startSeconds={0} onReady={() => {}} onDone={onDone} />);
    await act(async () => {});
    view.unmount();
    takeTrailerOwner('b');
    // Unmounted instance already released; no late callbacks fire.
    expect(onDone).toHaveBeenCalledTimes(0);
  });

  it('ends back at artwork when playback finishes or errors', async () => {
    const onDone = vi.fn();
    render(<HoverTrailer ownerId="a" type="movie" id="m1" soundEnabled={false} startSeconds={0} onReady={() => {}} onDone={onDone} />);
    await act(async () => {});
    const video = document.querySelector('video.hover-trailer')!;
    fireEvent(video, new Event('ended'));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
