import { describe, it, expect } from 'vitest';
import { deepMerge } from './insertMessageWithDelimiter';

describe('deepMerge prototype safety', () => {
  it('ignores __proto__, constructor and prototype keys', () => {
    const payload = JSON.parse(
      '{"__proto__":{"polluted":"yes"},"constructor":{"prototype":{"polluted2":"yes"}},"prototype":{"p":1},"ok":1}'
    );
    const result = deepMerge({}, payload);
    expect(({} as any).polluted).toBeUndefined();
    expect(({} as any).polluted2).toBeUndefined();
    expect(result.ok).toBe(1);
    expect(Object.keys(result)).toEqual(['ok']);
  });

  it('still merges nested objects', () => {
    const result = deepMerge({ a: { x: 1 } }, { a: { y: 2 }, b: 3 });
    expect(result).toEqual({ a: { x: 1, y: 2 }, b: 3 });
  });
});
