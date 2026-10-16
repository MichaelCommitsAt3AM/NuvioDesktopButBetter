import { beforeEach, describe, expect, it, vi } from 'vitest';
const native = vi.hoisted(() => ({ invoke: vi.fn(), listen: vi.fn(), isTauri: vi.fn(() => true), progress: null as null | ((event: { payload: { downloaded: number; total: number | null } }) => void), unlisten: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: native.invoke, isTauri: native.isTauri }));
vi.mock('@tauri-apps/api/event', () => ({ listen: native.listen }));
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks();
  native.isTauri.mockReturnValue(true);
  native.listen.mockImplementation(async (_event, callback) => { native.progress = callback; return native.unlisten; });
});
describe('release updater', () => {
  it('checks once on startup and shares a pending check with About', async () => {
    const updater = await import('./updater');
    let resolve!: (value: unknown) => void;
    native.invoke.mockReturnValue(new Promise(value => { resolve = value; }));
    updater.initializeUpdater(); updater.initializeUpdater();
    const check = updater.checkForUpdates();
    expect(native.invoke).toHaveBeenCalledTimes(1);
    resolve({ supported: true, version: '1.0.34', notes: 'Fixes', message: null });
    expect(await check).toContain('available');
  });
  it('automatically installs after verification, never before the download completes', async () => {
    const updater = await import('./updater');
    native.invoke.mockResolvedValueOnce({ supported: true, version: '1.0.34', notes: 'Fixes' });
    await updater.checkForUpdates();
    await updater.installUpdate();
    expect(native.invoke).toHaveBeenCalledTimes(1);
    let verify!: () => void;
    native.invoke.mockReturnValueOnce(new Promise<void>(resolve => { verify = resolve; })).mockResolvedValueOnce(undefined);
    const download = updater.downloadUpdate();
    await vi.waitFor(() => expect(native.invoke).toHaveBeenCalledWith('update_download'));
    expect(native.invoke).not.toHaveBeenCalledWith('update_install');
    await updater.downloadUpdate();
    verify();
    await download;
    expect(native.unlisten).toHaveBeenCalledTimes(1);
    expect(native.invoke.mock.calls.map(call => call[0])).toEqual(['update_check', 'update_download', 'update_install']);
  });
  it('never installs a failed download and allows download retry', async () => {
    const updater = await import('./updater');
    native.invoke.mockResolvedValueOnce({ supported: true, version: '1.0.34', notes: '' });
    await updater.checkForUpdates();
    native.invoke.mockRejectedValueOnce('Signature verification failed');
    await updater.downloadUpdate(); await updater.installUpdate();
    expect(native.invoke.mock.calls.some(call => call[0] === 'update_install')).toBe(false);
    expect(native.unlisten).toHaveBeenCalledTimes(1);
    native.invoke.mockResolvedValueOnce(undefined);
    await updater.downloadUpdate();
    expect(native.invoke.mock.calls.filter(call => call[0] === 'update_download')).toHaveLength(2);
    expect(native.invoke.mock.calls.filter(call => call[0] === 'update_install')).toHaveLength(1);
  });
  it('retains the download after cancelled installation for retry', async () => {
    const updater = await import('./updater');
    native.invoke.mockResolvedValueOnce({ supported: true, version: '1.0.34', notes: '' });
    await updater.checkForUpdates();
    native.invoke.mockResolvedValueOnce(undefined).mockRejectedValueOnce('Permission cancelled');
    await updater.downloadUpdate();
    native.invoke.mockResolvedValueOnce(undefined); await updater.installUpdate();
    expect(native.invoke.mock.calls.filter(call => call[0] === 'update_install')).toHaveLength(2);
    expect(native.invoke.mock.calls.filter(call => call[0] === 'update_download')).toHaveLength(1);
  });
  it('does not call native updater in a browser preview', async () => {
    native.isTauri.mockReturnValue(false);
    const updater = await import('./updater');
    updater.initializeUpdater();
    expect(await updater.checkForUpdates()).toContain('installed desktop app');
    expect(native.invoke).not.toHaveBeenCalled();
  });
});
