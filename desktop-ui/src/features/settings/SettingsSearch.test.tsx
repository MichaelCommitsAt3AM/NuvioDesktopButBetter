import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SettingsLanding } from './SettingsLanding';
import { searchSettings, settingsResultDescription, type SettingsSearchEntry } from './SettingsSearchEntries';

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
  expect(settingsResultDescription({ ...entry, description: '' })).toBe('Playback - Subtitles');
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
  expect(results.some(link => link.getAttribute('href') === '/settings/playback')).toBe(true);
  expect(errors.mock.calls.flat().join(' ')).not.toContain('same key');
  errors.mockRestore();
});

it('executes the update action from search instead of treating it as a route', async () => {
  render(<MemoryRouter><SettingsLanding /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'Search settings' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Search settings' }), { target: { value: 'check updates' } });
  fireEvent.click(screen.getByRole('button', { name: /Check for Updates/ }));
  expect(await screen.findByText('You are up to date.')).toBeInTheDocument();
  expect(updater.check).toHaveBeenCalledOnce();
});
