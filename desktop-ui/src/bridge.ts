import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useCallback, useRef, useSyncExternalStore } from 'react';
import type { Addon, Addons, Catalog, Discover, SearchHistory, Details, Event, Home, Library, Profile, Search, Session, Settings, Streams } from './generated/contract';
import type { ProfilesSnapshot } from './features/profiles/profileStore';
import { assertEvent, assertMethodResult, assertResponse } from './contractValidation';

type Status = 'starting' | 'ready' | 'disconnected';
export type PlaybackState = { state: 'idle' | 'starting' | 'playing' | 'external' | 'stopping' | 'stopped' | 'cancelled' | 'failed'; phase?: 'idle' | 'resolving' | 'preparing' | 'buffering' | 'stopping' | 'failed'; active: boolean; error: string | null; host?: string; streamId?: string; playing?: boolean };
type State = {
  status: Status;
  profileTransition: { profile: Profile; backgroundUrl?: string | null; ready: boolean } | null;
  connectionMessage: string | null;
  session: Session;
  home: Home;
  library: Library;
  addons: Addon[];
  settings: Settings;
  search: Search;
  details: Details;
  streams: Streams;
  playback: PlaybackState;
  catalog: Catalog | null;
  discover: Discover | null;
  searchHistory: SearchHistory | null;
  featureSnapshots: Record<string, unknown>;
};

const emptySession: Session = { status: 'loading', email: null, version: '', activeProfile: null, profiles: [], capabilities: [], error: null };
const emptyState: State = {
  status: 'starting', profileTransition: null, connectionMessage: null, session: emptySession,
  home: { loading: true, error: null, hero: [], shelves: [] },
  library: { loading: true, error: null, items: [] }, addons: [],
  settings: { theme: 'white', themes: [] },
  search: { requestId: '', query: '', loading: false, error: null, shelves: [] },
  details: { requestId: '', loading: false, error: null, media: null, episodes: [], cast: [], related: [] },
  streams: { requestId: '', loading: false, error: null, groups: [] },
  playback: { state: 'idle', active: false, error: null },
  catalog: null, discover: null, searchHistory: null, featureSnapshots: {},
};

let state = emptyState;
let activeEpoch: number | undefined;
let sessionEpochReady = false;
const earlyEvents: Event[] = [];
const revisions = new Map<string, number>();
const subscribers = new Set<() => void>();
let initialized = false;
let eventDisposers: Array<() => void> = [];
let requestCounter = 0;
let reconcileGeneration = 0;
let reconcileFlight: Promise<void> | null = null;
let reconcileAgain = false;
const MAX_BUFFERED_EVENTS = 256;
export class BridgeError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = 'BridgeError'; }
}

function publish(next: State) {
  state = next;
  subscribers.forEach((subscriber) => subscriber());
}
function update(updater: (current: State) => State) { publish(updater(state)); }
function requestId() { return `${Date.now().toString(36)}-${(++requestCounter).toString(36)}`; }
function errorMessage(error: unknown) { return error instanceof Error ? error.message : String(error); }
function reportDiagnostic(message: string) {
  // Keep startup breadcrumbs durable across a frozen WebView. Never include
  // request params, session data, or backend response bodies here.
  void invoke('bridge_report_diagnostic', { message }).catch(() => {});
}

export function subscribe(listener: () => void) { subscribers.add(listener); return () => subscribers.delete(listener); }
export function getSnapshot() { return state; }

const epochChangingMethods = ['profiles.select', 'profiles.delete', 'session.signOut', 'session.signIn', 'session.signUp', 'session.guest'];

async function request(method: string, params: Record<string, unknown> = {}, withEpoch = true, id = requestId()): Promise<{ result: unknown; epoch: number }> {
  const requestEpoch = withEpoch ? activeEpoch : undefined;
  const response = await invoke<unknown>('bridge_request', {
    request: { id, method, params, ...(requestEpoch !== undefined ? { epoch: requestEpoch } : {}) },
  });
  assertResponse(response);
  if (response.id !== id) throw new Error(`Bridge response id mismatch for ${method}`);
  const epochChanging = epochChangingMethods.includes(method);
  // Epoch-changing calls move the backend epoch even when they report an
  // error (e.g. a sign-out that cleared local state but failed remotely).
  // Adopt the envelope epoch first so the client can never be stranded stale.
  if (epochChanging) activeEpoch = response.epoch;
  if (response.error) throw new BridgeError(response.error.code, response.error.message);
  else if (!epochChanging && requestEpoch !== undefined && (response.epoch !== requestEpoch || activeEpoch !== requestEpoch)) throw new Error('Discarded a response from an inactive profile session.');
  if (response.result !== undefined) assertMethodResult(method, response.result);
  return { result: response.result, epoch: response.epoch };
}

