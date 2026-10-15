import { useEffect, useState } from 'react';

export const PROGRESSIVE_MOUNT_STEP = 24;

/**
 * Counts from 0 up to `total` in per-frame steps so lists with hundreds of
 * posters paint their loading cards first and fill in without one giant
 * blocking commit. Tab switches show the destination immediately instead of
 * waiting for the whole tree to render.
 *
 * `resetKey` identifies the list (shelf key, catalog key, …). When it changes
 * the count restarts from 0; when only `total` grows (pagination appends) the
 * fill continues without flashing back to skeletons.
 */
export function useProgressiveCount(total: number, resetKey: string, step = PROGRESSIVE_MOUNT_STEP): number {
  const [state, setState] = useState({ key: resetKey, count: 0 });
  if (state.key !== resetKey) {
    setState({ key: resetKey, count: 0 });
  }
  const count = state.key === resetKey ? state.count : 0;
  useEffect(() => {
    if (count >= total) return;
    const frame = requestAnimationFrame(() => {
      setState((current) => current.key === resetKey
        ? { ...current, count: Math.min(total, current.count + step) }
        : current);
    });
    return () => cancelAnimationFrame(frame);
  }, [count, total, resetKey, step]);
  return Math.min(count, total);
}
