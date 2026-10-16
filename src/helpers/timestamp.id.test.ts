import { describe, expect, it } from 'vitest';
import { getTimestampFromId } from './timestamp';

describe('getTimestampFromId', () => {
  it('reads an all-digit stanza id as microseconds', () => {
    expect(getTimestampFromId('1791180018286418')).toBe(1791180018286);
  });

  it('returns 0 for uuid-style ids, even with a long digit run', () => {
    expect(
      getTimestampFromId('send-text-message:a2b4cc53-96d8-4510-81ee-8b6619068803')
    ).toBe(0);
    expect(getTimestampFromId('msg 12')).toBe(0);
  });

  it('returns 0 for empty or non-string input', () => {
    expect(getTimestampFromId('')).toBe(0);
    expect(getTimestampFromId(undefined)).toBe(0);
  });
});
