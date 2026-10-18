import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { SettingsLanding } from './SettingsLanding';
import { searchSettings, settingsResultDescription, settingsResultRoute, settingsSearchEntries, type SettingsSearchEntry } from './SettingsSearchEntries';
import { SettingsSearchTarget } from './SettingsSearchTarget';

const updater = vi.hoisted(() => ({ check: vi.fn().mockResolvedValue('You are up to date.') }));
vi.mock('./SettingsLayout', () => ({ settingsCategory: () => 'general' }));
vi.mock('../updater/updater', () => ({ checkForUpdates: updater.check }));
vi.mock('../../bridge', () => ({ call: vi.fn(), useSelector: () => undefined, useFeatureSnapshot: () => undefined, actions: {} }));
afterEach(cleanup);

it('matches all whitespace-separated words across all five fields in stable index order', () => {
  const entry: SettingsSearchEntry = { key: 'example', title: 'Audio', description: 'Select preferred language', page: 'Playback', section: 'Subtitles', category: 'general', route: '/settings/playback' };
  expect(searchSettings('  GENERAL\tSUBTITLES playback audio LANGUAGE ', [entry])).toEqual([entry]);
  expect(searchSettings('audio absent', [entry])).toEqual([]);
  expect(searchSettings('  ', [entry])).toEqual([]);
  expect(settingsResultDescription({ ...entry, description: '', page: 'Playback', section: 'Playback' })).toBe('Playback');
  expect(settingsResultDescription({ ...entry, description: '' })).toBe('Playback › Subtitles');
});

it('opens from the search button, shows empty results, and clears back to the category', () => {
  render(<MemoryRouter><SettingsLanding /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'Search settings' }));
  const input = screen.getByRole('textbox', { name: 'Search settings' });
  expect(input).toHaveFocus();
  fireEvent.change(input, { target: { value: 'no-such-setting-unique' } });
  expect(screen.getByText('No settings found.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
  expect(screen.getByRole('link', { name: /Layout/ })).toBeInTheDocument();
  expect(input).toHaveValue('');
});

it('supports Ctrl+F and multiple independent results leading to the same page', () => {
  const errors = vi.spyOn(console, 'error');
  render(<MemoryRouter><SettingsLanding /></MemoryRouter>);
  fireEvent.keyDown(document, { key: 'f', ctrlKey: true });
  fireEvent.change(screen.getByRole('textbox', { name: 'Search settings' }), { target: { value: 'subtitle' } });
  const results = screen.getAllByRole('link');
  expect(results.length).toBeGreaterThan(1);
  expect(results.some(link => link.getAttribute('href')?.startsWith('/settings/playback?setting='))).toBe(true);
  expect(errors.mock.calls.flat().join(' ')).not.toContain('same key');
  errors.mockRestore();
});

it('finds Size range and related Result management controls by their real destination', () => {
  expect(searchSettings('size range')[0]?.key).toBe('size-range');
  expect(searchSettings('integrations size range')[0]?.key).toBe('size-range');
  expect(searchSettings('minimum file size')[0]?.key).toBe('size-range');
  expect(searchSettings('maximum filesize')[0]?.key).toBe('size-range');
  expect(settingsResultRoute(searchSettings('size range')[0])).toBe('/settings/integrations/debrid?setting=size-range');
  expect(searchSettings('required languages').some(entry => entry.key === 'results-required-languages')).toBe(true);
  expect(searchSettings('Jellyfin')[0]?.route).toBe('/settings/integrations/servers');
  expect(searchSettings('addon')[0]?.route).toBe('/settings/content/addons');
});

it('ranks specific controls, handles synonyms, punctuation and a small typo', () => {
  expect(searchSettings('how do i change captions size')[0]?.key).toBe('subtitle-size');
  expect(searchSettings('subtile size')[0]?.key).toBe('subtitle-size');
  expect(searchSettings('add-ons').some(entry => entry.key === 'addons')).toBe(true);
  expect(searchSettings('auto play next episode').some(entry => entry.key === 'next-episode')).toBe(true);
  expect(searchSettings('unrelated gibberish').length).toBe(0);
  expect(searchSettings('logout')[0]?.key).toBe('account-sign-out');
  expect(new Set(settingsSearchEntries.map(entry => entry.key)).size).toBe(settingsSearchEntries.length);
});

it('jumps from a search result to the actual control without changing it', async () => {
  const change = vi.fn();
  render(<MemoryRouter initialEntries={['/settings']}><div className="settings-pane"><Routes>
    <Route path="/settings" element={<SettingsLanding />} />
    <Route path="/settings/integrations/debrid" element={<><button className="settings-control-row" onClick={change}><strong>Size range</strong></button><SettingsSearchTarget /></>} />
  </Routes></div></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'Search settings' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Search settings' }), { target: { value: 'size range' } });
  fireEvent.click(screen.getByRole('link', { name: /Size range/ }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Size range' })).toHaveFocus());
  expect(screen.getByRole('button', { name: 'Size range' })).toHaveClass('settings-search-target');
  expect(change).not.toHaveBeenCalled();
});

it('executes the update action from search instead of treating it as a route', async () => {
  render(<MemoryRouter><SettingsLanding /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'Search settings' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Search settings' }), { target: { value: 'check updates' } });
  fireEvent.click(screen.getByRole('button', { name: /Check for Updates/ }));
  expect(await screen.findByText('You are up to date.')).toBeInTheDocument();
  expect(updater.check).toHaveBeenCalledOnce();
});
