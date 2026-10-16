import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TrackingSettingsPage } from './TrackingSettings';
const bridge = vi.hoisted(() => ({ snapshots: {} as Record<string, any>, call: vi.fn(), refresh: vi.fn(), profile: 1 }));
vi.mock('../../bridge', () => ({
  useFeatureSnapshot: (topic: string) => bridge.snapshots[topic],
  useSelector: (select: (state: any) => unknown) => select({ session: { activeProfile: bridge.profile } }),
  call: (...args: unknown[]) => bridge.call(...args),
  refreshFeature: (...args: unknown[]) => bridge.refresh(...args),
}));
function page() { return <MemoryRouter><TrackingSettingsPage /></MemoryRouter>; }
beforeEach(() => {
  bridge.profile = 1;
  bridge.snapshots = {
    trackingSettings: { librarySourceMode: 'LOCAL', effectiveLibrarySourceMode: 'LOCAL', watchProgressSource: 'NUVIO_SYNC', effectiveWatchProgressSource: 'NUVIO_SYNC', moreLikeThisSource: 'TMDB', effectiveMoreLikeThisSource: 'TMDB', simklAnimeIdPreference: 'IMDB', simklConnected: false, mdblistConnected: false, isRefreshingProgress: false, lastProgressRefreshSucceeded: null },
    simkl: { mode: 'disconnected', connected: false, credentialsConfigured: true, isLoading: false, usesPinFlow: true, username: null, error: null, isSyncing: false },
    mdblist: { account: { mode: 'disconnected', connected: false, credentialsConfigured: true, isBusy: false, username: null, error: null, isSyncing: false, revokeFailed: false } },
  };
  bridge.call.mockReset().mockResolvedValue({}); bridge.refresh.mockReset().mockResolvedValue({});
});
afterEach(cleanup);
describe('Kotlin Tracking settings parity', () => {
  it('renders branded account cards, inline connect controls and native source labels', () => {
    render(page());
    expect(screen.getByRole('heading', { name: 'Tracking' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect Simkl' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'MDBList account' })).toBeNull();
    expect(screen.getByText('Nuvio Library')).toBeInTheDocument();
    expect(screen.getByText('Nuvio Sync')).toBeInTheDocument();
    expect(screen.queryByText('Trakt sync is unavailable in this desktop build.')).toBeNull();
    expect(screen.queryByRole('button', { name: /Anime ID preference/ })).toBeNull();
    expect(screen.getByRole('link', { name: 'Back to Settings' })).toHaveAttribute('href', '/settings?category=account');
  });
  it('shows disconnected source explanations and prevents selecting unavailable services', async () => {
    render(page()); fireEvent.click(screen.getByRole('button', { name: /Library Source/ }));
    const dialog = screen.getByRole('dialog', { name: 'Library Source' });
    expect(within(dialog).getByRole('radio', { name: /Simkl/ })).toBeDisabled();
    expect(within(dialog).getByRole('radio', { name: /MDBList/ })).toBeDisabled();
    expect(within(dialog).getByText('Choose the service Nuvio reads for your Library. Playback scrobbles to every connected service.')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(bridge.call).not.toHaveBeenCalled();
  });
  it('saves the selected watch progress provider and displays refresh progress', async () => {
    bridge.snapshots.trackingSettings.mdblistConnected = true;
    let finish!: (value: unknown) => void;
    bridge.call.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    render(page()); fireEvent.click(screen.getByRole('button', { name: /Watch Progress/ }));
    fireEvent.click(screen.getByRole('radio', { name: /MDBList/ }));
    expect(bridge.call).toHaveBeenCalledWith('trackingSettings.set', { key: 'watchProgressSource', value: 'MDBLIST' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByLabelText('Refreshing watch progress')).toBeInTheDocument();
    await act(async () => finish({}));
    expect(bridge.refresh).toHaveBeenCalledWith('trackingSettings');
  });
  it('opens provider authorization from the inline connect button', async () => {
    bridge.call.mockImplementation((method) => Promise.resolve(method === 'simkl.connect' ? { authorizationUrl: 'https://simkl.com/pin' } : {}));
    render(page()); fireEvent.click(screen.getByRole('button', { name: 'Connect Simkl' }));
    await waitFor(() => expect(bridge.call).toHaveBeenCalledWith('app.openExternal', { url: 'https://simkl.com/pin' }));
    expect(bridge.refresh).toHaveBeenCalledWith('simkl');
  });
  it('resumes pending authorization, copies the code and cancels without disconnecting', async () => {
    Object.assign(bridge.snapshots.simkl, { mode: 'awaiting_approval', pendingPinUserCode: 'ABCD', pendingPinVerificationUrl: 'https://simkl.com/pin' });
    const copy = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: copy } });
    render(page());
    await waitFor(() => expect(bridge.call).toHaveBeenCalledWith('simkl.resume'));
    expect(bridge.call).not.toHaveBeenCalledWith('app.openExternal', expect.anything());
    fireEvent.click(screen.getByRole('button', { name: 'Copy Simkl code' }));
    await waitFor(() => expect(screen.getByText('Code copied.')).toBeInTheDocument());
    expect(copy).toHaveBeenCalledWith('ABCD');
    fireEvent.click(within(screen.getByRole('region', { name: 'Simkl account' })).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(bridge.call).toHaveBeenCalledWith('simkl.cancel'));
    expect(bridge.call).not.toHaveBeenCalledWith('simkl.disconnect');
  });
  it('requires confirmation before disconnecting and provides Simkl sync help', async () => {
    Object.assign(bridge.snapshots.simkl, { connected: true, mode: 'connected', username: 'Viewer' });
    bridge.snapshots.trackingSettings.simklConnected = true;
    render(page());
    expect(screen.getByText('Connected as Viewer')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'How syncing works' }));
    expect(screen.getByRole('dialog', { name: 'How Simkl syncing works' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    expect(bridge.call).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Disconnect Simkl?' })).getByRole('button', { name: 'Disconnect' }));
    await waitFor(() => expect(bridge.call).toHaveBeenCalledWith('simkl.disconnect'));
  });
  it('keeps the MDBList login card hidden even for a connected account', () => {
    Object.assign(bridge.snapshots.mdblist.account, { connected: true, mode: 'connected', username: 'Viewer' });
    render(page());
    expect(screen.queryByRole('region', { name: 'MDBList account' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Disconnect MDBList' })).toBeNull();
  });
  it('shows fallback and failed refresh retry with the stored provider retained', async () => {
    Object.assign(bridge.snapshots.trackingSettings, { watchProgressSource: 'SIMKL', lastProgressRefreshSucceeded: false });
    render(page());
    expect(screen.getByText(/Simkl is unavailable. Using Nuvio Sync until it reconnects./)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(bridge.call).toHaveBeenCalledWith('trackingSettings.refreshProgress'));
  });
  it('matches anime and recommendations choices, including disabled Trakt recommendations', async () => {
    bridge.snapshots.trackingSettings.simklConnected = true;
    render(page());
    fireEvent.click(screen.getByRole('button', { name: /More Like This source/ }));
    expect(screen.getByRole('radio', { name: /Trakt/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: /Anime ID preference/ }));
    fireEvent.click(screen.getByRole('radio', { name: /Prefer MyAnimeList/ }));
    await waitFor(() => expect(bridge.call).toHaveBeenCalledWith('trackingSettings.set', { key: 'simklAnimeIdPreference', value: 'MAL' }));
  });
  it('surfaces action failures and disables connection when credentials are missing', async () => {
    bridge.snapshots.simkl.credentialsConfigured = false;
    bridge.call.mockRejectedValue(new Error('Authorization could not be started'));
    const view = render(page());
    expect(screen.getByRole('button', { name: 'Connect Simkl' })).toBeDisabled();
    bridge.snapshots.simkl.credentialsConfigured = true;
    view.rerender(page());
    fireEvent.click(screen.getByRole('button', { name: 'Connect Simkl' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Authorization could not be started'));
  });
});
