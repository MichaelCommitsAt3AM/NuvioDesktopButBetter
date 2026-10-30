/** Structural sharing for validated, immutable JSON snapshots from the bridge. */
export function shareSnapshot<T>(previous: T, next: T): T {
  if (Object.is(previous, next)) return previous;
  if (!previous || !next || typeof previous !== 'object' || typeof next !== 'object') return next;
  if (Array.isArray(previous) !== Array.isArray(next)) return next;
  const before = previous as Record<string, unknown>;
  const after = next as Record<string, unknown>;
  const keys = Object.keys(after);
  let equal = Object.keys(before).length === keys.length;
  const entries = keys.map(key => {
    const value = shareSnapshot(before[key], after[key]);
    if (!Object.hasOwn(before, key) || value !== before[key]) equal = false;
    return [key, value] as const;
  });
  if (equal) return previous;
  return (Array.isArray(next) ? entries.map(([, value]) => value) : Object.fromEntries(entries)) as T;
}
