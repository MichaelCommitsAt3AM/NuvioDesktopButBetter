import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { flushSync } from 'react-dom';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import AppRoot from './App';
import { actions, call, disposeBridge, getSnapshot } from './bridge';
import { isAutomaticStreamSelectionEnabled, streamAddonNames } from './features/streams/StreamsPage';
import type { Addons } from './generated/contract';

const bridgeMock = vi.hoisted(() => ({ networkCondition: undefined as string | undefined, deferPlayback:false, deferProfiles:false, multipleProfiles:false, homeLoading:false, rejectSelection:false, failSessionSnapshot:false, failSignOut:false, streamAutoPlayMode:'MANUAL', epoch:5,activeProfile:7 as number|null,sessionStatus:'signedIn',listeners: new Map<string, (event: { payload: unknown }) => void>(), requests: [] as Array<{ id: string; method: string; params: Record<string, unknown> }> }));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (name: string, callback: (event: { payload: unknown }) => void) => {
    bridgeMock.listeners.set(name, callback);
    return () => bridgeMock.listeners.delete(name);
  }),
}));
vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => false,
  invoke: vi.fn(async (command: string, args?: { request?: { id: string; method: string; params: Record<string, unknown> } }) => {
    if (command === 'bridge_status') return { status: 'ready' };
    if (command === 'bridge_report_diagnostic') return undefined;
    const request = args!.request!;
    bridgeMock.requests.push(request);
    if (request.method === 'details.load') return { id: request.id, epoch: bridgeMock.epoch, result: { requestId: request.id, loading: true, error: null, media: null, episodes: [], cast: [], related: [] } };
    if (request.method === 'streams.load') {
      if (request.params.videoId === 'event-first') emit({ topic: 'streams', epoch: bridgeMock.epoch, revision: 500, data: { requestId: request.id, loading: false, error: null, groups: [] } });
      return { id: request.id, epoch: bridgeMock.epoch, result: { requestId: request.id, loading: bridgeMock.streamAutoPlayMode !== 'MANUAL', error: null, groups: [] } };
    }
    if (request.method === 'session.snapshot' && bridgeMock.failSessionSnapshot) throw new Error('Bridge request timed out');
    if ((request.method === 'profiles.select' || request.method === 'profiles.delete') && !bridgeMock.rejectSelection) {
      bridgeMock.epoch += 1;
      return { id: request.id, epoch: bridgeMock.epoch, result: null };
    }
    if (request.method === 'session.signOut') {
      bridgeMock.sessionStatus = 'signedOut';
      bridgeMock.epoch += 1;
      if (bridgeMock.failSignOut) return { id: request.id, epoch: bridgeMock.epoch, error: { code: 'BRIDGE_ERROR', message: 'The operation could not be completed.' } };
      return { id: request.id, epoch: bridgeMock.epoch, result: { status: 'signedOut', email: null, version: '1.0', activeProfile: null, profiles: [], capabilities: [], error: null } };
    }
    if (request.method === 'profiles.select' && bridgeMock.rejectSelection) throw new Error('Selection failed');
    if (request.method === 'playback.start') return bridgeMock.deferPlayback ? new Promise(() => {}) : { id: request.id, epoch: bridgeMock.epoch, result: { started: true, host: 'tauri-window' } };
    if (request.method === 'profiles.snapshot' && bridgeMock.deferProfiles) return new Promise(() => {});
    const cachedProfiles = [{id:7,name:'Michael',color:'#1E88E5',avatarUrl:null,locked:false}, ...(bridgeMock.multipleProfiles ? [{id:8,name:'Guest',color:'#FF0000',avatarUrl:null,locked:true}] : [])];
    const defaults: Record<string, unknown> = {
      'session.snapshot': { networkCondition: bridgeMock.networkCondition, status: bridgeMock.sessionStatus, email: 'person@example.com', version: '1.0', activeProfile: bridgeMock.activeProfile, profiles: cachedProfiles, capabilities: [], error: null },
      'downloads.snapshot': { items: [], hasUnseenCompleted: false, filter: {} },
      'details.watched.snapshot': { loaded: true, watched: false, fullyWatched: false },
      'details.watched.toggle': { loaded: true, watched: true, fullyWatched: false },
      'profiles.snapshot': { items: [{id:7,name:'Michael',avatarColorHex:'#1E88E5',avatarId:null,avatarUrl:null,backgroundId:null,backgroundUrl:null,locked:false,pinLockedUntil:null,usesPrimaryAddons:false,usesPrimaryPlugins:false,primaryAddonsAllowlist:null}], activeProfile:7, rememberLastProfileEnabled:false, maxProfiles:6, avatars:[], backgrounds:[] },
      'home.snapshot': { loading: bridgeMock.homeLoading, error: null, hero: [], shelves: [] },
      'library.snapshot': { loading: false, error: null, items: [] },
      'addons.snapshot': [],
      'settings.snapshot': { theme: 'White', themes: [{ id: 'White', label: 'White', background: '#0D0D0D', accent: '#F5F5F5', surface: '#222222', settingsSurface: '#1A1A1A', accentVariant: '#E0E0E0', onAccent: '#111111', onAccentVariant: '#111111', focusRing: '#FFFFFF', focusBackground: '#303030', accentGradient: ['#F5F5F5'], nativeAccent: '#F5F5F5' }] },
      'discover.refresh': { loading: false, typeOptions: ['movie', 'series'], selectedType: 'movie', catalogOptions: [{ key: 'cinemeta:movie:popular', addonName: 'Cinemeta', type: 'movie', catalogId: 'popular', catalogName: 'Popular', genreOptions: ['Action'], genreRequired: false, supportsPagination: true }, { key: 'cinemeta:movie:top', addonName: 'Cinemeta', type: 'movie', catalogId: 'top', catalogName: 'Top', genreOptions: ['Action'], genreRequired: false, supportsPagination: true }], selectedCatalogKey: 'cinemeta:movie:popular', selectedGenre: null, genreOptions: ['Action'], items: [media('discover-popular', 'Discover popular title')], hasMore: false, emptyStateReason: null, error: null },
      'discover.snapshot': { loading: false, typeOptions: ['movie', 'series'], selectedType: 'movie', catalogOptions: [{ key: 'cinemeta:movie:popular', addonName: 'Cinemeta', type: 'movie', catalogId: 'popular', catalogName: 'Popular', genreOptions: ['Action'], genreRequired: false, supportsPagination: true }, { key: 'cinemeta:movie:top', addonName: 'Cinemeta', type: 'movie', catalogId: 'top', catalogName: 'Top', genreOptions: ['Action'], genreRequired: false, supportsPagination: true }], selectedCatalogKey: 'cinemeta:movie:popular', selectedGenre: null, genreOptions: ['Action'], items: [media('discover-popular', 'Discover popular title')], hasMore: false, emptyStateReason: null, error: null },
      'search.historySnapshot': { enabled: true, items: ['A recent movie'] },
      'playbackSettings.snapshot': { showPlayerLoadingStatus: true, streamAutoPlayMode: bridgeMock.streamAutoPlayMode, streamAutoPlayRegex: '2160p' },
    };
    return { id: request.id, epoch: bridgeMock.epoch, result: defaults[request.method] ?? null };
  }),
}));

