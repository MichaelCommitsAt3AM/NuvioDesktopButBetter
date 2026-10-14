import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SettingsLanding } from './SettingsLanding';
import { UpdateBanner } from '../updater/UpdateBanner';
import { dismissTestBanner } from '../updater/updateBannerTest';

afterEach(() => { cleanup(); act(() => { dismissTestBanner(); }); });

describe('SettingsLanding about tools', () => {
  it('shows the preview update banner from the About test row', () => {
    render(<MemoryRouter initialEntries={['/settings?category=about']}><SettingsLanding /><UpdateBanner /></MemoryRouter>);
    expect(screen.getByRole('button', { name: /Test update banner/ })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Preview update banner' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Test update banner/ }));
    expect(screen.getByRole('region', { name: 'Preview update banner' })).toBeInTheDocument();
    expect(screen.getByText('9.9.9 • 185 MB')).toBeInTheDocument();
  });
});
