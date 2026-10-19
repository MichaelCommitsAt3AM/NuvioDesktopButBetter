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
it('keeps abandoned profile edits and import selections local to the editor', async () => {
  editor('/profiles/2/edit');
  const card = screen.getByRole('heading', { name: 'Import add-ons' }).closest('section')!;
  expect(within(card).getByRole('checkbox', { name: 'Import add-ons from another profile' })).not.toBeChecked();
  fireEvent.change(screen.getByLabelText('Profile name'), { target: { value: 'Abandoned name' } });
  startImport();
  await screen.findByRole('checkbox', { name: /One/ });
  fireEvent.click(screen.getByRole('checkbox', { name: /One/ }));
  fireEvent.click(screen.getByRole('link', { name: 'All profiles' }));
  await screen.findByText('Saved');
  expect(store.run).not.toHaveBeenCalled();
  expect(store.call.mock.calls.every(([method]) => method === 'profiles.addons.snapshot')).toBe(true);
  expect(store.snapshot.items[1].name).toBe('Family');
  expect(store.snapshot.items[1].addonSyncProfileId).toBe(1);
});
function editor(path = '/profiles/new') {
  return render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/profiles/new" element={<ProfileEditorPage />} /><Route path="/profiles/:id/edit" element={<ProfileEditorPage />} /><Route path="/profiles" element={<p>Saved</p>} /></Routes></MemoryRouter>);
}
it('requires a source profile and copies all selected add-ons by default', async () => {
  editor();
  fireEvent.change(screen.getByLabelText('Profile name'), { target: { value: 'Kids' } });
  fireEvent.click(screen.getByRole('checkbox', { name: 'Sync add-ons with another profile' }));
  expect(screen.getByRole('button', { name: 'Create Profile' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: /Sync with profile/ }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Family' }));
  expect(await screen.findByRole('checkbox', { name: /One/ })).toBeChecked();
  expect(screen.getByRole('checkbox', { name: /Two/ })).toBeChecked();
  expect(screen.queryByRole('checkbox', { name: 'Sync all add-ons' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Create Profile' }));
  await waitFor(() => expect(store.run).toHaveBeenCalledWith('profiles.create', expect.objectContaining({ addonSyncProfileId: null, addonCopyProfileId: 2, addonCopyUrls: ['https://one/manifest.json', 'https://two/manifest.json'], usesPrimaryAddons: false, primaryAddonsAllowlist: null })));
});
it('preserves an existing live link during cosmetic edits without enabling import', async () => {
  editor('/profiles/2/edit');
  expect(screen.getByRole('checkbox', { name: 'Import add-ons from another profile' })).not.toBeChecked();
  expect(screen.queryByRole('checkbox', { name: 'Sync all add-ons' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() => expect(store.run).toHaveBeenCalled());
  const params = (store.run.mock.calls as unknown as [string, Record<string, unknown>][])[0][1];
  expect(params).not.toHaveProperty('addonSyncProfileId');
  expect(params).not.toHaveProperty('addonCopyProfileId');
});
it('cannot enable sync when there is no other profile', () => {
  store.snapshot.items = [];
  editor();
  expect(screen.getByRole('checkbox', { name: 'Sync add-ons with another profile' })).toBeDisabled();
});
it('copies all settings from a chosen profile without listing add-ons', async () => {
  editor();
  fireEvent.change(screen.getByLabelText('Profile name'), { target: { value: 'Copycat' } });
  const card = screen.getByRole('heading', { name: 'Settings' }).closest('section')!;
  const toggle = within(card).getByRole('checkbox', { name: 'Sync settings with another profile' });
  expect(toggle).not.toBeChecked();
  fireEvent.click(toggle);
  expect(screen.getByRole('button', { name: 'Create Profile' })).toBeDisabled();
  fireEvent.click(within(card).getByRole('button', { name: /Copy settings from/ }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Family' }));
  expect(within(card).getByText('Family')).toBeInTheDocument();
  expect(within(card).queryByRole('checkbox', { name: /One/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Create Profile' }));
  await waitFor(() => expect(store.run).toHaveBeenCalledWith('profiles.create', expect.objectContaining({ settingsCopyProfileId: 2 })));
  const params = (store.run.mock.calls as unknown as [string, Record<string, unknown>][])[0][1];
  expect(params).not.toHaveProperty('addonCopyProfileId');
});
it('leaves settings independent when settings syncing is off', async () => {
  editor();
  fireEvent.change(screen.getByLabelText('Profile name'), { target: { value: 'Independent' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create Profile' }));
  await waitFor(() => expect(store.run).toHaveBeenCalled());
  const params = (store.run.mock.calls as unknown as [string, Record<string, unknown>][])[0][1];
  expect(params).not.toHaveProperty('settingsCopyProfileId');
});
it('does not offer settings syncing while editing a profile', () => {
  editor('/profiles/2/edit');
  expect(screen.queryByRole('checkbox', { name: 'Sync settings with another profile' })).not.toBeInTheDocument();
});
it('does not create a duplicate after settings were not copied', async () => {
  store.run.mockRejectedValueOnce(Object.assign(new Error('Profile created; adjust its settings.'), { code: 'PROFILE_CREATED_SETTINGS_COPY_FAILED' }));
  editor();
  fireEvent.change(screen.getByLabelText('Profile name'), { target: { value: 'Copycat' } });
  fireEvent.click(screen.getByRole('checkbox', { name: 'Sync settings with another profile' }));
  fireEvent.click(screen.getByRole('button', { name: /Copy settings from/ }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Family' }));
  fireEvent.click(screen.getByRole('button', { name: 'Create Profile' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Create Profile' })).toBeDisabled());
  fireEvent.click(screen.getByRole('button', { name: 'Create Profile' }));
  expect(store.run).toHaveBeenCalledTimes(1);
});
it('does not present the old one-time copy flag as a live link', () => {
  store.snapshot.items[1] = { id: 2, name: 'Family', usesPrimaryAddons: true };
  editor('/profiles/2/edit');
  expect(screen.getByRole('checkbox', { name: 'Import add-ons from another profile' })).not.toBeChecked();
  expect(screen.queryByText('Use primary profile add-ons')).not.toBeInTheDocument();
});

it('copies checked add-ons once without creating a live link', async () => {
  editor('/profiles/2/edit');
  startImport();
  const one = await screen.findByRole('checkbox', { name: /One/ });
  expect(one).toBeChecked();
  expect(screen.getByRole('checkbox', { name: /Two/ })).toBeChecked();
  fireEvent.click(screen.getByRole('checkbox', { name: /Two/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() => expect(store.run).toHaveBeenCalledWith('profiles.update', expect.objectContaining({ id: 2, addonSyncProfileId: null, addonCopyProfileId: 1, addonCopyUrls: ['https://one/manifest.json'] })));
});
it('creates a profile with only the add-ons left selected', async () => {
  editor();
  fireEvent.change(screen.getByLabelText('Profile name'), { target: { value: 'New profile' } });
  fireEvent.click(screen.getByRole('checkbox', { name: 'Sync add-ons with another profile' }));
  fireEvent.click(screen.getByRole('button', { name: /Sync with profile/ }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Main' }));
  fireEvent.click(await screen.findByRole('checkbox', { name: /One/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Create Profile' }));
  await waitFor(() => expect(store.run).toHaveBeenCalledWith('profiles.create', expect.objectContaining({ addonSyncProfileId: null, addonCopyProfileId: 1, addonCopyUrls: ['https://two/manifest.json'] })));
});
it('blocks saving on a failed source load and allows retry', async () => {
  store.call.mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('Source unavailable'));
  editor('/profiles/2/edit');
  startImport();
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
  fireEvent.click(screen.getByRole('button', { name: 'Create Profile' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Create Profile' })).toBeDisabled());
  fireEvent.click(screen.getByRole('button', { name: 'Create Profile' }));
  expect(store.run).toHaveBeenCalledTimes(1);
});
it('creates an independent empty list when every source add-on is unchecked', async () => {
  editor();
  fireEvent.change(screen.getByLabelText('Profile name'), { target: { value: 'New profile' } });
  fireEvent.click(screen.getByRole('checkbox', { name: 'Sync add-ons with another profile' }));
  fireEvent.click(screen.getByRole('button', { name: /Sync with profile/ }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Main' }));
  fireEvent.click(await screen.findByRole('checkbox', { name: /One/ }));
  fireEvent.click(screen.getByRole('checkbox', { name: /Two/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Create Profile' }));
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
  fireEvent.click(screen.getByRole('button', { name: 'Create Profile' }));
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
  fireEvent.click(screen.getByRole('button', { name: 'Create Profile' }));
  await waitFor(() => expect(store.run).toHaveBeenCalledWith('profiles.kids.configure', { id: 3, enabled: true, maxRating: 'G', serviceUrl: 'https://kids-screen.vercel.app', apiKey: 'personal-key' }));
});

it('forces an independent copy when enabling kids mode during creation', async () => {
  editor();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Sync add-ons with another profile' }));
  fireEvent.click(screen.getByRole('button', { name: /Sync with profile/ }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Main' }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Kids account' }));
  expect(screen.queryByRole('checkbox', { name: 'Sync all add-ons' })).not.toBeInTheDocument();
  expect(await screen.findByRole('checkbox', { name: /One/ })).toBeChecked();
  expect(screen.getByText('Copy playback providers once. KidsScreen supplies all browsing catalogs and search.')).toBeInTheDocument();
});
it('uses import-only editing for existing kids profiles', () => {
  store.snapshot.items[1].kidsEnabled = true;
  editor('/profiles/2/edit');
  expect(screen.getByRole('checkbox', { name: 'Import add-ons from another profile' })).not.toBeChecked();
  expect(screen.queryByRole('checkbox', { name: 'Sync all add-ons' })).not.toBeInTheDocument();
  expect(screen.getByRole('checkbox', { name: 'Kids account' })).toBeChecked();
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

function startImport() {
  fireEvent.click(screen.getByRole('checkbox', { name: 'Import add-ons from another profile' }));
  fireEvent.click(screen.getByRole('button', { name: /Import from profile/ }));
  expect(within(screen.getByRole('dialog')).queryByRole('button', { name: 'Family' })).not.toBeInTheDocument();
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Main' }));
}

it('blocks empty imports and does not unlink when import is cancelled', async () => {
  editor('/profiles/2/edit');
  startImport();
  fireEvent.click(await screen.findByRole('checkbox', { name: /One/ }));
  fireEvent.click(screen.getByRole('checkbox', { name: /Two/ }));
  expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Import add-ons from another profile' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() => expect(store.run).toHaveBeenCalled());
  const params = (store.run.mock.calls as unknown as [string, Record<string, unknown>][])[0][1];
  expect(params).not.toHaveProperty('addonCopyProfileId');
  expect(params).not.toHaveProperty('addonSyncProfileId');
});

it('defaults OpenSubtitles on, labels it Recommended, and saves an opt-out', async () => {
  editor();
  const subtitles = screen.getByRole('checkbox', { name: 'OpenSubtitles v3 — Recommended' });
  expect(subtitles).toBeChecked();
  fireEvent.click(subtitles);
  fireEvent.change(screen.getByLabelText('Profile name'), { target: { value: 'Independent' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create Profile' }));
  await waitFor(() => expect(store.run).toHaveBeenCalledWith('profiles.create', expect.objectContaining({ recommendedSubtitles: false })));
});
it('keeps a saved subtitle opt-out when editing', async () => {
  store.call.mockResolvedValueOnce([{ url: 'https://opensubtitles-v3.strem.io/manifest.json', name: 'OpenSubtitles v3', enabled: false, recommended: true }]);
  editor('/profiles/2/edit');
  await waitFor(() => expect(screen.getByRole('checkbox', { name: 'OpenSubtitles v3 — Recommended' })).not.toBeChecked());
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() => expect(store.run).toHaveBeenCalledWith('profiles.update', expect.objectContaining({ recommendedSubtitles: false })));
});
it('places add-on syncing after kids settings and excludes conflicting catalogs even if already selected', async () => {
  store.call.mockResolvedValue([
    { url: 'https://cinemeta/manifest.json', name: 'Cinemeta', enabled: true, kidsConflicting: true },
    { url: 'https://aio/manifest.json', name: 'AIOMetadata', enabled: true, kidsConflicting: true },
    { url: 'https://streams/manifest.json', name: 'Streams', enabled: true, kidsConflicting: false },
  ]);
  store.run.mockResolvedValue({ items: [{ id: 3 }] } as never);
  editor();
  fireEvent.change(screen.getByLabelText('Profile name'), { target: { value: 'Kids' } });
  fireEvent.click(screen.getByRole('checkbox', { name: 'Sync add-ons with another profile' }));
  fireEvent.click(screen.getByRole('button', { name: /Sync with profile/ }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Main' }));
  expect(await screen.findByRole('checkbox', { name: /Cinemeta/ })).toBeChecked();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Kids account' }));
  for (const name of [/Cinemeta/, /AIOMetadata/]) {
    expect(screen.getByRole('checkbox', { name })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name })).not.toBeChecked();
  }
  expect(screen.getByRole('heading', { name: 'Kids profile' }).closest('section')!.nextElementSibling).toContainElement(screen.getByRole('heading', { name: 'Add-on selection' }));
  fireEvent.change(screen.getByLabelText('TMDB API key'), { target: { value: 'key' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create Profile' }));
  await waitFor(() => expect(store.run).toHaveBeenCalledWith('profiles.create', expect.objectContaining({ kidsEnabled: true, addonCopyUrls: ['https://streams/manifest.json'] })));
});

it.each(['PG', 'PG-13'])('changes the configured kids rating to %s without re-entering its key', async rating => {
  store.snapshot.items[1] = { ...store.snapshot.items[1], kidsEnabled: true, kidsMaxRating: 'G', kidsServiceUrl: 'https://kids-screen.vercel.app' };
  editor('/profiles/2/edit');
  fireEvent.change(screen.getByLabelText('Maximum Age Rating'), { target: { value: rating } });
  expect(screen.getByLabelText('TMDB API key')).toHaveValue('');
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() => expect(store.run).toHaveBeenCalledWith('profiles.kids.configure', { id: 2, enabled: true, maxRating: rating, serviceUrl: 'https://kids-screen.vercel.app', apiKey: '' }));
  expect(store.setError).not.toHaveBeenCalledWith(expect.stringContaining('Enter your TMDB API key'));
});
it('keeps the configured KidsScreen server during cosmetic and rating edits', async () => {
  store.snapshot.items[1] = { ...store.snapshot.items[1], kidsEnabled: true, kidsMaxRating: 'PG', kidsServiceUrl: 'https://private-kids.example' };
  editor('/profiles/2/edit');
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await screen.findByText('Saved');
  expect(store.run).not.toHaveBeenCalledWith('profiles.kids.configure', expect.anything());
  cleanup();
  store.run.mockClear();
  editor('/profiles/2/edit');
  fireEvent.change(screen.getByLabelText('Maximum Age Rating'), { target: { value: 'G' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() => expect(store.run).toHaveBeenCalledWith('profiles.kids.configure', expect.objectContaining({ maxRating: 'G', serviceUrl: 'https://private-kids.example', apiKey: '' })));
});
