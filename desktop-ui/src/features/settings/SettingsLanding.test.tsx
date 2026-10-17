import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SettingsLanding } from './SettingsLanding';
import { UpdateBanner } from '../updater/UpdateBanner';
import { dismissTestBanner, showTestBanner } from '../updater/updateBannerTest';

afterEach(() => { cleanup(); act(() => { dismissTestBanner(); }); vi.unstubAllEnvs(); });

describe('SettingsLanding about tools', () => {
  it('shows the preview update banner from the About test row', () => {
    vi.stubEnv('DEV', true);
    render(<MemoryRouter initialEntries={['/settings?category=about']}><SettingsLanding /><UpdateBanner /></MemoryRouter>);
    expect(screen.getByRole('button', { name: /Test update banner/ })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Preview update banner' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Test update banner/ }));
    expect(screen.getByRole('region', { name: 'Preview update banner' })).toBeInTheDocument();
    expect(screen.getByText('9.9.9 • 185 MB')).toBeInTheDocument();
  });

  it('hides the test row and prevents preview activation in production builds', () => {
    vi.stubEnv('DEV', false);
    render(<MemoryRouter initialEntries={['/settings?category=about']}><SettingsLanding /><UpdateBanner /></MemoryRouter>);
    expect(screen.queryByRole('button', { name: /Test update banner/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Check for updates/ })).toBeInTheDocument();
    act(() => { showTestBanner(); });
    expect(screen.queryByRole('region', { name: 'Preview update banner' })).toBeNull();
  });
});
