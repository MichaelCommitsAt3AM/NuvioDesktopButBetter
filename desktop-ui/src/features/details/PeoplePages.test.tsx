import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PersonPage } from './PersonPage';
import { EntityPage } from './EntityPage';

afterEach(cleanup);

const media = (id: string) => ({ id, type: 'movie', name: `Title ${id}`, poster: null, background: null, logo: null, description: null, releaseInfo: null, rating: null, genres: [] });
const person = { tmdbId: 7, name: 'Ada Actor', biography: 'A life on screen.', birthday: '1970-01-01', deathday: null, placeOfBirth: 'Lagos', profilePhoto: null, knownFor: 'Acting', movieCredits: [media('m1')], tvCredits: [media('t1')] };
const entity = { header: { id: 3, kind: 'company', name: 'Studio One', logo: null, originCountry: 'US', secondaryLabel: null, description: 'Makes films.' }, rails: [{ mediaType: 'movie', railType: 'popular', currentPage: 1, hasMore: true, loading: false, items: [media('e1')] }] };

const bridge = vi.hoisted(() => ({ person: null as unknown, entity: null as unknown, page: null as unknown, call: vi.fn() }));
vi.mock('../../bridge', () => ({
  useSelector: (select: (state: unknown) => unknown) => select({ session: { activeProfile: 7 }, library: { items: [] } }),
  useFeatureSnapshot: () => undefined,
  refreshFeature: vi.fn(async () => ({})),
  call: (...args: unknown[]) => bridge.call(...args),
}));

describe('PersonPage', () => {
  it('loads the biography and credit rails with back navigation', async () => {
    bridge.call.mockResolvedValue(person);
    render(<MemoryRouter initialEntries={['/person/7']}><Routes><Route path="/person/:tmdbId" element={<PersonPage />} /></Routes></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Ada Actor' })).toBeInTheDocument();
    expect(screen.getByText('A life on screen.')).toBeInTheDocument();
    expect(screen.getByText('Movies')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
    expect(bridge.call).toHaveBeenCalledWith('details.person', expect.objectContaining({ personId: 7 }));
  });

  it('retries after a failed lookup', async () => {
    bridge.call.mockRejectedValueOnce(new Error('Person details are unavailable')).mockResolvedValue(person);
    render(<MemoryRouter initialEntries={['/person/7']}><Routes><Route path="/person/:tmdbId" element={<PersonPage />} /></Routes></MemoryRouter>);
    expect(await screen.findByText('Person details are unavailable')).toBeInTheDocument();
    bridge.call.mockClear();
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByRole('heading', { name: 'Ada Actor' })).toBeInTheDocument();
  });
});

describe('EntityPage', () => {
  it('loads rails and paginates without duplicating titles', async () => {
    bridge.call.mockImplementation(async (method: string) => {
      if (method === 'details.entity') return entity;
      return { page: 2, hasMore: false, items: [media('e1'), media('e2')] };
    });
    render(<MemoryRouter initialEntries={['/entity/company/3']}><Routes><Route path="/entity/:kind/:entityId" element={<EntityPage />} /></Routes></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Studio One' })).toBeInTheDocument();
    expect(screen.getByText('Makes films.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Open Title e2' })).toHaveLength(1));
    expect(screen.getAllByRole('button', { name: 'Open Title e1' })).toHaveLength(1);
  });
});
