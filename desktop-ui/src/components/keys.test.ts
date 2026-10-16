import { describe, expect, it } from 'vitest';
import { mediaKey, stableKeys } from './keys';

describe('stable list keys', () => {
  it('uses logical IDs without index suffixes', () => {
    expect(stableKeys([{ t: 'movie', id: 'a' }, { t: 'movie', id: 'b' }], (i) => mediaKey(i.t, i.id))).toEqual(['movie:a', 'movie:b']);
  });

  it('disambiguates only true duplicates', () => {
    expect(stableKeys(['a', 'a', 'b', 'a'], (i) => i)).toEqual(['a', 'a#2', 'b', 'a#3']);
  });

  it('keeps keys stable under reorder', () => {
    const keyOf = (i: { t: string; id: string }) => mediaKey(i.t, i.id);
    const before = stableKeys([{ t: 'm', id: '1' }, { t: 'm', id: '2' }], keyOf);
    const after = stableKeys([{ t: 'm', id: '2' }, { t: 'm', id: '1' }], keyOf);
    expect([...after].sort()).toEqual([...before].sort());
    expect(after).toContain('m:1');
  });
});