export async function call<T>(method: string, params: Record<string, unknown> = {}, withEpoch = true, id = requestId()): Promise<T> {
  return (await request(method, params, withEpoch, id)).result as T;
}

function eventPayload<T>(event: Event): T {
  return event.data as T;
}
function acceptEvent(event: Event) {
  if (activeEpoch !== undefined && event.epoch !== activeEpoch) return;
  const revKey = `${event.epoch}:${event.topic}`;
  if ((revisions.get(revKey) ?? -1) >= event.revision) return;
  revisions.set(revKey, event.revision);
  const data = eventPayload<unknown>(event);
  switch (event.topic) {
    case 'session':
      update((current) => ({ ...current, session: data as unknown as Session }));
      break;
    case 'home':
      update((current) => ({ ...current, home: data as unknown as Home }));
      break;
    case 'library':
      update((current) => ({ ...current, library: data as unknown as Library }));
      break;
    case 'addons':
      update((current) => ({ ...current, addons: (data as Addons).items }));
      break;
    case 'settings':
      update((current) => ({ ...current, settings: data as unknown as Settings }));
      break;
    case 'search':
      update((current) => (data as Search).requestId === current.search.requestId ? { ...current, search: data as Search } : current);
      break;
    case 'details':
      reportDiagnostic(`Received details event (incomingRequest=${(data as Details).requestId}, currentRequest=${state.details.requestId}, requestMatch=${(data as Details).requestId === state.details.requestId}, loading=${Boolean((data as Details).loading)}, media=${Boolean((data as Details).media)}, error=${Boolean((data as Details).error)})`);
      update((current) => (data as Details).requestId === current.details.requestId ? { ...current, details: data as Details } : current);
      break;
    case 'streams':
      reportDiagnostic(`Streams event request=${(data as Streams).requestId} matches=${(data as Streams).requestId === state.streams.requestId} loading=${(data as Streams).loading} groups=${(data as Streams).groups.length} error=${Boolean((data as Streams).error)}`);
      update((current) => (data as Streams).requestId === current.streams.requestId ? { ...current, streams: data as Streams } : current);
      break;
    case 'playback':
      update((current) => ({ ...current, playback: { ...current.playback, ...(data as Partial<PlaybackState>) } }));
      break;
    case 'catalog': update(current => ({ ...current, catalog: data as Catalog })); break;
    case 'discover': update(current => ({ ...current, discover: data as Discover })); break;
    case 'searchHistory': update(current => ({ ...current, searchHistory: data as SearchHistory })); break;
    default:
      update(current => ({ ...current, featureSnapshots: { ...current.featureSnapshots, [event.topic]: data } }));
      break;
  }
}