function emit(event: unknown) { bridgeMock.listeners.get('bridge:event')?.({ payload: event }); }
const media = (id: string, name: string) => ({ id, type: 'movie', name, poster: null, background: null, logo: null, description: null, releaseInfo: null, rating: null, genres: [] });

async function openPreparedStream() {
  window.history.pushState({}, '', '/details/movie/warmup/streams/warmup?manual=true');
  const view = render(<AppRoot />);
  await waitFor(() => expect(bridgeMock.requests.some(request => request.method === 'streams.load')).toBe(true));
  const request = bridgeMock.requests.find(request => request.method === 'streams.load')!;
  await act(async () => emit({ topic: 'streams', epoch: bridgeMock.epoch, revision: 900, data: {
    requestId: request.id, loading: false, error: null,
    groups: [{ id: 'source', name: 'Source', loading: false, error: null, streams: [{
      id: 'prepared', name: 'Warmup stream', description: '', url: 'https://example.invalid/media', source: 'Source',
      headers: {}, infoHash: null, fileIndex: null, playable: true, downloadable: false,
      presentation: { resolvingDebrid: true },
    }] }],
  } }));
  fireEvent.click(await screen.findByRole('button', { name: /Warmup stream/ }));
  await waitFor(() => expect(bridgeMock.requests.some(request => request.method === 'playback.start')).toBe(true));
  return view;
}

