/** Project backend-owned list membership/order without re-sorting in React. */
export function projectLibraryItems<T extends { id: string; type: string }>(items: T[], keys: string[]): T[] {
  const byKey = new Map(items.map(item => [`${item.type}|${item.id}`, item]));
  return keys.flatMap(key => {
    const item = byKey.get(key);
    return item ? [item] : [];
  });
}
