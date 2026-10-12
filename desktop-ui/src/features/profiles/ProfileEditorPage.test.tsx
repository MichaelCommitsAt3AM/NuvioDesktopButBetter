import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ProfileEditorPage } from './ProfileEditorPage';

const store = vi.hoisted(() => ({ snapshot: {} as any, run: vi.fn(async () => {}), setError: vi.fn() }));
vi.mock('./profileStore', () => ({ useProfiles: () => ({ ...store, loading: false, error: '', refresh: vi.fn() }) }));
beforeEach(() => {
  store.run.mockClear();
  store.snapshot = { items: [{ id: 1, name: 'Main' }, { id: 2, name: 'Family', addonSyncProfileId: 1 }], avatars: [], backgrounds: [] };
});
afterEach(cleanup);
function editor(path = '/profiles/new') {
  render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/profiles/new" element={<ProfileEditorPage />} /><Route path="/profiles/:id/edit" element={<ProfileEditorPage />} /><Route path="/profiles" element={<p>Saved</p>} /></Routes></MemoryRouter>);
}
it('requires a profile selection and saves a persistent link instead of a primary copy', async () => {
  editor();
  fireEvent.change(screen.getByLabelText('Profile name'), { target: { value: 'Kids' } });
  fireEvent.click(screen.getByRole('checkbox', { name: 'Sync add-ons with another profile' }));
  expect(screen.getByRole('button', { name: 'Create profile' })).toBeDisabled();
  fireEvent.change(screen.getByRole('combobox'), { target: { value: '2' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create profile' }));
  await waitFor(() => expect(store.run).toHaveBeenCalledWith('profiles.create', expect.objectContaining({ addonSyncProfileId: 2, usesPrimaryAddons: false, primaryAddonsAllowlist: null })));
});
it('restores the selected source, excludes itself, and allows unlinking', async () => {
  editor('/profiles/2/edit');
  expect(screen.getByRole('checkbox')).toBeChecked();
  expect(screen.getByRole('combobox')).toHaveValue('1');
  expect(screen.queryByRole('option', { name: 'Family' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() => expect(store.run).toHaveBeenCalledWith('profiles.update', expect.objectContaining({ id: 2, addonSyncProfileId: null })));
});
it('cannot enable sync when there is no other profile', () => {
  store.snapshot.items = [];
  editor();
  expect(screen.getByRole('checkbox')).toBeDisabled();
});
it('does not present the old one-time copy flag as a live link', () => {
  store.snapshot.items[1] = { id: 2, name: 'Family', usesPrimaryAddons: true };
  editor('/profiles/2/edit');
  expect(screen.getByRole('checkbox')).not.toBeChecked();
  expect(screen.queryByText('Use primary profile add-ons')).not.toBeInTheDocument();
});
