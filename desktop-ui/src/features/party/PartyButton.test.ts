import { describe, expect, it } from 'vitest';
import { formatPartyCode, normalizePartyCode } from './PartyButton';

describe('party code input', () => {
  it('uppercases, drops ambiguous characters and caps at six', () => {
    expect(normalizePartyCode('abc-d1o2efg')).toBe('ABCD2E');
  });
  it('formats as two groups of three', () => {
    expect(formatPartyCode('ABCDEF')).toBe('ABC DEF');
    expect(formatPartyCode('AB')).toBe('AB');
  });
});
