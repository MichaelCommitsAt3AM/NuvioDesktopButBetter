import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { actions, disposeBridge, getSnapshot, initialize } from './bridge';

const backend = vi.hoisted(() => ({ loading: true, epoch: 1, reads: 0, failRefresh: false }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(async (command, args) => {
  if (command === 'bridge_status') return { status: 'ready' };
  if (command === 'bridge_report_diagnostic') return;
  const { id, method } = args.request;
  if (method === 'home.refresh' && backend.failRefresh) throw new Error('Refresh unavailable');
  const home = { loading: backend.loading, error: null, hero: [], shelves: [] };
  if (method === 'home.snapshot') backend.reads++;
  const results: Record<string, unknown> = {
    'session.snapshot': { status: 'signedIn', email: null, version: 'test', activeProfile: 1, profiles: [], capabilities: [], error: null },
    'home.snapshot': home,
    'home.refresh': home,
    'library.snapshot': { loading: false, error: null, items: [] },
    'addons.snapshot': { items: [] },
    'settings.snapshot': { theme: 'white', themes: [] },
  };
  return { id, epoch: backend.epoch, result: results[method as string] ?? null };
}) }));

beforeEach(() => { vi.useFakeTimers(); backend.loading = true; backend.epoch = 1; backend.reads = 0; backend.failRefresh = false; });
afterEach(() => { disposeBridge(); vi.useRealTimers(); });

it('recovers a completed Home when no catalog events arrive', async () => {
  await initialize();
  expect(getSnapshot().home.loading).toBe(true);
  backend.loading = false;
  await vi.advanceTimersByTimeAsync(5_000);
  expect(backend.reads).toBeGreaterThan(1);
  expect(getSnapshot().home.loading).toBe(false);
  expect(getSnapshot().home.error).toBeNull();
});

it('offers retry instead of an indefinite empty loading skeleton', async () => {
  await initialize();
  await vi.advanceTimersByTimeAsync(60_000);
  expect(getSnapshot().home.loading).toBe(false);
  expect(getSnapshot().home.error).toContain('taking too long');
  backend.loading = false;
  await actions.homeRefresh();
  expect(getSnapshot().home.loading).toBe(false);
  expect(getSnapshot().home.error).toBeNull();
});

it('shows a failed retry and stops recovery polling after disposal', async () => {
  await initialize();
  backend.failRefresh = true;
  await actions.homeRefresh();
  expect(getSnapshot().home.error).toBe('Refresh unavailable');
  disposeBridge();
  const reads = backend.reads;
  await vi.advanceTimersByTimeAsync(10_000);
  expect(backend.reads).toBe(reads);
});
