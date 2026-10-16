/**
 * Duplicate-safe stable keys for mutable lists.
 * Mirrors Kotlin's `withDuplicateSafeLazyKeys`: identity is the logical ID
 * (media type/id, video id, folder id), never the transient visual index.
 * The index suffix is only a disambiguator when the same ID occurs twice in
 * one list, so reorder/filter operations keep mounted cards stable.
 */
export function stableKeys<T>(items: readonly T[], keyOf: (item: T) => string): string[] {
  const seen = new Map<string, number>();
  return items.map((item) => {
    const base = keyOf(item);
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base}#${count}`;
  });
}

export function mediaKey(type: string, id: string | number): string {
  return `${type}:${id}`;
}