export async function initialize() {
  if (initialized) return;
  initialized = true;
  reportDiagnostic('React bridge initialization entered');
  const errors: string[] = [];
  try {
    const events = await listen<Event>('bridge:event', ({ payload }) => {
      try {
        assertEvent(payload);
        // Authentication can finish in a new epoch after the initial loading
        // snapshot. Reconcile that session instead of discarding it as stale.
        if (payload.topic === 'session' && activeEpoch !== undefined && payload.epoch > activeEpoch) {
          void reconcile();
          return;
        }
        if (!sessionEpochReady) {
          if (earlyEvents.length >= MAX_BUFFERED_EVENTS) earlyEvents.shift();
          earlyEvents.push(payload);
          return;
        }
        acceptEvent(payload);
      } catch (error) {
        reportDiagnostic(`Bridge event rejected topic=${payload.topic}: ${errorMessage(error)}`);
        console.error(errorMessage(error));
      }
    });
    eventDisposers.push(events);
    reportDiagnostic('Registered bridge:event listener');
  } catch (error) {
    errors.push(`bridge:event listener: ${errorMessage(error)}`);
  }
  try {
    const statuses = await listen<{ status: Status; message?: string }>('bridge:status', ({ payload }) => {
      if (!payload || !['starting', 'ready', 'disconnected'].includes(payload.status)) return;
      update((current) => ({ ...current, status: payload.status, connectionMessage: payload.message ?? null }));
      if (payload.status === 'disconnected') sessionEpochReady = false;
      if (payload.status === 'ready') void reconcile();
    });
    eventDisposers.push(statuses);
    reportDiagnostic('Registered bridge:status listener');
  } catch (error) {
    errors.push(`bridge:status listener: ${errorMessage(error)}`);
  }
  try {
    // The native process may finish its handshake just after this view mounts.
    // Keep checking its authoritative status so a missed Tauri event can never
    // leave the UI displaying "Starting Nuvio…" indefinitely.
    const startupDeadline = Date.now() + 35_000;
    let status: { status: Status; message?: string };
    do {
      status = await invoke<{ status: Status; message?: string }>('bridge_status');
      update((current) => ({ ...current, status: status.status, connectionMessage: status.message ?? null }));
      reportDiagnostic(`React observed bridge status: ${status.status}`);
      if (status.status !== 'starting') break;
      await new Promise((resolve) => window.setTimeout(resolve, 750));
    } while (Date.now() < startupDeadline);
    if (status.status === 'starting') throw new Error('The Kotlin bridge did not finish starting within 35 seconds.');
    if (status.status === 'disconnected') throw new Error(status.message ?? 'The Kotlin bridge disconnected during startup.');
    if (status.status === 'ready') {
      reportDiagnostic('Bridge ready; beginning startup session reconciliation');
      await reconcile();
      reportDiagnostic(`Startup reconciliation finished with session status: ${state.session.status}`);
    }
  } catch (error) {
    errors.push(`bridge_status invoke: ${errorMessage(error)}`);
  }
  if (errors.length) {
    const message = errors.join('; ');
    console.error('Nuvio bridge initialization failed:', message);
    reportDiagnostic(`React bridge initialization failed: ${message}`);
    update((current) => ({ ...current, status: 'disconnected', connectionMessage: message, session: { ...current.session, error: message } }));
    initialized = false;
  }
}

function replayBufferedEvents(epoch: number) {
  const queued = earlyEvents.splice(0);
  queued.filter((event) => event.epoch === epoch).forEach(acceptEvent);
  if (queued.some(event => event.topic === 'session' && event.epoch > epoch)) void reconcile();
}

async function reconcile() {
  if (reconcileFlight) { reconcileAgain = true; return reconcileFlight; }
  const generation = ++reconcileGeneration;
  reportDiagnostic(`Session reconciliation started (generation=${generation})`);
  const flight = (async () => {
    try {
      const snapshotStartedAt = Date.now();
      reportDiagnostic(`Requesting session.snapshot (generation=${generation})`);
      const snapshotResult = await request('session.snapshot', {}, false);
      reportDiagnostic(`session.snapshot completed in ${Date.now() - snapshotStartedAt}ms (generation=${generation})`);
      if (generation !== reconcileGeneration) return;
      const session = snapshotResult.result as Session;
      const changedEpoch = activeEpoch !== snapshotResult.epoch;
      activeEpoch = snapshotResult.epoch;
      reportDiagnostic(`Session snapshot accepted (generation=${generation}, epoch=${activeEpoch}, status=${session.status}, profiles=${session.profiles.length})`);
      if (changedEpoch) {
        revisions.clear();
        publish({ ...emptyState, profileTransition: state.profileTransition, status: state.status, session });
      } else {
        publish({ ...state, session });
      }
      sessionEpochReady = true;
      replayBufferedEvents(snapshotResult.epoch);
      // Let the shell enter Home as soon as the session is known. Home and
      // library snapshots may wait on remote catalogs; they must not hold the
      // startup/profile transition overlay while those requests are in flight.
      void Promise.allSettled([
        snapshot('home.snapshot', 'home', generation),
        snapshot('library.snapshot', 'library', generation),
        snapshot('addons.snapshot', 'addons', generation),
        snapshot('settings.snapshot', 'settings', generation),
      ]);
    } catch (error) {
      reportDiagnostic(`Session reconciliation failed (generation=${generation}): ${errorMessage(error)}`);
      if (generation === reconcileGeneration) {
        sessionEpochReady = false;
        const message = `Unable to restore the session: ${errorMessage(error)}`;
        update((current) => ({ ...current, status: 'disconnected', connectionMessage: message, session: { ...current.session, error: message } }));
      }
    }
  })();
  reconcileFlight = flight;
  try { await flight; } finally {
    if (reconcileFlight === flight) reconcileFlight = null;
    if (reconcileAgain && state.status === 'ready') { reconcileAgain = false; void reconcile(); }
  }
}

