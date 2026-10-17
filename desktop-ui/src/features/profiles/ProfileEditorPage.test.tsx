import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ProfileEditorPage } from './ProfileEditorPage';

const store = vi.hoisted(() => ({ snapshot: {} as any, run: vi.fn(async () => {}), setError: vi.fn(), call: vi.fn() }));
vi.mock('../../bridge', () => ({ call: store.call, useSelector: () => null, useFeatureSnapshot: () => undefined }));
vi.mock('./profileStore', () => ({ useProfiles: () => ({ ...store, loading: false, error: '', refresh: vi.fn() }) }));
beforeEach(() => {
  store.call.mockReset();
  store.call.mockResolvedValue([{ url: 'https://one/manifest.json', name: 'One', enabled: true }, { url: 'https://two/manifest.json', name: 'Two', enabled: false }]);
  store.run.mockReset();
  store.run.mockResolvedValue(undefined);
  store.snapshot = { items: [{ id: 1, name: 'Main' }, { id: 2, name: 'Family', addonSyncProfileId: 1 }], avatars: [], backgrounds: [] };
});
it('preserves draft fields when the background avatar catalog arrives', () => {
  const view = editor('/profiles/2/edit');
  fireEvent.change(screen.getByLabelText('Profile name'), { target: { value: 'Draft name' } });
  store.snapshot = { ...store.snapshot, avatars: [{ id: 'fresh', name: 'Fresh avatar', category: 'Standard', color: '#FFFFFF', url: null, memberOnly: false }] };
  view.rerender(<MemoryRouter initialEntries={['/profiles/2/edit']}><Routes><Route path="/profiles/:id/edit" element={<ProfileEditorPage />} /></Routes></MemoryRouter>);
  expect(screen.getByLabelText('Profile name')).toHaveValue('Draft name');
});
it('confirms deletion, supports cancellation, and returns to profiles after success', async () => {
  editor('/profiles/2/edit');
  fireEvent.click(screen.getByRole('button', { name: 'Delete profile' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(store.run).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Delete profile' }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete profile' }));
  await screen.findByText('Saved');
  expect(store.run).toHaveBeenCalledWith('profiles.delete', { id: 2 });
});
it('keeps failed deletion visible and protects the primary profile', async () => {
  store.run.mockRejectedValueOnce(new Error('Could not delete profile.'));
  editor('/profiles/2/edit');
  fireEvent.click(screen.getByRole('button', { name: 'Delete profile' }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete profile' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not delete profile.');
  expect(screen.queryByText('Saved')).not.toBeInTheDocument();
  cleanup();
  editor('/profiles/1/edit');
  expect(screen.queryByRole('button', { name: 'Delete profile' })).not.toBeInTheDocument();
});
afterEach(cleanup);
function editor(path = '/profiles/new') {
  return render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/profiles/new" element={<ProfileEditorPage />} /><Route path="/profiles/:id/edit" element={<ProfileEditorPage />} /><Route path="/profiles" element={<p>Saved</p>} /></Routes></MemoryRouter>);
}
it('requires a profile selection and saves a persistent link instead of a primary copy', async () => {
  editor();
  fireEvent.change(screen.getByLabelText('Profile name'), { target: { value: 'Kids' } });
  fireEvent.click(screen.getByRole('checkbox', { name: 'Sync add-ons with another profile' }));
  expect(screen.getByRole('button', { name: 'Create profile' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: /Sync with profile/ }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Family' }));
  fireEvent.click(screen.getByRole('button', { name: 'Create profile' }));
  await waitFor(() => expect(store.run).toHaveBeenCalledWith('profiles.create', expect.objectContaining({ addonSyncProfileId: 2, usesPrimaryAddons: false, primaryAddonsAllowlist: null })));
});
it('restores the selected source, excludes itself, and allows unlinking', async () => {
  editor('/profiles/2/edit');
  expect(screen.getByRole('checkbox', { name: 'Sync add-ons with another profile' })).toBeChecked();
  expect(screen.getByRole('checkbox', { name: 'Sync all add-ons' })).toBeChecked();
  expect(screen.getByRole('button', { name: /Sync with profile/ })).toHaveTextContent('Main');
  expect(screen.queryByRole('option', { name: 'Family' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Sync add-ons with another profile' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() => expect(store.run).toHaveBeenCalledWith('profiles.update', expect.objectContaining({ id: 2, addonSyncProfileId: null })));
});
it('cannot enable sync when there is no other profile', () => {
  store.snapshot.items = [];
  editor();
  expect(screen.getByRole('checkbox', { name: 'Sync add-ons with another profile' })).toBeDisabled();
});
it('does not present the old one-time copy flag as a live link', () => {
  store.snapshot.items[1] = { id: 2, name: 'Family', usesPrimaryAddons: true };
  editor('/profiles/2/edit');
  expect(screen.getByRole('checkbox', { name: 'Sync add-ons with another profile' })).not.toBeChecked();
  expect(screen.queryByText('Use primary profile add-ons')).not.toBeInTheDocument();
});

it('copies checked add-ons once without creating a live link', async () => {
  editor('/profiles/2/edit');
  fireEvent.click(screen.getByRole('checkbox', { name: 'Sync all add-ons' }));
  const one = await screen.findByRole('checkbox', { name: /One/ });
  expect(one).toBeChecked();
  expect(screen.getByRole('checkbox', { name: /Two/ })).toBeChecked();
  fireEvent.click(screen.getByRole('checkbox', { name: /Two/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() => expect(store.run).toHaveBeenCalledWith('profiles.update', expect.objectContaining({ id: 2, addonSyncProfileId: null, addonCopyProfileId: 1, addonCopyUrls: ['https://one/manifest.json'] })));
});
it('can return from partial selection to full live syncing', async () => {
  editor('/profiles/2/edit');
  fireEvent.click(screen.getByRole('checkbox', { name: 'Sync all add-ons' }));
  fireEvent.click(await screen.findByRole('checkbox', { name: /One/ }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Sync all add-ons' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() => expect(store.run).toHaveBeenCalled());
  const params = (store.run.mock.calls as unknown as [string, Record<string, unknown>][])[0][1];
  expect(params).toMatchObject({ addonSyncProfileId: 1 });
  expect(params).not.toHaveProperty('addonCopyProfileId');
});
it('blocks saving on a failed source load and allows retry', async () => {
  store.call.mockRejectedValueOnce(new Error('Source unavailable'));
  editor('/profiles/2/edit');
  fireEvent.click(screen.getByRole('checkbox', { name: 'Sync all add-ons' }));
  expect(await screen.findByText('Source unavailable')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByRole('checkbox', { name: /One/ })).toBeChecked();
  expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
});

it('does not create a duplicate after a profile was created but copying failed', async () => {
  store.run.mockRejectedValueOnce(Object.assign(new Error('Profile created; open All profiles to retry copying.'), { code: 'PROFILE_CREATED_ADDON_COPY_FAILED' }));
  editor();
  fireEvent.change(screen.getByLabelText('Profile name'), { target: { value: 'New profile' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create profile' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Create profile' })).toBeDisabled());
  fireEvent.click(screen.getByRole('button', { name: 'Create profile' }));
  expect(store.run).toHaveBeenCalledTimes(1);
});
it('creates an independent empty list when every source add-on is unchecked', async () => {
  editor();
  fireEvent.change(screen.getByLabelText('Profile name'), { target: { value: 'New profile' } });
  fireEvent.click(screen.getByRole('checkbox', { name: 'Sync add-ons with another profile' }));
  fireEvent.click(screen.getByRole('button', { name: /Sync with profile/ }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Main' }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Sync all add-ons' }));
  fireEvent.click(await screen.findByRole('checkbox', { name: /One/ }));
  fireEvent.click(screen.getByRole('checkbox', { name: /Two/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Create profile' }));
  await waitFor(() => expect(store.run).toHaveBeenCalledWith('profiles.create', expect.objectContaining({ addonSyncProfileId: null, addonCopyProfileId: 1, addonCopyUrls: [] })));
});

it('requires a TMDB key but no parent PIN before creating a kids profile', async () => {
  editor();
  fireEvent.change(screen.getByLabelText('Profile name'), { target: { value: 'Kids' } });
  fireEvent.click(screen.getByRole('checkbox', { name: 'Kids account' }));
  expect(screen.getByLabelText('Maximum Age Rating')).toHaveValue('G');
  expect(screen.getByLabelText('TMDB API key')).toHaveAttribute('type', 'password');
  expect(screen.queryByText('KidsScreen connection')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Server address')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Create profile' }));
  expect(store.run).not.toHaveBeenCalled();
  expect(screen.queryByLabelText('Parent PIN')).not.toBeInTheDocument();
  expect(store.setError).toHaveBeenCalledWith(expect.stringContaining('TMDB API key'));
});
it('configures KidsScreen after profile creation and passes a masked-key field value only in the request', async () => {
  store.run.mockResolvedValue({ items: [{ id: 1 }, { id: 2 }, { id: 3 }] } as never);
  editor();
  fireEvent.change(screen.getByLabelText('Profile name'), { target: { value: 'Kids' } });
  fireEvent.click(screen.getByRole('checkbox', { name: 'Kids account' }));
  fireEvent.change(screen.getByLabelText('TMDB API key'), { target: { value: 'personal-key' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create profile' }));
  await waitFor(() => expect(store.run).toHaveBeenCalledWith('profiles.kids.configure', { id: 3, enabled: true, maxRating: 'G', serviceUrl: 'https://kids-screen.vercel.app', apiKey: 'personal-key' }));
});

it('forces an independent copy when enabling kids mode and prevents re-enabling live sync', async () => {
  editor('/profiles/2/edit');
  expect(screen.getByRole('checkbox', { name: 'Sync all add-ons' })).toBeChecked();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Kids account' }));
  const syncAll = screen.getByRole('checkbox', { name: 'Sync all add-ons' });
  expect(syncAll).not.toBeChecked();
  expect(syncAll).toBeDisabled();
  expect(await screen.findByRole('checkbox', { name: /One/ })).toBeChecked();
  expect(screen.getByText(/Catalogs from Cinemeta, AIOMetadata/)).toBeInTheDocument();
});
it('loads existing kids profiles with live sync disabled', () => {
  store.snapshot.items[1].kidsEnabled = true;
  editor('/profiles/2/edit');
  expect(screen.getByRole('checkbox', { name: 'Sync all add-ons' })).not.toBeChecked();
  expect(screen.getByRole('checkbox', { name: 'Sync all add-ons' })).toBeDisabled();
});

it('shows saved-key dots without submitting them or reconfiguring an unchanged kids profile', async () => {
  store.snapshot.items[1] = { ...store.snapshot.items[1], addonSyncProfileId: null, kidsEnabled: true, kidsMaxRating: 'PG-13', kidsServiceUrl: 'https://kids-screen.vercel.app' };
  editor('/profiles/2/edit');
  const input = screen.getByLabelText('TMDB API key');
  expect(input).toHaveAttribute('placeholder', '••••••••••••••••');
  expect(input).toHaveValue('');
  expect(screen.getByText(/Key already configured/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await screen.findByText('Saved');
  expect(store.run).toHaveBeenCalledWith('profiles.update', expect.anything());
  expect(store.run).not.toHaveBeenCalledWith('profiles.kids.configure', expect.anything());
});
it('submits only the replacement key typed over the saved-key indicator', async () => {
  store.snapshot.items[1] = { ...store.snapshot.items[1], addonSyncProfileId: null, kidsEnabled: true, kidsMaxRating: 'G', kidsServiceUrl: 'https://kids-screen.vercel.app' };
  editor('/profiles/2/edit');
  fireEvent.change(screen.getByLabelText('TMDB API key'), { target: { value: 'replacement-key' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() => expect(store.run).toHaveBeenCalledWith('profiles.kids.configure', expect.objectContaining({ id: 2, apiKey: 'replacement-key' })));
});
