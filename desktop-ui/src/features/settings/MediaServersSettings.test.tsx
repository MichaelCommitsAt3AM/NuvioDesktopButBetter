import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MediaServersSettings } from './MediaServersSettings';

const bridge = vi.hoisted(() => ({ snapshot: {} as any, profile: 1, call: vi.fn(), refresh: vi.fn() }));
vi.mock('../../bridge', () => ({
  useFeatureSnapshot: () => bridge.snapshot,
  useSelector: (selector: any) => selector({ session: { activeProfile: bridge.profile } }),
  call: (...args: unknown[]) => bridge.call(...args),
  refreshFeature: (...args: unknown[]) => bridge.refresh(...args),
}));
beforeEach(() => {
  bridge.profile = 1;
  bridge.call.mockReset().mockResolvedValue({}); bridge.refresh.mockReset().mockResolvedValue({});
  bridge.snapshot = { cloudSync: false, providers: [{ id: 'jellyfin', name: 'Jellyfin' }], connections: [{ id: 'one', name: 'Home server', address: 'https://server.test', username: 'user', enabled: true, useCatalogMetadata: false, importWatchState: false, libraries: [{ id: 'movies', name: 'Movies', selected: true }] }] };
});
afterEach(cleanup);
const page = () => <MemoryRouter><MediaServersSettings /></MemoryRouter>;

it('clears the password on submission and sends credentials only to the connect method', async () => {
  render(page());
  fireEvent.click(screen.getByRole('button', { name: /Jellyfin.*Sign in/ }));
  fireEvent.change(screen.getByLabelText('Server address'), { target: { value: 'https://server.test' } });
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'user' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'private-password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
  await waitFor(() => expect(bridge.call).toHaveBeenCalledWith('servers.connect', { provider: 'jellyfin', address: 'https://server.test', username: 'user', password: 'private-password' }));
  await waitFor(() => expect(screen.queryByLabelText('Password')).toBeNull());
  expect(screen.getByText('ADD SERVER')).toBeInTheDocument();
});

it('requires explicit removal and sends library selections to Kotlin', async () => {
  render(page());
  fireEvent.click(screen.getByRole('button', { name: /Home server/ }));
  fireEvent.click(screen.getByLabelText('Movies'));
  await waitFor(() => expect(bridge.call).toHaveBeenCalledWith('servers.setLibrary', { id: 'one', libraryId: 'movies', selected: false }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Remove server' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Remove server' }));
  expect(bridge.call).not.toHaveBeenCalledWith('servers.remove', expect.anything());
  fireEvent.click(screen.getByRole('button', { name: /^Remove$/ }));
  await waitFor(() => expect(bridge.call).toHaveBeenCalledWith('servers.remove', { id: 'one' }));
});

it('drops obsolete errors and credentials when switching profiles', async () => {
  let fail!: (error: Error) => void;
  bridge.call.mockImplementation(() => new Promise((_, reject) => { fail = reject; }));
  const view = render(page());
  fireEvent.click(screen.getByRole('button', { name: /Jellyfin.*Sign in/ }));
  fireEvent.change(screen.getByLabelText('Server address'), { target: { value: 'https://server.test' } });
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'user' } });
  fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
  bridge.profile = 2; view.rerender(page());
  fail(new Error('sensitive provider error'));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  fireEvent.click(screen.getByRole('button', { name: /Jellyfin.*Sign in/ }));
  expect(screen.getByLabelText('Server address')).toHaveValue('');
  expect(screen.queryByText(/sensitive provider error/)).not.toBeInTheDocument();
  expect(screen.queryByText(/operation failed/)).not.toBeInTheDocument();
});

it('shows the Kotlin empty state and provider-specific sign-in dialog', () => {
  bridge.snapshot.connections = [];
  bridge.snapshot.providers.push({ id: 'emby', name: 'Emby' });
  render(page());
  expect(screen.getByText('SERVERS')).toBeInTheDocument();
  expect(screen.getByText('No servers connected yet.')).toBeInTheDocument();
  expect(screen.queryByLabelText('Server address')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /Emby.*Sign in/ }));
  expect(screen.getByRole('dialog', { name: 'Sign in to Emby' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Connect' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
  expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'text');
});

