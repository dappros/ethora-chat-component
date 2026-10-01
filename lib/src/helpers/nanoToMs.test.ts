import { describe, expect, it } from 'vitest';
import { nanoToMs } from './nanoToMs';

describe('nanoToMs', () => {
  it('cuts a microsecond id down to milliseconds', () => {
    expect(nanoToMs('1781788682864696')).toBe(1781788682864);
  });

  it('does not throw when a reaction row carries no timestamp', () => {
    expect(nanoToMs(undefined)).toBeNull();
    expect(nanoToMs(null)).toBeNull();
  });
});
