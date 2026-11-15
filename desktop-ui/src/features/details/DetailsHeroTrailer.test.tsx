import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

const bridge = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock('../../bridge', () => ({ call: (...args: unknown[]) => bridge.call(...args) }));
vi.mock('../../navigation/scrollStore', () => ({ mainScroller: () => null }));

import { DetailsHeroTrailer, PAUSE_VIEWPORT_FRACTION, prefetchHeroTrailer, shouldPauseHeroTrailer, isDetailsFlowPath, resetFinishedHeroTrailers } from './DetailsHeroTrailer';

beforeEach(() => {
  bridge.call.mockReset();
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('shouldPauseHeroTrailer', () => {
  it('holds once the anchor passes the 60% viewport line, resumes above it', () => {
    expect(PAUSE_VIEWPORT_FRACTION).toBe(0.6);
    expect(shouldPauseHeroTrailer(896, 0, 1124)).toBe(false);
    expect(shouldPauseHeroTrailer(700, 196, 1124)).toBe(false);
    expect(shouldPauseHeroTrailer(674, 222, 1124)).toBe(true);
    expect(shouldPauseHeroTrailer(600, 300, 1124)).toBe(true);
    expect(shouldPauseHeroTrailer(310, 586, 1124)).toBe(true);
  });
  it('falls back to scroll distance when there is no anchor yet', () => {
    expect(shouldPauseHeroTrailer(null, 100, 1000)).toBe(false);
    expect(shouldPauseHeroTrailer(null, 500, 1000)).toBe(true);
  });
});

describe('prefetchHeroTrailer', () => {
  it('shares one request per title and reuses a recent success', async () => {
    bridge.call.mockResolvedValue({ videoUrl: 'https://v/1.mp4', audioUrl: null });
    const [a, b] = await Promise.all([prefetchHeroTrailer('series', 'tt-share'), prefetchHeroTrailer('series', 'tt-share')]);
    expect(a).toEqual({ videoUrl: 'https://v/1.mp4', audioUrl: null });
    expect(b).toBe(a);
    await prefetchHeroTrailer('series', 'tt-share');
    expect(bridge.call).toHaveBeenCalledTimes(1);
    expect(bridge.call).toHaveBeenCalledWith('trailers.resolveHover', { type: 'series', id: 'tt-share' });
  });
  it('resolves failures and empty sources to null, and does not retry them straight away', async () => {
    bridge.call.mockRejectedValueOnce(new Error('boom'));
    expect(await prefetchHeroTrailer('movie', 'tt-fail')).toBeNull();
    expect(await prefetchHeroTrailer('movie', 'tt-fail')).toBeNull();
    bridge.call.mockResolvedValueOnce({ videoUrl: null });
    expect(await prefetchHeroTrailer('movie', 'tt-empty')).toBeNull();
    expect(await prefetchHeroTrailer('movie', 'tt-empty')).toBeNull();
    expect(bridge.call).toHaveBeenCalledTimes(2);
  });
  it('retries a failed title once the failure memory has expired', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      bridge.call.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({ videoUrl: 'https://v/retry.mp4' });
      expect(await prefetchHeroTrailer('movie', 'tt-expire')).toBeNull();
      vi.setSystemTime(Date.now() + 4 * 60_000);
      expect((await prefetchHeroTrailer('movie', 'tt-expire'))?.videoUrl).toBe('https://v/retry.mp4');
      expect(bridge.call).toHaveBeenCalledTimes(2);
    } finally { vi.useRealTimers(); }
  });
});

describe('isDetailsFlowPath', () => {
  it('treats pages reached from the details page as the same visit', () => {
    for (const path of ['/details/movie/tt1', '/details/movie/tt1/streams/tt1', '/playback', '/person/5', '/entity/company/9']) expect(isDetailsFlowPath(path)).toBe(true);
    for (const path of ['/', '/search', '/library', '/settings/playback']) expect(isDetailsFlowPath(path)).toBe(false);
  });
});

