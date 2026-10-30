import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { IntegrationApiKeyField, TmdbSettingsPage } from './IntegrationSettings';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const state = vi.hoisted(() => ({ profile: 1, tmdb: null as unknown }));
vi.mock('../../bridge', () => ({ useSelector: (select: (value: unknown) => unknown) => select({ session: { activeProfile: state.profile } }), useFeatureSnapshot: (topic: string) => topic === 'tmdb' ? state.tmdb : undefined, call: vi.fn(), refreshFeature: vi.fn() }));
afterEach(cleanup);
const props = { title: 'Personal API key', description: 'A profile-specific key.', inputLabel: 'API key', configured: true };

it('recognizes the setup key stored by KidsScreen and replaces it through the profile editor', () => {
  state.profile = 2;
  state.tmdb = { enabled: true, hasApiKey: false, hasEffectiveApiKey: true, proxyAccess: true, language: 'en', useTrailers: false, useArtwork: true, useBasicInfo: true, useDetails: true, useCredits: false, useProductions: false, useNetworks: false, useEpisodes: true, useSeasonPosters: true, useMoreLikeThis: true, useCollections: true };
  render(<MemoryRouter initialEntries={['/settings/integrations/tmdb']}><Routes><Route path="/settings/integrations/tmdb" element={<TmdbSettingsPage />} /><Route path="/profiles/2/edit" element={<h1>Edit kids profile</h1>} /></Routes></MemoryRouter>);
  expect(screen.getByRole('status')).toHaveTextContent('Key saved');
  expect(screen.queryByLabelText('API key')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Replace key' }));
  expect(screen.getByRole('heading', { name: 'Edit kids profile' })).toBeInTheDocument();
  state.tmdb = null;
});

it('shows the saved card and cancels replacement without changing the stored key', () => {
  const save = vi.fn();
  render(<IntegrationApiKeyField {...props} onSave={save} />);
  expect(screen.getByRole('status')).toHaveTextContent('Key saved');
  expect(screen.queryByLabelText('API key')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Replace key' }));
  fireEvent.change(screen.getByLabelText('API key'), { target: { value: 'replacement' } });
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(save).not.toHaveBeenCalled();
  expect(screen.getByRole('status')).toHaveTextContent('Key saved');
});

it('returns to the saved state only after saving succeeds and retains rejected drafts', async () => {
  const save = vi.fn().mockRejectedValueOnce(new Error('Save failed')).mockResolvedValue(undefined);
  render(<IntegrationApiKeyField {...props} onSave={save} />);
  fireEvent.click(screen.getByRole('button', { name: 'Replace key' }));
  fireEvent.change(screen.getByLabelText('API key'), { target: { value: '  replacement  ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByText('Save failed')).toBeInTheDocument();
  expect(screen.getByLabelText('API key')).toHaveValue('  replacement  ');
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Key saved'));
  expect(save).toHaveBeenLastCalledWith('replacement');
});

it('discards the editor draft on profile switches even when both profiles have keys', () => {
  state.profile = 1;
  const save = vi.fn();
  const view = render(<IntegrationApiKeyField {...props} onSave={save} />);
  fireEvent.click(screen.getByRole('button', { name: 'Replace key' }));
  fireEvent.change(screen.getByLabelText('API key'), { target: { value: 'profile-1-draft' } });
  state.profile = 2;
  view.rerender(<IntegrationApiKeyField {...props} onSave={save} />);
  expect(screen.getByRole('status')).toHaveTextContent('Key saved');
  fireEvent.click(screen.getByRole('button', { name: 'Replace key' }));
  expect(screen.getByLabelText('API key')).toHaveValue('');
});
