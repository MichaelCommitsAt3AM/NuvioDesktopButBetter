import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import AppRoot from './App';
import { actions, disposeBridge } from './bridge';

const bridgeMock = vi.hoisted(() => ({ homeLoading:false, rejectSelection:false, failSessionSnapshot:false, epoch:5,activeProfile:7 as number|null,sessionStatus:'signedIn',listeners: new Map<string, (event: { payload: unknown }) => void>(), requests: [] as Array<{ id: string; method: string; params: Record<string, unknown> }> }));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (name: string, callback: (event: { payload: unknown }) => void) => {
    bridgeMock.listeners.set(name, callback);
    return () => bridgeMock.listeners.delete(name);
  }),
}));
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (command: string, args?: { request?: { id: string; method: string; params: Record<string, unknown> } }) => {
    if (command === 'bridge_status') return { status: 'ready' };
    if (command === 'bridge_report_diagnostic') return undefined;
    const request = args!.request!;
    bridgeMock.requests.push(request);
    if (request.method === 'details.load') return { id: request.id, epoch: bridgeMock.epoch, result: { requestId: request.id, loading: true, error: null, media: null, episodes: [], cast: [], related: [] } };
    if (request.method === 'session.snapshot' && bridgeMock.failSessionSnapshot) throw new Error('Bridge request timed out');
    if (request.method === 'profiles.select' && bridgeMock.rejectSelection) throw new Error('Selection failed');
    const defaults: Record<string, unknown> = {
      'session.snapshot': { status: bridgeMock.sessionStatus, email: 'person@example.com', version: '1.0', activeProfile: bridgeMock.activeProfile, profiles: [{id:7,name:'Michael',color:'#1E88E5',avatarUrl:null,locked:false}], capabilities: [], error: null },
      'profiles.snapshot': { items: [{id:7,name:'Michael',avatarColorHex:'#1E88E5',avatarId:null,avatarUrl:null,backgroundId:null,backgroundUrl:null,locked:false,pinLockedUntil:null,usesPrimaryAddons:false,usesPrimaryPlugins:false,primaryAddonsAllowlist:null}], activeProfile:7, rememberLastProfileEnabled:false, maxProfiles:6, avatars:[], backgrounds:[] },
      'home.snapshot': { loading: bridgeMock.homeLoading, error: null, hero: [], shelves: [] },
      'library.snapshot': { loading: false, error: null, items: [] },
      'addons.snapshot': [],
      'settings.snapshot': { theme: 'White', themes: [{ id: 'White', label: 'White', background: '#0d0d0d', accent: '#f5f5f5', surface: '#1a1a1a' }] },
      'discover.refresh': { loading: false, typeOptions: ['movie'], selectedType: 'movie', catalogOptions: [{ key: 'cinemeta:movie:popular', addonName: 'Cinemeta', type: 'movie', catalogId: 'popular', catalogName: 'Popular', genreOptions: [], genreRequired: false, supportsPagination: true }], selectedCatalogKey: 'cinemeta:movie:popular', selectedGenre: null, genreOptions: [], items: [media('discover-popular', 'Discover popular title')], hasMore: false, emptyStateReason: null, error: null },
      'discover.snapshot': { loading: false, typeOptions: ['movie'], selectedType: 'movie', catalogOptions: [{ key: 'cinemeta:movie:popular', addonName: 'Cinemeta', type: 'movie', catalogId: 'popular', catalogName: 'Popular', genreOptions: [], genreRequired: false, supportsPagination: true }], selectedCatalogKey: 'cinemeta:movie:popular', selectedGenre: null, genreOptions: [], items: [media('discover-popular', 'Discover popular title')], hasMore: false, emptyStateReason: null, error: null },
      'search.historySnapshot': { enabled: true, items: ['A recent movie'] },
    };
    return { id: request.id, epoch: bridgeMock.epoch, result: defaults[request.method] ?? null };
  }),
}));

function emit(event: unknown) { bridgeMock.listeners.get('bridge:event')?.({ payload: event }); }
const media = (id: string, name: string) => ({ id, type: 'movie', name, poster: null, background: null, logo: null, description: null, releaseInfo: null, rating: null, genres: [] });