describe('DetailsHeroTrailer', () => {
  it('does not replay a finished trailer on coming back, until the visit is reset', async () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    bridge.call.mockResolvedValue({ videoUrl: 'https://v/finished.mp4', audioUrl: null });
    const first = render(<DetailsHeroTrailer type="movie" id="tt-finished" enabled />);
    await waitFor(() => expect(document.querySelector('video')).not.toBeNull());
    document.querySelector('video')!.dispatchEvent(new Event('ended'));
    await waitFor(() => expect(document.querySelector('video')).toBeNull(), { timeout: 2000 });
    first.unmount();
    // Back from the streams page: the page remounts, but the trailer stays finished.
    render(<DetailsHeroTrailer type="movie" id="tt-finished" enabled />);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(document.querySelector('video')).toBeNull();
    cleanup();
    // The user left the details flow and came back: it plays again.
    resetFinishedHeroTrailers();
    render(<DetailsHeroTrailer type="movie" id="tt-finished" enabled />);
    await waitFor(() => expect(document.querySelector('video')).not.toBeNull());
  });
  it('prefetches immediately, but renders nothing until visible', async () => {
    bridge.call.mockResolvedValue({ videoUrl: 'https://v/2.mp4', audioUrl: null });
    const { rerender } = render(<DetailsHeroTrailer type="movie" id="tt-visible" enabled visible={false} />);
    await waitFor(() => expect(bridge.call).toHaveBeenCalledTimes(1));
    expect(document.querySelector('video')).toBeNull();
    rerender(<DetailsHeroTrailer type="movie" id="tt-visible" enabled visible />);
    await waitFor(() => expect(document.querySelector('video')?.getAttribute('src')).toBe('https://v/2.mp4'));
    expect(bridge.call).toHaveBeenCalledTimes(1);
  });
  it('does nothing when autoplay is off', async () => {
    render(<DetailsHeroTrailer type="movie" id="tt-off" enabled={false} />);
    expect(bridge.call).not.toHaveBeenCalled();
    expect(document.querySelector('video')).toBeNull();
  });
  it('pauses and fades back to the artwork when the window loses focus, and returns on focus', async () => {
    const hasFocus = vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    const pause = vi.mocked(HTMLMediaElement.prototype.pause);
    bridge.call.mockResolvedValue({ videoUrl: 'https://v/5.mp4', audioUrl: null });
    render(<DetailsHeroTrailer type="movie" id="tt-focus" enabled />);
    await waitFor(() => expect(document.querySelector('video')).not.toBeNull());
    const video = document.querySelector('video')!;
    Object.defineProperty(video, 'readyState', { value: 4, configurable: true });
    pause.mockClear();
    hasFocus.mockReturnValue(false);
    window.dispatchEvent(new Event('blur'));
    await waitFor(() => expect(pause).toHaveBeenCalled());
    await waitFor(() => expect(document.querySelector('.detail-hero-trailer')).toHaveClass('is-paused'));
    const play = vi.mocked(HTMLMediaElement.prototype.play);
    play.mockClear();
    hasFocus.mockReturnValue(true);
    window.dispatchEvent(new Event('focus'));
    await waitFor(() => expect(play).toHaveBeenCalled());
    await waitFor(() => expect(document.querySelector('.detail-hero-trailer')).not.toHaveClass('is-paused'));
  });
  // The pause button is commented out in DetailsHeroTrailer.tsx; re-enable this with it.
  it.skip('has a pause button that freezes the frame in place and plays again on a second press', async () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    const pause = vi.mocked(HTMLMediaElement.prototype.pause);
    const play = vi.mocked(HTMLMediaElement.prototype.play);
    bridge.call.mockResolvedValue({ videoUrl: 'https://v/6.mp4', audioUrl: null });
    render(<DetailsHeroTrailer type="movie" id="tt-pause" enabled />);
    await waitFor(() => expect(document.querySelector('video')).not.toBeNull());
    const video = document.querySelector('video')!;
    Object.defineProperty(video, 'readyState', { value: 4, configurable: true });
    video.dispatchEvent(new Event('canplay'));
    const button = await screen.findByRole('button', { name: 'Pause trailer' });
    expect(screen.queryByRole('button', { name: /interface/i })).toBeNull();
    pause.mockClear();
    button.click();
    await waitFor(() => expect(pause).toHaveBeenCalled());
    expect(document.querySelector('.detail-hero-trailer')).not.toHaveClass('is-paused');
    play.mockClear();
    (await screen.findByRole('button', { name: 'Play trailer' })).click();
    await waitFor(() => expect(play).toHaveBeenCalled());
    expect(await screen.findByRole('button', { name: 'Pause trailer' })).toBeInTheDocument();
  });
  it('fades back to the artwork when the trailer ends, then removes the player', async () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    const onUiState = vi.fn();
    bridge.call.mockResolvedValue({ videoUrl: 'https://v/7.mp4', audioUrl: null });
    render(<DetailsHeroTrailer type="movie" id="tt-end" enabled onUiState={onUiState} />);
    await waitFor(() => expect(document.querySelector('video')).not.toBeNull());
    const video = document.querySelector('video')!;
    video.dispatchEvent(new Event('canplay'));
    await screen.findByRole('button', { name: 'Mute trailer' });
    video.dispatchEvent(new Event('ended'));
    await waitFor(() => expect(document.querySelector('.detail-hero-trailer')).toHaveClass('is-paused'));
    expect(screen.queryByRole('button', { name: 'Mute trailer' })).toBeNull();
    await waitFor(() => expect(document.querySelector('video')).toBeNull(), { timeout: 2000 });
    expect(onUiState).toHaveBeenLastCalledWith('shown');
  });
  it('marks the layer paused so CSS can fade back to the artwork', async () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    bridge.call.mockResolvedValue({ videoUrl: 'https://v/4.mp4', audioUrl: null });
    render(<DetailsHeroTrailer type="movie" id="tt-layer" enabled />);
    await waitFor(() => expect(document.querySelector('.detail-hero-trailer')).not.toBeNull());
    expect(document.querySelector('.detail-hero-trailer')).not.toHaveClass('is-paused');
  });
  it('keeps the mute choice for the next title and after the app is reopened', async () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    localStorage.removeItem('nuvio.details.trailerMuted');
    bridge.call.mockResolvedValue({ videoUrl: 'https://v/8.mp4', audioUrl: null });
    const first = render(<DetailsHeroTrailer type="movie" id="tt-keep-1" enabled />);
    await waitFor(() => expect(document.querySelector('video')).not.toBeNull());
    document.querySelector('video')!.dispatchEvent(new Event('canplay'));
    (await screen.findByRole('button', { name: 'Mute trailer' })).click();
    await screen.findByRole('button', { name: 'Unmute trailer' });
    first.unmount();
    // Another title (a fresh page mount, or a full restart reading the same storage): still muted.
    render(<DetailsHeroTrailer type="movie" id="tt-keep-2" enabled />);
    await waitFor(() => expect(document.querySelector('video')).not.toBeNull());
    document.querySelector('video')!.dispatchEvent(new Event('canplay'));
    expect(await screen.findByRole('button', { name: 'Unmute trailer' })).toBeInTheDocument();
    expect(document.querySelector('video')!.muted).toBe(true);
    // Unmuting is remembered the same way.
    (await screen.findByRole('button', { name: 'Unmute trailer' })).click();
    await screen.findByRole('button', { name: 'Mute trailer' });
    expect(localStorage.getItem('nuvio.details.trailerMuted')).toBe('0');
    localStorage.removeItem('nuvio.details.trailerMuted');
  });
  it('shows a mute toggle once the video can play and remembers the choice', async () => {
    bridge.call.mockResolvedValue({ videoUrl: 'https://v/3.mp4', audioUrl: null });
    render(<DetailsHeroTrailer type="movie" id="tt-mute" enabled />);
    await waitFor(() => expect(document.querySelector('video')).not.toBeNull());
    expect(screen.queryByRole('button', { name: /mute trailer/i })).toBeNull();
    document.querySelector('video')!.dispatchEvent(new Event('canplay'));
    const button = await screen.findByRole('button', { name: 'Mute trailer' });
    button.click();
    expect(await screen.findByRole('button', { name: 'Unmute trailer' })).toBeInTheDocument();
    expect(localStorage.getItem('nuvio.details.trailerMuted')).toBe('1');
    localStorage.removeItem('nuvio.details.trailerMuted');
  });
});
