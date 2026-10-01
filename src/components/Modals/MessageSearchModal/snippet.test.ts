import { describe, expect, it } from 'vitest';
import { buildSnippet } from './snippet';

const join = (parts: { text: string }[]) => parts.map((p) => p.text).join('');

describe('buildSnippet', () => {
  it('marks the match, case-insensitively, keeping the original casing', () => {
    const parts = buildSnippet('Hello World', 'world');
    expect(parts).toEqual([
      { text: 'Hello ', match: false },
      { text: 'World', match: true },
    ]);
  });

  it('treats regex characters in the query as plain text', () => {
    const parts = buildSnippet('cost is 5.50 (approx)', '5.50 (');
    expect(parts.find((p) => p.match)?.text).toBe('5.50 (');
    expect(buildSnippet('abc', '.')).toEqual([{ text: 'abc', match: false }]);
  });

  it('windows a long message around the match, with ellipses', () => {
    const body = `${'lorem ipsum '.repeat(30)}NEEDLE ${'dolor sit '.repeat(30)}`;
    const parts = buildSnippet(body, 'needle');
    const text = join(parts);

    expect(parts.some((p) => p.match && p.text === 'NEEDLE')).toBe(true);
    expect(text.length).toBeLessThan(body.length / 2);
    expect(text.startsWith('…')).toBe(true);
    expect(text.endsWith('…')).toBe(true);
  });

  it('collapses whitespace and returns nothing for an empty body', () => {
    expect(join(buildSnippet('a \n\n  b', 'zz'))).toBe('a b');
    expect(buildSnippet('', 'x')).toEqual([]);
  });
});