describe('desktop bridge UI workflow', () => {
  beforeEach(() => { window.history.replaceState({}, '', '/'); bridgeMock.homeLoading=false;bridgeMock.rejectSelection=false;bridgeMock.failSessionSnapshot=false;bridgeMock.epoch=5;bridgeMock.activeProfile=7;bridgeMock.sessionStatus='signedIn';bridgeMock.listeners.clear(); bridgeMock.requests.length = 0; });

  it('leaves the startup screen and reports an error when session restoration fails', async () => {
    bridgeMock.failSessionSnapshot=true;
    render(<AppRoot />);
    expect(await screen.findByText('Unable to restore the session: Bridge request timed out')).toBeInTheDocument();
    expect(screen.queryByText('Starting Nuvio…')).not.toBeInTheDocument();
  });

  it('skips the picker when the only profile is already selected', async () => {
    render(<AppRoot />);
    expect(await screen.findByText('Your home is ready for content')).toBeInTheDocument();
    expect(screen.queryByText("Who's watching?")).not.toBeInTheDocument();
    expect(bridgeMock.requests.some(request => request.method === 'profiles.select')).toBe(false);
  });

  it('automatically selects the only unlocked profile when none is active', async () => {
    bridgeMock.activeProfile=null;
    render(<AppRoot />);
    expect(await screen.findByText('Your home is ready for content')).toBeInTheDocument();
    expect(screen.queryByText("Who's watching?")).not.toBeInTheDocument();
    expect(bridgeMock.requests.some(request => request.method === 'profiles.select' && request.params.id === 7)).toBe(true);
  });
  afterEach(() => { cleanup(); disposeBridge(); });

  it('keeps the branded profile overlay until Home is ready, then fades it out', async () => {
    render(<AppRoot />);
    await screen.findByText('Your home is ready for content');
    bridgeMock.homeLoading=true;
    await act(async()=>{await actions.selectProfile(7);});
    expect(screen.getByRole('status',{name:'Loading profile'})).toBeInTheDocument();
    expect(within(screen.getByRole('status',{name:'Loading profile'})).getByRole('img',{name:'Nuvio'})).toBeInTheDocument();
    await act(async()=>{emit({topic:'home',epoch:5,revision:10,data:{loading:false,error:null,hero:[],shelves:[]}});});
    await waitFor(()=>expect(screen.queryByRole('status',{name:'Loading profile'})).not.toBeInTheDocument());
  });

  it('dismisses the profile overlay and preserves the session on selection failure', async () => {
    render(<AppRoot />);
    await screen.findByText('Your home is ready for content');
    bridgeMock.rejectSelection=true;
    await act(async()=>{await expect(actions.selectProfile(7)).rejects.toThrow('Selection failed');});
    expect(screen.queryByRole('status',{name:'Loading profile'})).not.toBeInTheDocument();
    expect(screen.getByText('Your home is ready for content')).toBeInTheDocument();
  });

  it('reconciles authentication completing in a newer epoch without requiring a reload', async () => {
    bridgeMock.sessionStatus='loading';
    render(<AppRoot />);
    await waitFor(()=>expect(bridgeMock.requests.some(request=>request.method==='home.snapshot')).toBe(true));
    expect(screen.getByText('Starting Nuvio…')).toBeInTheDocument();
    bridgeMock.sessionStatus='signedIn';bridgeMock.epoch=6;
    emit({topic:'session',epoch:6,revision:1,data:{status:'signedIn',email:'person@example.com',version:'1.0',activeProfile:7,profiles:[],capabilities:[],error:null}});
    expect(await screen.findByText('Your home is ready for content')).toBeInTheDocument();
  });

  it('uses current profile epoch and the newest revision for catalog updates', async () => {
    render(<AppRoot />);
    await screen.findByText('Your home is ready for content');
    emit({ topic: 'home', epoch: 5, revision: 4, data: { loading: false, error: null, hero: [], shelves: [{ key: 'fresh', title: 'Fresh shelf', subtitle: '', items: [media('fresh-1', 'Fresh title')], hasMore: false }] } });
    expect(await screen.findByText('Fresh shelf')).toBeInTheDocument();

    emit({ topic: 'home', epoch: 5, revision: 3, data: { loading: false, error: null, hero: [], shelves: [{ key: 'old', title: 'Older shelf', subtitle: '', items: [], hasMore: false }] } });
    emit({ topic: 'home', epoch: 4, revision: 99, data: { loading: false, error: null, hero: [], shelves: [{ key: 'stale', title: 'Stale profile', subtitle: '', items: [], hasMore: false }] } });
    expect(screen.queryByText('Older shelf')).not.toBeInTheDocument();
    expect(screen.queryByText('Stale profile')).not.toBeInTheDocument();
    expect(bridgeMock.requests.find((request) => request.method === 'home.snapshot')).toBeDefined();
  });

  it('shows only the search result correlated to the active bridge request id', async () => {
    render(<AppRoot />);
    await screen.findByText('Your home is ready for content');
    fireEvent.click(screen.getByRole('link', { name: /search/i }));
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search movies and shows' }), { target: { value: 'Arrival' } });
    await waitFor(() => expect(bridgeMock.requests.some((request) => request.method === 'search.start')).toBe(true));
    const searchRequest = bridgeMock.requests.find((request) => request.method === 'search.start')!;
    emit({ topic: 'search', epoch: 5, revision: 1, data: { requestId: 'another-request', query: 'Arrival', loading: false, error: null, shelves: [{ key: 'wrong', title: 'Wrong results', subtitle: '', items: [], hasMore: false }] } });
    expect(screen.queryByText('Wrong results')).not.toBeInTheDocument();
    emit({ topic: 'search', epoch: 5, revision: 2, data: { requestId: searchRequest.id, query: 'Arrival', loading: false, error: null, shelves: [{ key: 'right', title: 'Search results', subtitle: '', items: [media('arrival', 'Arrival')], hasMore: false }] } });
    expect(await screen.findByText('Search results')).toBeInTheDocument();
    expect((await screen.findAllByText('Arrival')).length).toBeGreaterThan(0);
  });

  it('keeps search skeletons visible immediately while the user is typing', async () => {
    render(<AppRoot />);
    await screen.findByText('Your home is ready for content');
    fireEvent.click(screen.getByRole('link', { name: /search/i }));
    const input = await screen.findByRole('searchbox', { name: 'Search movies and shows' });
    fireEvent.change(input, { target: { value: 'Arr' } });
    expect(screen.getByRole('status', { name: 'Searching' })).toBeInTheDocument();
    expect(screen.queryByText('No results found')).not.toBeInTheDocument();
  });

  it('requests title details once when Strict Mode replays the route mount effect', async () => {
    render(<React.StrictMode><AppRoot /></React.StrictMode>);
    await screen.findByText('Your home is ready for content');
    await act(async () => {
      emit({ topic: 'home', epoch: 5, revision: 50, data: { loading: false, error: null, hero: [], shelves: [{ key: 'test', title: 'Test', subtitle: '', items: [media('details-test', 'Details test title')], hasMore: false }] } });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Open Details test title' }));
    await waitFor(() => expect(bridgeMock.requests.filter((request) => request.method === 'details.load')).toHaveLength(1));
    expect(await screen.findByText('Loading title…')).toBeInTheDocument();
  });

  it('refreshes Discover on entry and keeps its posters visible with recent searches open', async () => {
    render(<AppRoot />);
    await screen.findByText('Your home is ready for content');
    fireEvent.click(screen.getByRole('link', { name: /search/i }));
    expect(await screen.findByRole('heading', { name: 'Discover' })).toBeInTheDocument();
    expect((await screen.findAllByText('Discover popular title')).length).toBeGreaterThan(0);
    expect(bridgeMock.requests.some((request) => request.method === 'discover.refresh')).toBe(true);

    fireEvent.focus(screen.getByRole('searchbox', { name: 'Search movies and shows' }));
    expect(await screen.findByRole('heading', { name: 'Recent searches' })).toBeInTheDocument();
    expect(screen.getByText('A recent movie')).toBeInTheDocument();
    expect(screen.getAllByText('Discover popular title').length).toBeGreaterThan(0);
  });
});
