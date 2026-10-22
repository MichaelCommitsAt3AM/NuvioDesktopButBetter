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
