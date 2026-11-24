import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { StreamsPage } from './StreamsPage';

const bridge = vi.hoisted(() => {
  class BridgeError extends Error {
    constructor(public readonly code: string, message: string) { super(message); }
  }
  return { BridgeError, state: {} as any, selection: {} as any, call: vi.fn(), playback: vi.fn() };
});
vi.mock('../../bridge', () => ({
  useSelector: (select: (state: any) => unknown) => select(bridge.state),
  useFeatureSnapshot: (topic: string) => topic === 'playbackSettings'
    ? { streamAutoPlayMode: 'FIRST_STREAM', showPlayerLoadingStatus: true }
    : topic === 'streamSelection' ? bridge.selection : undefined,
  refreshFeature: vi.fn(async () => ({ streamAutoPlayMode: 'FIRST_STREAM' })),
  call: (...args: unknown[]) => bridge.call(...args),
  actions: { loadStreams: vi.fn(async () => {}), playback: (...args: unknown[]) => bridge.playback(...args) },
  BridgeError: bridge.BridgeError,
}));
vi.mock('../../components/useDecodedImage', () => ({ useDecodedImage: (url?: string) => ({ ready: !!url, failed: false }) }));

const stream = { id: 's1', name: 'Stream one', description: '', presentation: {} };
beforeEach(() => {
  bridge.state = {
    details: { media: null, episodes: [] },
    streams: { requestId: 'r1', loading: false, error: null, groups: [{ id: 'a', name: 'Addon', loading: false, error: null, streams: [stream] }] },
    playback: {},
    session: { activeProfile: 1 },
  };
  bridge.selection = {
    selectedAddonId: null, downloadFilterMode: 'all', autoPlayStreamId: 's1',
    autoPlay: { enabled: true, overlayVisible: false, message: null },
    badges: { showFileSize: true, showAddonLogo: false },
  };
  // Like the bridge, consuming auto-play clears its candidate.
  bridge.call.mockReset().mockImplementation(async (method: string) => {
    if (method === 'streams.autoplay.consume') bridge.selection = { ...bridge.selection, autoPlayStreamId: null };
    return {};
  });
  bridge.playback.mockReset();
});
afterEach(() => cleanup());

function renderStreams() {
  render(<MemoryRouter initialEntries={['/details/series/tt1/streams/tt1%3A3%3A2']}><Routes>
    <Route path="/details/:type/:id/streams/:videoId" element={<StreamsPage />} />
  </Routes></MemoryRouter>);
}
const skipCalls = () => bridge.call.mock.calls.filter(([method]) => method === 'streams.autoplay.skip');

it('stops auto-play on a title-level failure instead of trying every stream', async () => {
  bridge.playback.mockRejectedValue(new bridge.BridgeError('DETAILS_UNAVAILABLE', "This title's details could not be loaded."));
  renderStreams();
  expect(await screen.findByText("This title's details could not be loaded.")).toBeInTheDocument();
  expect(bridge.playback).toHaveBeenCalledTimes(1);
  expect(skipCalls()).toHaveLength(0);
  expect(bridge.call).toHaveBeenCalledWith('streams.autoplay.consume');
});

it('still skips to the next stream when the selected stream fails', async () => {
  bridge.playback.mockRejectedValue(new bridge.BridgeError('BRIDGE_ERROR', 'The operation could not be completed.'));
  renderStreams();
  await waitFor(() => expect(skipCalls()).toEqual([['streams.autoplay.skip', { streamId: 's1' }]]));
});
