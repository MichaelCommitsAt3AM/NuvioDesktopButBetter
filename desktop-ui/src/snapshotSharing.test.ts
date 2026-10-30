import { expect, it } from 'vitest';
import { shareSnapshot } from './snapshotSharing';

it('reuses equal JSON snapshots and unchanged nested items after enrichment', () => {
  const previous = { items: [{ id: 'a', progress: 1 }, { id: 'b', progress: 2 }], loading: false };
  expect(shareSnapshot(previous, JSON.parse(JSON.stringify(previous)))).toBe(previous);
  const next = shareSnapshot(previous, { items: [{ id: 'a', progress: 1 }, { id: 'b', progress: 3 }], loading: false });
  expect(next).not.toBe(previous);
  expect(next.items[0]).toBe(previous.items[0]);
  expect(next.items[1].progress).toBe(3);
  expect(previous.items[1].progress).toBe(2);
});

it('preserves additions, deletions, array order and null transitions', () => {
  expect(shareSnapshot({ a: 1, b: 2 } as object, { a: 1 })).toEqual({ a: 1 });
  expect(shareSnapshot({ a: 1 } as object, { a: 1, b: undefined })).toHaveProperty('b');
  expect(shareSnapshot([1, 2], [2, 1, 3])).toEqual([2, 1, 3]);
  expect(shareSnapshot([1, 2], [])).toEqual([]);
  expect(shareSnapshot<object | null>({}, null)).toBeNull();
  expect(shareSnapshot<object | null>(null, {})).toEqual({});
});
