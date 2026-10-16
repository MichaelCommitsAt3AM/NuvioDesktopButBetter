import { useSyncExternalStore } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

type UpdateInfo = { supported: boolean; version: string | null; notes: string | null; message: string | null };
type UpdateState = { visible: boolean; phase: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'installing'; version: string; notes: string; progress: number | null; error: string | null };
let state: UpdateState = { visible: false, phase: 'idle', version: '', notes: '', progress: null, error: null };
const listeners = new Set<() => void>();
function publish(patch: Partial<UpdateState>) { state = { ...state, ...patch }; listeners.forEach(listener => listener()); }
function errorMessage(error: unknown) { return error instanceof Error ? error.message : String(error); }
let checking: Promise<string> | null = null;
let started = false;

export function initializeUpdater() {
  if (started || !isTauri()) return;
  started = true;
  void checkForUpdates().catch(() => {});
}
export function checkForUpdates(): Promise<string> {
  if (checking) return checking;
  if (state.phase === 'downloading' || state.phase === 'installing') return Promise.resolve('An update is already in progress.');
  if (!isTauri()) return Promise.resolve('Updates are available in the installed desktop app.');
  const previousPhase = state.phase;
  publish({ phase: 'checking', error: null });
  checking = (async () => {
    try {
      const result = await invoke<UpdateInfo>('update_check');
      if (!result.supported) { publish({ phase: 'idle', visible: false }); return result.message ?? 'Updates are unavailable in this build.'; }
      if (!result.version) { publish({ phase: 'idle', visible: false }); return 'You are using the latest version.'; }
      publish({ visible: true, phase: previousPhase === 'downloaded' ? 'downloaded' : 'available', version: result.version, notes: result.notes ?? '' });
      return 'An update is available. Use the update banner to download and install it.';
    } catch (error) { publish({ phase: previousPhase, error: errorMessage(error) }); throw error; }
    finally { checking = null; }
  })();
  return checking;
}
export function dismissUpdate() { if (!['downloading', 'installing'].includes(state.phase)) publish({ visible: false }); }
export async function downloadUpdate() {
  if (state.phase !== 'available') return;
  publish({ phase: 'downloading', progress: null, error: null });
  let unlisten: (() => void) | undefined;
  try {
    unlisten = await listen<{ downloaded: number; total: number | null }>('nuvio-update-progress', ({ payload }) => {
      publish({ progress: payload.total ? Math.min(1, payload.downloaded / payload.total) : null });
    });
    await invoke('update_download');
  } catch (error) {
    publish({ phase: 'available', error: errorMessage(error), progress: null });
    return;
  }
  finally { unlisten?.(); }
  // Native download only resolves after signature verification. The user's
  // Update action covers the complete download → verified install → restart.
  publish({ phase: 'downloaded', progress: 1 });
  await installUpdate();
}
export async function installUpdate() {
  if (state.phase !== 'downloaded') return;
  publish({ phase: 'installing', error: null });
  try { await invoke('update_install'); }
  catch (error) { publish({ phase: 'downloaded', error: errorMessage(error) }); }
}
export function useUpdater() {
  return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => state, () => state);
}
