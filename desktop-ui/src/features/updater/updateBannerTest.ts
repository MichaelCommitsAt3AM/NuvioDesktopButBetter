import { useSyncExternalStore } from 'react';

/**
 * Preview-only driver for the update banner UI test hook in About settings.
 * Mirrors the original app's debug update (fake 9.9.9 release with simulated
 * download progress). Session state only; never touches real releases.
 */
export type TestBannerPhase = 'available' | 'downloading' | 'complete';

type TestBannerState = {
  visible: boolean;
  phase: TestBannerPhase;
  progress: number;
};

export const TEST_UPDATE = {
  tag: '9.9.9',
  title: 'Nuvio 9.9.9',
  sizeLabel: '185 MB',
  notes: 'A local preview of the new update experience.\n\n- The banner pushes the app content down.\n- Download progress fills the banner with the primary accent.\n- Release notes live behind the info button.',
};

const hidden: TestBannerState = { visible: false, phase: 'available', progress: 0 };

let state: TestBannerState = hidden;
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function publish(next: TestBannerState) {
  state = next;
  listeners.forEach((listener) => listener());
}

function stopTimer() {
  if (timer !== null) { clearInterval(timer); timer = null; }
}

export function showTestBanner() {
  if (!import.meta.env.DEV) return;
  stopTimer();
  publish({ visible: true, phase: 'available', progress: 0 });
}

export function dismissTestBanner() {
  stopTimer();
  publish(hidden);
}

export function startTestDownload() {
  if (!state.visible || state.phase === 'downloading') return;
  stopTimer();
  publish({ ...state, phase: 'downloading', progress: 0 });
  timer = setInterval(() => {
    const progress = Math.min(1, state.progress + 0.01);
    if (progress >= 1) {
      stopTimer();
      publish({ ...state, phase: 'complete', progress: 1 });
    } else {
      publish({ ...state, progress });
    }
  }, 35);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function getSnapshot() {
  return state;
}

export function useTestBanner() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