export async function resyncSession() {
  await reconcile();
}

async function snapshot(method: string, key: 'home' | 'library' | 'settings' | 'addons', generation = reconcileGeneration) {
  const requestedEpoch = activeEpoch;
  const topic = key;
  const revisionKey = `${requestedEpoch}:${topic}`;
  const startingRevision = revisions.get(revisionKey) ?? -1;
  try {
    const result = await call<unknown>(method);
    if (generation !== reconcileGeneration || requestedEpoch !== activeEpoch || (revisions.get(revisionKey) ?? -1) !== startingRevision) return;
    if (key === 'addons') update((current) => ({ ...current, addons: (result as Addons).items }));
    else update((current) => ({ ...current, [key]: result } as State));
  } catch (error) {
    if (generation !== reconcileGeneration || requestedEpoch !== activeEpoch) return;
    if (key === 'home' || key === 'library') update((current) => ({ ...current, [key]: { ...current[key], loading: false, error: errorMessage(error) } }));
  }
}

async function changeProfileEpoch(action: () => Promise<unknown>, showLoading = true) {
  const previousState = state;
  const previousSession = state.session;
  ++reconcileGeneration;
  reconcileFlight = null;
  sessionEpochReady = false;
  revisions.clear();
  earlyEvents.length = 0;
  publish({ ...emptyState, profileTransition: state.profileTransition, status: state.status, session: showLoading ? { ...state.session, status: 'loading', error: null } : { ...state.session, error: null } });
  try {
    await action();
    await reconcile();
  } catch (error) {
    sessionEpochReady = true;
    replayBufferedEvents(activeEpoch ?? 0);
    publish({ ...previousState, status: state.status, session: { ...previousSession, error: errorMessage(error) } });
    throw error;
  }
}

export const actions = {
  async restartBridge() {
    try { await invoke('bridge_restart'); }
    finally {
      if (!initialized) {
        eventDisposers.forEach((dispose) => dispose());
        eventDisposers = [];
        await initialize();
      }
    }
  },
  async signIn(email: string, password: string) { await changeProfileEpoch(() => call('session.signIn', { email, password }), false); },
  async signUp(email: string, password: string) { await changeProfileEpoch(() => call('session.signUp', { email, password }), false); },
  async guest() { await changeProfileEpoch(() => call('session.guest'), false); },
  async signOut() {
    try {
      await changeProfileEpoch(() => call('session.signOut'));
    } catch (error) {
      // The backend clears the local session even when remote sign-out fails
      // (e.g. offline). Resync to backend truth instead of keeping the stale
      // signed-in session so logout still lands on the login screen.
      await resyncSession().catch(() => {});
      if (getSnapshot().session.status === 'signedOut') return;
      throw error;
    }
  },
  async selectProfile(id: number, pin?: string) {
    if (state.profileTransition) return;
    const profile = state.session.profiles.find(item => item.id === id);
    const profiles = state.featureSnapshots.profiles as ProfilesSnapshot | undefined;
    const record = profiles?.items.find(item => item.id === id);
    if (profile) update(current => ({ ...current, profileTransition: { profile, backgroundUrl: record?.backgroundUrl, ready: false } }));
    try {
      await changeProfileEpoch(() => call('profiles.select', { id, ...(pin ? { pin } : {}) }), false);
      update(current => ({ ...current, profileTransition: current.profileTransition ? { ...current.profileTransition, ready: true } : null }));
    } catch (error) {
      update(current => ({ ...current, profileTransition: null }));
      throw error;
    }
  },
  finishProfileTransition() { update(current => ({ ...current, profileTransition: null })); },
  async homeRefresh() { await call('home.refresh'); },
  async searchStart(query: string) {
    const id = requestId();
    update((current) => ({ ...current, search: { requestId: id, query, loading: true, error: null, shelves: [] } }));
    try { await call('search.start', { query }, true, id); }
    catch (error) { update((current) => current.search.requestId === id ? { ...current, search: { ...current.search, loading: false, error: errorMessage(error) } } : current); }
  },
  async loadDetails(type: string, id: string) {
    const rid = requestId();
    reportDiagnostic(`Details screen requested a title (request=${rid})`);
    update((current) => ({ ...current, details: { requestId: rid, loading: true, error: null, media: null, episodes: [], cast: [], related: [] } }));
    try {
      // Cached details can be returned synchronously by Kotlin before the
      // request-scoped event collector has activated this request ID. Apply
      // the RPC snapshot as well as listening for later enrichment updates.
      const details = await call<Details>('details.load', { type, id }, true, rid);
      reportDiagnostic(`details.load response received (request=${rid}, loading=${details.loading}, media=${Boolean(details.media)}, error=${Boolean(details.error)})`);
      update((current) => current.details.requestId === rid ? { ...current, details } : current);
    }
    catch (error) {
      reportDiagnostic(`details.load failed (request=${rid}): ${errorMessage(error)}`);
      update((current) => current.details.requestId === rid ? { ...current, details: { ...current.details, loading: false, error: errorMessage(error) } } : current);
    }
  },
  async loadStreams(type: string, videoId: string, parentMetaId: string, season?: number, episode?: number, manualSelection = false) {
    const rid = requestId();
    const pending: Streams = { requestId: rid, loading: true, error: null, groups: [] };
    update((current) => ({ ...current, streams: pending, featureSnapshots: { ...current.featureSnapshots, streamSelection: undefined } }));
    try {
      const streams = await call<Streams>('streams.load', { type, videoId, parentMetaId, season, episode, manualSelection }, true, rid);
      // Kotlin can reuse completed results without emitting a new StateFlow event.
      // Accept the RPC snapshot unless a newer request or event already replaced it.
      update((current) => current.streams === pending ? { ...current, streams } : current);
    }
    catch (error) { update((current) => current.streams.requestId === rid ? { ...current, streams: { ...current.streams, loading: false, error: errorMessage(error) } } : current); }
  },
  async playback(streamId: string, type: string, id: string, title: string, extras: Record<string, unknown> = {}) {
    return call<{ started: boolean; host?: string }>('playback.start', { streamId, type, id, title, ...extras });
  },
  stopPlayback() { return call('playback.stop'); },
  addToLibrary(type: string, id: string) { return call('library.add', { type, id }); },
  removeFromLibrary(type: string, id: string) { return call('library.remove', { type, id }); },
  installAddon(manifestUrl: string) { return call('addons.install', { url: manifestUrl }); },
  toggleAddon(id: string, enabled: boolean) { return call('addons.toggle', { id, enabled }); },
  removeAddon(id: string) { return call('addons.remove', { id }); },
  setTheme(theme: string) { return call('settings.setTheme', { theme }); },
};

