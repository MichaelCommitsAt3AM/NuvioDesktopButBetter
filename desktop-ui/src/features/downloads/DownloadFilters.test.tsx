import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DownloadFiltersPage } from './DownloadFilters';

vi.mock('../../bridge', () => ({ useFeatureSnapshot: () => undefined, call: vi.fn(async () => ({})), refreshFeature: vi.fn(async () => ({})) }));
afterEach(cleanup);

it('goes back to Settings by default', () => {
  render(<MemoryRouter initialEntries={['/settings/downloads']}><DownloadFiltersPage /></MemoryRouter>);
  expect(screen.getByRole('link', { name: 'Back to Settings' })).toHaveAttribute('href', '/settings');
});

it('goes back to the page that opened it', () => {
  render(<MemoryRouter initialEntries={[{ pathname: '/settings/downloads', state: { returnTo: '/library/downloads' } }]}><DownloadFiltersPage /></MemoryRouter>);
  expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/library/downloads');
});
