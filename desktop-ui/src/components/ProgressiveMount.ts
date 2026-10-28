import { startTransition, use, useEffect, useState } from 'react';
import { TabActivity } from '../navigation/tabActivity';

export const PROGRESSIVE_MOUNT_STEP = 24;

/**
 * Counts from 0 up to `total` in per-frame steps so lists with hundreds of
 * posters paint their loading cards first and fill in without one giant
 * blocking commit. Tab switches show the destination immediately instead of
 * waiting for the whole tree to render.
 *
 * `resetKey` identifies the list (shelf key, catalog key, …). When it changes
 * the count restarts from initialCount (0 by default); when only `total` grows (pagination appends) the
 * fill continues without flashing back to skeletons.
 */
export function useProgressiveCount(total: number, resetKey: string, step = PROGRESSIVE_MOUNT_STEP, initialCount = 0): number {
  const initial = Math.min(total, Math.max(0, initialCount));
  const [state, setState] = useState({ key: resetKey, count: initial });
  if (state.key !== resetKey) {
    setState({ key: resetKey, count: initial });
  }
  const count = state.key === resetKey ? state.count : initial;
  // React 19's use(context) can be conditional. Completed shelves have no
  // pending work, so do not wake their entire card tree on tab visibility.
  const active = count < total ? use(TabActivity) : true;
  useEffect(() => {
    if (!active || count >= total) return;
    const frame = requestAnimationFrame(() => {
      // Poster filling is background work; input and navigation can interrupt
      // React between cards instead of competing with an urgent full batch.
      startTransition(() => {
        setState((current) => current.key === resetKey
          ? { ...current, count: Math.min(total, current.count + step) }
          : current);
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [active, count, total, resetKey, step]);
  return Math.min(count, total);
}