export function useAppState() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export async function refreshFeature<T>(topic: string, method = `${topic}.snapshot`): Promise<T> {
  const generation = reconcileGeneration;
  const epoch = activeEpoch;
  const revisionKey = `${epoch}:${topic}`;
  const revision = revisions.get(revisionKey);
  const result = await call<T>(method);
  if (epoch === activeEpoch && generation === reconcileGeneration && revision === revisions.get(revisionKey)) {
    if (topic === 'catalog') update(current => ({ ...current, catalog: result as Catalog }));
    else if (topic === 'discover') update(current => ({ ...current, discover: result as Discover }));
    else if (topic === 'searchHistory') update(current => ({ ...current, searchHistory: result as SearchHistory }));
    else update(current => ({ ...current, featureSnapshots: { ...current.featureSnapshots, [topic]: result } }));
  }
  return result;
}

export function useFeatureSnapshot<T>(topic: string): T | undefined {
  return useSelector(current => current.featureSnapshots[topic] as T | undefined);
}

export function useSelector<T>(selector: (current: State) => T): T {
  const cache = useRef<{ state: State; value: T } | null>(null);
  const getSelection = useCallback(() => {
    const current = getSnapshot();
    if (cache.current?.state === current) return cache.current.value;
    const value = selector(current);
    if (cache.current && Object.is(cache.current.value, value)) {
      cache.current = { state: current, value: cache.current.value };
      return cache.current.value;
    }
    cache.current = { state: current, value };
    return value;
  }, [selector]);
  return useSyncExternalStore(subscribe, getSelection, getSelection);
}

export function disposeBridge() {
  eventDisposers.forEach((dispose) => dispose());
  eventDisposers = [];
  initialized = false;
  activeEpoch = undefined;
  sessionEpochReady = false;
  earlyEvents.length = 0;
  revisions.clear();
  requestCounter = 0;
  reconcileGeneration = 0;
  reconcileFlight = null;
  reconcileAgain = false;
  publish(emptyState);
}