describe('desktop bridge UI workflow', () => {
  beforeEach(() => { window.history.replaceState({}, '', '/'); bridgeMock.networkCondition=undefined;bridgeMock.deferPlayback=false;bridgeMock.deferProfiles=false;bridgeMock.multipleProfiles=false;bridgeMock.homeLoading=false;bridgeMock.rejectSelection=false;bridgeMock.failSessionSnapshot=false;bridgeMock.failSignOut=false;bridgeMock.streamAutoPlayMode='MANUAL';bridgeMock.epoch=5;bridgeMock.activeProfile=7;bridgeMock.sessionStatus='signedIn';bridgeMock.listeners.clear(); bridgeMock.requests.length = 0; });

  it('defers the rewrite welcome until Home is visible after profile selection', async () => {
    const key = 'nuvio.rewrite-welcome.v1';
    const previous = localStorage.getItem(key);
    localStorage.removeItem(key);
    try {
      bridgeMock.multipleProfiles = true;
      render(<AppRoot />);
      expect(await screen.findByText("Who's watching?")).toBeInTheDocument();
      expect(screen.queryByRole('dialog', { name: 'Welcome to the new Nuvio' })).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: /Michael/ }));
      expect(await screen.findByRole('dialog', { name: 'Welcome to the new Nuvio' })).toBeInTheDocument();
      expect(screen.queryByText("Who's watching?")).toBeNull();
      expect(screen.queryByRole('status', { name: 'Loading profile' })).toBeNull();
      expect(window.location.pathname).toBe('/');
      fireEvent.click(screen.getByRole('button', { name: "Let's explore" }));
      expect(localStorage.getItem(key)).toBe('seen');
    } finally { if (previous === null) localStorage.removeItem(key); else localStorage.setItem(key, previous); }
  });

  it('opens Search and focuses its field on a double-click from Home', async () => {
    render(<AppRoot />);
    fireEvent.doubleClick(await screen.findByRole('link', { name: 'Search' }));
    const input = await screen.findByRole('searchbox', { name: 'Search movies and shows' });
    await waitFor(() => expect(input).toHaveFocus());
    expect(window.location.pathname).toBe('/search');
    fireEvent.change(input, { target: { value: 'Keep my query' } });
    input.blur();
    fireEvent.doubleClick(screen.getByRole('link', { name: 'Search' }));
    await waitFor(() => expect(input).toHaveFocus());
    expect(input).toHaveValue('Keep my query');
  });

  it('does not focus Search on a single navigation click', async () => {
    render(<AppRoot />);
    fireEvent.click(await screen.findByRole('link', { name: 'Search' }));
    const input = await screen.findByRole('searchbox', { name: 'Search movies and shows' });
    expect(input).not.toHaveFocus();
    fireEvent.doubleClick(screen.getByRole('link', { name: 'Search' }));
    await waitFor(() => expect(input).toHaveFocus());
  });

  it('opens Downloads directly when the native startup check reports no internet, without waiting for auth', async () => {
    bridgeMock.networkCondition = 'NoInternet';
    bridgeMock.sessionStatus = 'loading';
    bridgeMock.multipleProfiles = true;
    render(<AppRoot />);
    expect(await screen.findByRole('heading', { name: 'Downloads' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/library/downloads');
    expect(screen.queryByText("Who's watching?")).toBeNull();
    expect(bridgeMock.requests.some(request => request.method === 'home.resumePrompt.consume')).toBe(false);
  });

  it('keeps normal startup on a server outage and does not redirect when internet is lost later', async () => {
    bridgeMock.networkCondition = 'ServersUnreachable';
    render(<AppRoot />);
    await waitFor(() => expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument());
    expect(window.location.pathname).toBe('/');
    await act(async () => emit({ topic: 'session', epoch: bridgeMock.epoch, revision: 999, data: { ...getSnapshot().session, networkCondition: 'NoInternet' } }));
    expect(window.location.pathname).toBe('/');
  });

  it('opens Downloads from the browser offline-at-launch signal while the native probe is checking', async () => {
    const online = vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    try {
      bridgeMock.networkCondition = 'Checking';
      render(<AppRoot />);
      expect(await screen.findByRole('heading', { name: 'Downloads' })).toBeInTheDocument();
      expect(window.location.pathname).toBe('/library/downloads');
    } finally { online.mockRestore(); }
  });

  it('waits for a checking startup probe, then opens Downloads when the offline result arrives', async () => {
    bridgeMock.networkCondition = 'Checking';
    render(<AppRoot />);
    await waitFor(() => expect(getSnapshot().session.networkCondition).toBe('Checking'));
    expect(screen.queryByRole('link', { name: 'Home' })).toBeNull();
    await act(async () => emit({ topic: 'session', epoch: bridgeMock.epoch, revision: 999, data: { ...getSnapshot().session, networkCondition: 'NoInternet' } }));
    expect(await screen.findByRole('heading', { name: 'Downloads' })).toBeInTheDocument();
  });

  it('cancels a resolving player immediately when Back is pressed', async () => {
    bridgeMock.deferPlayback = true;
    await openPreparedStream();
    fireEvent.click(await screen.findByRole('button', { name: 'Back' }));
    await waitFor(() => expect(bridgeMock.requests.filter(request => request.method === 'playback.stop')).toHaveLength(1));
  });

  it('keeps stream loading mounted while the native player prepares its presentation', async () => {
    bridgeMock.deferPlayback = true;
    await openPreparedStream();
    await act(async () => emit({ topic: 'playback', epoch: bridgeMock.epoch, revision: 901,
      data: { state: 'starting', phase: 'preparing', active: true, error: null } }));
    expect(await screen.findByText('Building player…')).toBeInTheDocument();
    expect(screen.queryByLabelText('Player')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close player' }));
    await waitFor(() => expect(bridgeMock.requests.filter(request => request.method === 'playback.stop')).toHaveLength(1));
  });

  it('cancels a prepared player if the stream page is unmounted', async () => {
    bridgeMock.deferPlayback = true;
    const view = await openPreparedStream();
    view.unmount();
    await waitFor(() => expect(bridgeMock.requests.filter(request => request.method === 'playback.stop')).toHaveLength(1));
  });

  it('keeps the player running when successful handoff unmounts the stream page', async () => {
    await openPreparedStream();
    expect(await screen.findByLabelText('Player')).toBeInTheDocument();
    expect(bridgeMock.requests.some(request => request.method === 'playback.stop')).toBe(false);
  });

  it('shows cached profiles while the cosmetic snapshot is still pending and accepts cloud profile updates', async () => {
    bridgeMock.multipleProfiles = true;
    bridgeMock.deferProfiles = true;
    render(<AppRoot />);
    expect(await screen.findByText("Who's watching?")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Guest/ })).toBeInTheDocument();
    await waitFor(() => expect(bridgeMock.requests.some(request => request.method === 'profiles.snapshot')).toBe(true));
    await act(async () => emit({ topic: 'session', epoch: bridgeMock.epoch, revision: 700,
      data: { ...getSnapshot().session, profiles: [{ ...getSnapshot().session.profiles[0], name: 'Updated name' }] } }));
    expect(await screen.findByRole('button', { name: /Updated name/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Guest/ })).not.toBeInTheDocument();
  });

  it('opens the only cached profile without waiting for avatar choices', async () => {
    bridgeMock.deferProfiles = true;
    render(<AppRoot />);
    expect(await screen.findByText('Your home is ready for content')).toBeInTheDocument();
    expect(screen.queryByText("Who's watching?")).not.toBeInTheDocument();
  });

  it('routes to the login screen after sign out', async () => {
    render(<AppRoot />);
    await screen.findByText('Your home is ready for content');
    await act(async () => { await actions.signOut(); });
    expect(await screen.findByText('Welcome Back')).toBeInTheDocument();
    expect(getSnapshot().session.status).toBe('signedOut');
  });

  it('still routes to the login screen when sign-out reports an error but cleared the session', async () => {
    render(<AppRoot />);
    await screen.findByText('Your home is ready for content');
    bridgeMock.failSignOut = true;
    await act(async () => { await actions.signOut(); });
    expect(await screen.findByText('Welcome Back')).toBeInTheDocument();
    expect(getSnapshot().session.status).toBe('signedOut');
  });
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

  it('issues a new stream request on every manual entry and accepts its snapshot without events', async () => {
    render(<AppRoot />);
    await screen.findByText('Your home is ready for content');
    for (const title of ['ted', 'ted', 'spider']) {
      await act(async () => { await actions.loadStreams('movie', title, title, undefined, undefined, true); });
      expect(getSnapshot().streams.loading).toBe(false);
      const request = bridgeMock.requests.filter(item => item.method === 'streams.load').at(-1)!;
      expect(getSnapshot().streams.requestId).toBe(request.id);
      expect(request.params.manualSelection).toBe(true);
    }
    const ids = bridgeMock.requests.filter(item => item.method === 'streams.load').map(item => item.id);
    expect(new Set(ids).size).toBe(3);
  });

  it('issues a new stream request for every autoplay start of the same movie', async () => {
    render(<AppRoot />);
    await screen.findByText('Your home is ready for content');
    for (let attempt = 0; attempt < 2; attempt++) {
      await act(async () => { await actions.loadStreams('movie', 'ted', 'ted'); });
      const requests = bridgeMock.requests.filter(item => item.method === 'streams.load');
      expect(requests).toHaveLength(attempt + 1);
      expect(requests.at(-1)!.params.manualSelection).toBe(false);
      expect(getSnapshot().streams.requestId).toBe(requests.at(-1)!.id);
    }
  });

  it('keeps a completed stream event when an older loading response arrives afterwards', async () => {
    render(<AppRoot />);
    await screen.findByText('Your home is ready for content');
    bridgeMock.streamAutoPlayMode = 'FIRST_STREAM';
    await act(async () => { await actions.loadStreams('movie', 'event-first', 'event-first'); });
    expect(getSnapshot().streams.loading).toBe(false);
  });

  it('opens Home with shimmer cards while the home snapshot is still loading', async () => {
    render(<AppRoot />);
    await screen.findByText('Your home is ready for content');
    bridgeMock.homeLoading=true;
    await act(async()=>{await actions.selectProfile(7);});
    expect(await screen.findByRole('status',{name:'Loading titles'})).toBeInTheDocument();
    await waitFor(()=>expect(screen.queryByRole('status',{name:'Loading profile'})).not.toBeInTheDocument());
    expect(screen.queryByText('Loading your home…')).not.toBeInTheDocument();
    await act(async()=>{emit({topic:'home',epoch:bridgeMock.epoch,revision:10,data:{loading:false,error:null,hero:[],shelves:[]}});});
    expect(await screen.findByText('Your home is ready for content')).toBeInTheDocument();
  });

  it('returns to the previous search results after viewing a title', async () => {
    window.history.pushState({}, '', '/search');
    render(<AppRoot />);
    const input = await screen.findByRole('searchbox', { name: 'Search movies and shows' });
    fireEvent.change(input, { target: { value: 'Arrival' } });
    await waitFor(() => expect(bridgeMock.requests.some((request) => request.method === 'search.start')).toBe(true));
    const searchRequest = bridgeMock.requests.find((request) => request.method === 'search.start')!;
    await act(async () => { emit({ topic: 'search', epoch: bridgeMock.epoch, revision: 965, data: { requestId: searchRequest.id, query: 'Arrival', loading: false, error: null, shelves: [{ key: 'results', title: 'Search results', subtitle: '', items: [media('arrival', 'Arrival')], hasMore: false }] } }); });
    expect(await screen.findByText('Search results')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Open Arrival' }));
    await waitFor(() => expect(bridgeMock.requests.some((request) => request.method === 'details.load')).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    const restored = await screen.findByRole('searchbox', { name: 'Search movies and shows' });
    expect((restored as HTMLInputElement).value).toBe('Arrival');
    expect(await screen.findByText('Search results')).toBeInTheDocument();
    expect(bridgeMock.requests.filter((request) => request.method === 'search.start')).toHaveLength(1);
  });

  it('scrolls to the top as soon as typing begins in scrolled Discover, before debounce', async () => {
    window.history.pushState({}, '', '/search');
    render(<AppRoot />);
    const input = await screen.findByRole('searchbox', { name: 'Search movies and shows' });
    const main = document.querySelector<HTMLElement>('.main-area')!;
    main.scrollTop = 1800;
    fireEvent.scroll(main);
    fireEvent.change(input, { target: { value: 'Arrival' } });
    expect(main.scrollTop).toBe(0);
    expect(bridgeMock.requests.some(request => request.method === 'search.start')).toBe(false);
    await waitFor(() => expect(bridgeMock.requests.some(request => request.method === 'search.start')).toBe(true));
    const request = bridgeMock.requests.find(request => request.method === 'search.start')!;
    await act(async () => emit({ topic: 'search', epoch: bridgeMock.epoch, revision: 965, data: { requestId: request.id, query: 'Arrival', loading: false, error: null, shelves: [{ key: 'results', title: 'Search results', subtitle: '', items: [media('arrival', 'Arrival')], hasMore: false }] } }));
    expect(main.scrollTop).toBe(0);
  });

  it('restores Discover scroll after viewing a title despite the shared route scroller', async () => {
    window.history.pushState({}, '', '/search');
    render(<AppRoot />);
    const card = await screen.findByRole('button', { name: 'Open Discover popular title' });
    const main = document.querySelector<HTMLElement>('.main-area')!;
    main.scrollTop = 1250;
    fireEvent.scroll(main);
    fireEvent.click(card);
    await waitFor(() => expect(bridgeMock.requests.some(request => request.method === 'details.load')).toBe(true));
    expect(main.scrollTop).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await screen.findByRole('searchbox', { name: 'Search movies and shows' });
    expect(main.scrollTop).toBe(1250);
    expect(screen.getByRole('searchbox', { name: 'Search movies and shows' })).toHaveValue('');
  });

  it('scrolls to the top immediately when selecting a recent query in Discover', async () => {
    window.history.pushState({}, '', '/search');
    render(<AppRoot />);
    const input = await screen.findByRole('searchbox', { name: 'Search movies and shows' });
    fireEvent.focus(input);
    const recent = await screen.findByRole('button', { name: 'A recent movie' });
    const main = document.querySelector<HTMLElement>('.main-area')!;
    main.scrollTop = 1400;
    fireEvent.click(recent);
    expect(main.scrollTop).toBe(0);
    expect(input).toHaveValue('A recent movie');
  });

  it.each(['button', 'Escape', 'delete'])('returns to Discover after clearing via %s and viewing a Discover title', async method => {
    window.history.pushState({}, '', '/search');
    render(<AppRoot />);
    const input = await screen.findByRole('searchbox', { name: 'Search movies and shows' });
    fireEvent.change(input, { target: { value: 'Arrival' } });
    await waitFor(() => expect(bridgeMock.requests.some(request => request.method === 'search.start')).toBe(true));
    const request = bridgeMock.requests.find(request => request.method === 'search.start')!;
    await act(async () => emit({ topic: 'search', epoch: bridgeMock.epoch, revision: 965, data: { requestId: request.id, query: 'Arrival', loading: false, error: null, shelves: [{ key: 'results', title: 'Search results', subtitle: '', items: [media('arrival', 'Arrival')], hasMore: false }] } }));
    if (method === 'button') fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    else if (method === 'Escape') fireEvent.keyDown(input, { key: 'Escape' });
    else fireEvent.change(input, { target: { value: '' } });
    expect(getSnapshot().search.query).toBe('');
    expect(getSnapshot().search.requestId).not.toBe(request.id);
    // Even an in-flight result arriving after clear cannot bring the old search back.
    await act(async () => emit({ topic: 'search', epoch: bridgeMock.epoch, revision: 966, data: { requestId: request.id, query: 'Arrival', loading: false, error: null, shelves: [] } }));
    expect(getSnapshot().search.query).toBe('');
    fireEvent.click(await screen.findByRole('button', { name: 'Open Discover popular title' }));
    await waitFor(() => expect(bridgeMock.requests.some(request => request.method === 'details.load')).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByRole('searchbox', { name: 'Search movies and shows' })).toHaveValue('');
    expect(screen.getByRole('heading', { name: 'Discover' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Search results' })).toBeNull();
  });

  it('preserves an empty selected hero when unrelated shelf titles are available', async () => {
    render(<AppRoot />);
    await screen.findByText('Your home is ready for content');
    const items = Array.from({ length: 20 }, (_, index) => media(`shelf-${index}`, `Shelf title ${index}`));
    await act(async () => { emit({ topic: 'home', epoch: bridgeMock.epoch, revision: 960, data: { loading: false, error: null, hero: [], shelves: [{ key: 'shelf', title: 'Shelf', subtitle: '', items, hasMore: false }] } }); });
    expect(await screen.findByText('Shelf')).toBeInTheDocument();
    expect(document.querySelector('.home-hero')).toBeNull();
  });

  it('accepts epoch-changing responses instead of discarding them', async () => {
    render(<AppRoot />);
    await screen.findByText('Your home is ready for content');
    await act(async () => {
      await call('profiles.select', { id: 7 });
      await call('session.signOut', {});
    });
    const select = bridgeMock.requests.find((request) => request.method === 'profiles.select') as unknown as { epoch?: number };
    expect(select.epoch).toBe(5);
    const signOut = bridgeMock.requests.find((request) => request.method === 'session.signOut') as unknown as { epoch?: number };
    expect(signOut.epoch).toBe(6);
    expect(getSnapshot().session.error).toBeNull();
  });

  it('forwards the new epoch after profile selection', async () => {
    render(<AppRoot />);
    await screen.findByText('Your home is ready for content');
    await act(async () => { await actions.selectProfile(7); });
    expect(getSnapshot().session.error).toBeNull();
    const snapshots = bridgeMock.requests.filter((request) => request.method === 'home.snapshot') as unknown as Array<{ epoch?: number }>;
    expect(snapshots.length).toBeGreaterThan(1);
    expect(snapshots.at(-1)?.epoch).toBe(bridgeMock.epoch);
  });

  it('dismisses the profile overlay and preserves the session on selection failure', async () => {
    render(<AppRoot />);
    await screen.findByText('Your home is ready for content');
    bridgeMock.rejectSelection=true;
    await act(async()=>{await expect(actions.selectProfile(7)).rejects.toThrow('Selection failed');});
    expect(screen.queryByRole('status',{name:'Loading profile'})).not.toBeInTheDocument();
    expect(await screen.findByText('Your home is ready for content')).toBeInTheDocument();
  });

  it('reconciles authentication completing in a newer epoch without requiring a reload', async () => {
    bridgeMock.sessionStatus='loading';
    render(<AppRoot />);
    await waitFor(()=>expect(bridgeMock.requests.some(request=>request.method==='home.snapshot')).toBe(true));
    expect(screen.getByRole('status', { name: 'Starting Nuvio' })).toBeInTheDocument();
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

  it('displays each addon search section while other addons are still loading', async () => {
    render(<AppRoot />);
    await screen.findByText('Your home is ready for content');
    fireEvent.click(screen.getByRole('link', { name: /search/i }));
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search movies and shows' }), { target: { value: 'Arrival' } });
    await waitFor(() => expect(bridgeMock.requests.some(request => request.method === 'search.start')).toBe(true));
    const request = bridgeMock.requests.find(request => request.method === 'search.start')!;
    const first = { key: 'fast-addon', title: 'Fast addon results', subtitle: '', items: [media('arrival', 'Arrival')], hasMore: false };
    emit({ topic: 'search', epoch: 5, revision: 1, data: { requestId: request.id, query: 'Arrival', loading: true, error: null, shelves: [first] } });
    expect(await screen.findByText('Fast addon results')).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Searching' })).toBeInTheDocument();
    const originalSection = screen.getByText('Fast addon results').closest('section');
    const second = { key: 'slow-addon', title: 'Slow addon results', subtitle: '', items: [media('arrival-2', 'Arrival TV')], hasMore: false };
    emit({ topic: 'search', epoch: 5, revision: 2, data: { requestId: request.id, query: 'Arrival', loading: false, error: null, shelves: [first, second] } });
    expect(await screen.findByText('Slow addon results')).toBeInTheDocument();
    expect(screen.getByText('Fast addon results').closest('section')).toBe(originalSection);
    expect(screen.queryByRole('status', { name: 'Searching' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search movies and shows' }), { target: { value: 'Dune' } });
    expect(screen.queryByText('Fast addon results')).not.toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Searching' })).toBeInTheDocument();
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
    fireEvent.click(await screen.findByRole('button', { name: 'Open Details test title' }));
    await waitFor(() => expect(bridgeMock.requests.filter((request) => request.method === 'details.load')).toHaveLength(1));
    expect(await screen.findByRole('status', { name: 'Loading title details' })).toBeInTheDocument();
  });

  it('expands detail actions inline and toggles watched and library state', async () => {
    render(<AppRoot />);
    await screen.findByText('Your home is ready for content');
    emit({ topic: 'home', epoch: 5, revision: 70, data: { loading: false, error: null, hero: [], shelves: [{ key: 'actions', title: 'Actions', subtitle: '', items: [media('overflow-actions', 'Action title')], hasMore: false }] } });
    fireEvent.click(await screen.findByRole('button', { name: 'Open Action title' }));
    await screen.findByRole('status', { name: 'Loading title details' });
    const detailRequest = bridgeMock.requests.find((request) => request.method === 'details.load')!;
    emit({ topic: 'details', epoch: 5, revision: 80, data: { requestId: detailRequest.id, loading: false, error: null, media: media('overflow-actions', 'Action title'), episodes: [], cast: [], related: [] } });

    const expander = await screen.findByRole('button', { name: 'More title actions' });
    expect(expander).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(expander);
    expect(expander).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Mark watched' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mark watched' }));
    await waitFor(() => expect(bridgeMock.requests.some((request) => request.method === 'details.watched.toggle')).toBe(true));

    fireEvent.click(screen.getByRole('button', { name: 'Add to library' }));
    await waitFor(() => expect(bridgeMock.requests.some((request) => request.method === 'library.add')).toBe(true));
    expect(await screen.findByRole('button', { name: 'Remove from library' })).toBeInTheDocument();
  });

  it('long-pressing Play opens manual stream selection and bypasses auto-selection', async () => {
    render(<AppRoot />);
    await screen.findByText('Your home is ready for content');
    emit({ topic: 'home', epoch: 5, revision: 90, data: { loading: false, error: null, hero: [], shelves: [{ key: 'long-press', title: 'Long press', subtitle: '', items: [media('manual-play', 'Manual play title')], hasMore: false }] } });
    fireEvent.click(await screen.findByRole('button', { name: 'Open Manual play title' }));
    await screen.findByRole('status', { name: 'Loading title details' });
    const detailRequest = bridgeMock.requests.find((request) => request.method === 'details.load')!;
    emit({ topic: 'details', epoch: 5, revision: 91, data: { requestId: detailRequest.id, loading: false, error: null, media: media('manual-play', 'Manual play title'), episodes: [], cast: [], related: [] } });
    const playButton = await screen.findByRole('button', { name: /Play/ });
    fireEvent.pointerDown(playButton, { button: 0, pointerId: 1, pointerType: 'mouse' });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 560)); });
    await waitFor(() => expect(bridgeMock.requests.some((request) => request.method === 'streams.load' && request.params.manualSelection === true)).toBe(true));
    expect(window.location.search).toContain('manual=1');
  });

  it('shows only enabled addons with a matching stream resource as active scrapers', () => {
    const addons: Addons = { items: [
      { id: 'cinemeta', name: 'Cinemeta', manifestUrl: '', enabled: true, description: null, logo: null, types: ['movie'], resources: [{ name: 'catalog', types: ['movie'], idPrefixes: [] }, { name: 'meta', types: ['movie'], idPrefixes: [] }] },
      { id: 'aiometa', name: 'AIOMetadata | ElfHosted', manifestUrl: '', enabled: true, description: null, logo: null, types: ['movie'], resources: [{ name: 'meta', types: ['movie'], idPrefixes: [] }] },
      { id: 'subtitles', name: 'opensubtitles PRO', manifestUrl: '', enabled: true, description: null, logo: null, types: ['movie'], resources: [{ name: 'subtitles', types: ['movie'], idPrefixes: [] }] },
      { id: 'stremthru', name: 'StremThru Torz', manifestUrl: '', enabled: true, description: null, logo: null, types: ['movie'], resources: [{ name: 'stream', types: ['movie'], idPrefixes: [] }] },
      { id: 'series-streams', name: 'Series-only streams', manifestUrl: '', enabled: true, description: null, logo: null, resources: [{ name: 'stream', types: ['series'], idPrefixes: [] }] },
    ] };
    expect(streamAddonNames(addons, 'movie')).toEqual(['StremThru Torz']);
  });

  it('recognizes configured automatic stream-selection modes', () => {
    expect(isAutomaticStreamSelectionEnabled('FIRST_STREAM', '')).toBe(true);
    expect(isAutomaticStreamSelectionEnabled('REGEX_MATCH', '2160p')).toBe(true);
    expect(isAutomaticStreamSelectionEnabled('REGEX_MATCH', '[')).toBe(false);
    expect(isAutomaticStreamSelectionEnabled('REGEX_MATCH', '')).toBe(false);
    expect(isAutomaticStreamSelectionEnabled('MANUAL', '2160p')).toBe(false);
  });

  it('goes straight to the full-screen loading state for auto-play mode', async () => {
    bridgeMock.streamAutoPlayMode='FIRST_STREAM';
    render(<AppRoot />);
    await screen.findByText('Your home is ready for content');
    emit({ topic: 'home', epoch: 5, revision: 90, data: { loading: false, error: null, hero: [], shelves: [{ key: 'auto-play', title: 'Auto play', subtitle: '', items: [media('auto-play', 'Auto play title')], hasMore: false }] } });
    fireEvent.click(await screen.findByRole('button', { name: 'Open Auto play title' }));
    await screen.findByRole('status', { name: 'Loading title details' });
    const detailRequest = bridgeMock.requests.find((request) => request.method === 'details.load')!;
    emit({ topic: 'details', epoch: 5, revision: 91, data: { requestId: detailRequest.id, loading: false, error: null, media: media('auto-play', 'Auto play title'), episodes: [], cast: [], related: [] } });
    fireEvent.click(await screen.findByRole('button', { name: /Play/ }));
    await waitFor(() => expect(bridgeMock.requests.some((request) => request.method === 'streams.load' && request.params.manualSelection === false)).toBe(true));
    expect(await screen.findByText('Finding streams…')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Available streams' })).not.toBeInTheDocument();
  });

  it('commits top bar navigation at input priority without waiting for a transition', async () => {
    render(<AppRoot />);
    await screen.findByText('Your home is ready for content');
    const home = document.querySelector('.home-page');

    // flushSync only flushes urgent work. A router startTransition leaves the
    // old screen here even though the pointer-driven bubble has already moved.
    // Assert inside act, before act also drains deferred transition work.
    act(() => {
      flushSync(() => screen.getByRole('link', { name: /search/i }).click());
      expect(screen.getByRole('searchbox', { name: 'Search movies and shows' })).toBeVisible();
      expect(home).not.toBeVisible();
    });
    act(() => {
      flushSync(() => screen.getByRole('link', { name: 'Home' }).click());
      expect(home).toBeVisible();
      expect(screen.queryByRole('searchbox')).toBeNull();
    });
    for (const label of ['Library', 'Settings']) {
      act(() => {
        flushSync(() => screen.getByRole('link', { name: new RegExp(label, 'i') }).click());
        expect(screen.getByRole('heading', { name: label })).toBeVisible();
        expect(home).not.toBeVisible();
      });
    }
    act(() => {
      flushSync(() => screen.getByRole('link', { name: 'Home' }).click());
      expect(document.querySelector('.home-page')).toBe(home);
      expect(home).toBeVisible();
    });
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

  it('opens Discover filter menus outside the scroll strip and dispatches all three selections', async () => {
    render(<AppRoot />);
    await screen.findByText('Your home is ready for content');
    fireEvent.click(screen.getByRole('link', { name: /search/i }));
    await screen.findByRole('heading', { name: 'Discover' });

    fireEvent.click(screen.getByRole('button', { name: /Movies/i }));
    fireEvent.click(await screen.findByRole('option', { name: 'Series' }));
    await waitFor(() => expect(bridgeMock.requests.some((request) => request.method === 'discover.selectType' && request.params.type === 'series')).toBe(true));

    fireEvent.click(document.querySelector('[data-filter="catalog"] .discover-filter-chip')!);
    fireEvent.click(await screen.findByRole('option', { name: 'Top' }));
    await waitFor(() => expect(bridgeMock.requests.some((request) => request.method === 'discover.selectCatalog' && request.params.catalogKey === 'cinemeta:movie:top')).toBe(true));

    fireEvent.click(document.querySelector('[data-filter="genre"] .discover-filter-chip')!);
    fireEvent.click(await screen.findByRole('option', { name: 'Action' }));
    await waitFor(() => expect(bridgeMock.requests.some((request) => request.method === 'discover.selectGenre' && request.params.genre === 'Action')).toBe(true));
  });

  function stubProbe(failProbe: boolean) {
    class FakeImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        const self = this;
        queueMicrotask(() => { (failProbe ? self.onerror : self.onload)?.(); });
      }
    }
    vi.stubGlobal('Image', FakeImage);
  }

  async function openDetailsWithArt() {
    window.history.pushState({}, '', '/details/movie/tt9174288');
    render(<AppRoot />);
    await waitFor(() => expect(bridgeMock.requests.some((request) => request.method === 'details.load')).toBe(true));
    const loadRequest = bridgeMock.requests.find((request) => request.method === 'details.load')!;
    const art = { id: 'tt9174288', type: 'movie', name: "Let's Have Kids!", poster: null, background: 'https://example.invalid/bg.jpg', logo: 'https://example.invalid/logo.png', description: null, releaseInfo: '2026', rating: null, genres: [] };
    await act(async () => { emit({ topic: 'details', epoch: bridgeMock.epoch, revision: 950, data: { requestId: loadRequest.id, loading: false, error: null, media: art, episodes: [], cast: [], related: [] } }); });
  }

  it('falls back to title text and drops the backdrop when details art fails', async () => {
    stubProbe(true);
    await openDetailsWithArt();
    fireEvent.error(await screen.findByAltText("Let's Have Kids!"));
    expect(await screen.findByRole('heading', { name: "Let's Have Kids!" })).toBeInTheDocument();
    await waitFor(() => expect(document.querySelector('.detail-viewport-backdrop')).toBeNull());
  });

  it('keeps the logo and backdrop while details art loads', async () => {
    stubProbe(false);
    await openDetailsWithArt();
    expect(await screen.findByAltText("Let's Have Kids!")).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: "Let's Have Kids!" })).toBeNull();
    await waitFor(() => expect(document.querySelector('.detail-viewport-backdrop')).not.toBeNull());
  });
});