it('starts Plex sign-in in Kotlin instead of asking for a password', async () => {
  bridge.snapshot = { ...bridge.snapshot, providers: [{ id: 'jellyfin', name: 'Jellyfin' }, { id: 'plex', name: 'Plex', guided: true }], signIn: null };
  const view = render(page());
  fireEvent.click(screen.getByRole('button', { name: /Plex.*Sign in with your Plex account/ }));
  await waitFor(() => expect(bridge.call).toHaveBeenCalledWith('servers.signIn.start', { provider: 'plex' }));
  bridge.snapshot = { ...bridge.snapshot, signIn: { provider: 'plex', step: 'CODE', mode: 'LINK', codePhase: 'WAITING', code: 'AB12', linkHost: 'plex.tv/link', canOpenPage: true } };
  view.rerender(page());
  expect(screen.getByLabelText('Sign-in code')).toHaveTextContent('AB12');
  expect(screen.queryByLabelText('Password')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Sign in on this device' }));
  await waitFor(() => expect(bridge.call).toHaveBeenCalledWith('servers.signIn.plexMode', { mode: 'BROWSER' }));
  expect(bridge.call).not.toHaveBeenCalledWith('servers.connect', expect.anything());
});

it('picks Plex servers and users by id and clears the PIN after sending it', async () => {
  bridge.snapshot = { ...bridge.snapshot, providers: [{ id: 'plex', name: 'Plex', guided: true }], signIn: null };
  const view = render(page());
  fireEvent.click(screen.getByRole('button', { name: /Plex/ }));
  bridge.snapshot = { ...bridge.snapshot, signIn: { provider: 'plex', step: 'SERVERS', accountName: 'Sam', serversLoading: false, servers: [
    { id: 'm1', name: 'Living room', owned: true, reach: 'LOCAL', selectable: true },
    { id: 'm2', name: 'Away', owned: false, reach: 'OFFLINE', selectable: false },
  ] } };
  view.rerender(page());
  expect(screen.getByRole('button', { name: /Away/ })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: /Living room/ }));
  await waitFor(() => expect(bridge.call).toHaveBeenCalledWith('servers.signIn.plexServer', { id: 'm1' }));
  bridge.snapshot = { ...bridge.snapshot, signIn: { provider: 'plex', step: 'PIN', pinFor: 'Kid', pinWrong: false } };
  view.rerender(page());
  fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '1234' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  await waitFor(() => expect(bridge.call).toHaveBeenCalledWith('servers.signIn.pin', { pin: '1234' }));
  expect(screen.getByLabelText('PIN')).toHaveValue('');
});

it('closes the guided dialog when Kotlin reports the connection and cancels when dismissed', async () => {
  bridge.snapshot = { ...bridge.snapshot, providers: [{ id: 'silo', name: 'Silo', guided: true }], signIn: null };
  const view = render(page());
  fireEvent.click(screen.getByRole('button', { name: /Silo/ }));
  bridge.snapshot = { ...bridge.snapshot, signIn: { provider: 'silo', step: 'ADDRESS' } };
  view.rerender(page());
  fireEvent.change(screen.getByLabelText('Server address'), { target: { value: ' https://silo.test ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  await waitFor(() => expect(bridge.call).toHaveBeenCalledWith('servers.signIn.siloAddress', { address: 'https://silo.test' }));
  bridge.snapshot = { ...bridge.snapshot, signIn: { step: 'CONNECTED', serverName: 'Silo home' } };
  view.rerender(page());
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(bridge.call).toHaveBeenCalledWith('servers.signIn.acknowledge', {});

  bridge.snapshot = { ...bridge.snapshot, signIn: null };
  view.rerender(page());
  fireEvent.click(screen.getByRole('button', { name: /Silo/ }));
  bridge.snapshot = { ...bridge.snapshot, signIn: { provider: 'silo', step: 'ADDRESS' } };
  view.rerender(page());
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  await waitFor(() => expect(bridge.call).toHaveBeenCalledWith('servers.signIn.cancel', {}));
});

it('links back to Integrations from the server list and to the list from a server', () => {
  render(page());
  expect(screen.getByRole('link', { name: 'Integrations' })).toHaveAttribute('href', '/settings/integrations');
  fireEvent.click(screen.getByRole('button', { name: /Home server/ }));
  expect(screen.queryByRole('link', { name: 'Integrations' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Back to media servers' })).toBeInTheDocument();
});
