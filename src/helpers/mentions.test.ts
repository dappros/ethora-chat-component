import {
  rankMentionCandidates,
  findActiveMentionQuery,
  shiftMentionSpans,
  validateMentionSpans,
  findMentionEndingAt,
  spliceMentionMarkup,
  computeEditRange,
} from './mentions';
import { RoomMember } from '../types/types';

const members: RoomMember[] = [
  { _id: '1', firstName: 'Roman', lastName: 'Leshchuh', xmppUsername: 'roman@x' },
  { _id: '2', firstName: 'Robert', lastName: 'Anders', xmppUsername: 'robert@x' },
  { _id: '3', firstName: 'Anna', lastName: 'Roberts', xmppUsername: 'anna@x' },
  { _id: '4', firstName: 'Me', lastName: 'Self', xmppUsername: 'me@x' },
];

describe('rankMentionCandidates', () => {
  it('ranks prefix matches above substring matches, alphabetical ties', () => {
    const result = rankMentionCandidates('rob', members, 'me@x');
    expect(result.map((r) => r.name)).toEqual(['Robert Anders', 'Anna Roberts']);
  });

  it('is case-insensitive', () => {
    const result = rankMentionCandidates('ROMAN', members, 'me@x');
    expect(result.map((r) => r.name)).toEqual(['Roman Leshchuh']);
  });

  it('excludes the current user', () => {
    const result = rankMentionCandidates('', members, 'me@x');
    expect(result.some((r) => r.name === 'Me Self')).toBe(false);
  });

  it('excludes self by bare-jid local part even if selfId carries a resource', () => {
    const result = rankMentionCandidates('', members, 'me@x/resource');
    expect(result.some((r) => r.name === 'Me Self')).toBe(false);
  });
});

describe('findActiveMentionQuery', () => {
  it('opens at the start of input', () => {
    expect(findActiveMentionQuery('@rom', 4)).toEqual({ start: 0, query: 'rom' });
  });

  it('opens after whitespace', () => {
    expect(findActiveMentionQuery('hey @rom', 8)).toEqual({ start: 4, query: 'rom' });
  });

  it('does not open mid-word (e.g. an email-looking string)', () => {
    expect(findActiveMentionQuery('foo@bar', 7)).toBeNull();
  });

  it('closes once a space follows the @', () => {
    expect(findActiveMentionQuery('hey @rom is here', 9)).toBeNull();
  });

  it('returns null with no @ before the caret', () => {
    expect(findActiveMentionQuery('hello', 5)).toBeNull();
  });
});

describe('shiftMentionSpans', () => {
  const spans = [
    { jid: 'a@x', name: 'Alice', offset: 4, length: 5 }, // "@Alice"... wait length covers name only
    { jid: 'b@x', name: 'Bob', offset: 20, length: 3 },
  ];

  it('leaves spans before the edit untouched', () => {
    const result = shiftMentionSpans(spans, 30, 30, 2);
    expect(result).toEqual(spans);
  });

  it('shifts spans after an insertion before them', () => {
    const result = shiftMentionSpans(spans, 0, 0, 3);
    expect(result[0].offset).toBe(7);
    expect(result[1].offset).toBe(23);
  });

  it('shifts spans after a deletion before them', () => {
    const result = shiftMentionSpans(spans, 0, 2, 0);
    expect(result[0].offset).toBe(2);
    expect(result[1].offset).toBe(18);
  });

  it('drops a span whose range overlaps the edit', () => {
    const result = shiftMentionSpans(spans, 5, 7, 1);
    expect(result.find((s) => s.name === 'Alice')).toBeUndefined();
    expect(result.find((s) => s.name === 'Bob')).toBeDefined();
  });
});

describe('validateMentionSpans', () => {
  it('keeps a span whose text still reads @Name', () => {
    const text = 'hey @Roman check this';
    const spans = [{ jid: 'roman@x', name: 'Roman', offset: 4, length: 6 }];
    expect(validateMentionSpans(text, spans)).toEqual(spans);
  });

  it('drops a span whose underlying text was edited away', () => {
    const text = 'hey @Rom check this';
    const spans = [{ jid: 'roman@x', name: 'Roman', offset: 4, length: 6 }];
    expect(validateMentionSpans(text, spans)).toEqual([]);
  });

  it('drops a span that is out of bounds', () => {
    const text = 'short';
    const spans = [{ jid: 'roman@x', name: 'Roman', offset: 10, length: 6 }];
    expect(validateMentionSpans(text, spans)).toEqual([]);
  });
});

describe('findMentionEndingAt', () => {
  it('finds a mention whose token ends exactly at the caret', () => {
    const spans = [{ jid: 'roman@x', name: 'Roman', offset: 4, length: 6 }];
    expect(findMentionEndingAt(spans, 10)).toEqual(spans[0]);
  });

  it('returns undefined when the caret is mid-token or elsewhere', () => {
    const spans = [{ jid: 'roman@x', name: 'Roman', offset: 4, length: 6 }];
    expect(findMentionEndingAt(spans, 7)).toBeUndefined();
    expect(findMentionEndingAt(spans, 0)).toBeUndefined();
  });
});

describe('computeEditRange', () => {
  it('detects a pure insertion', () => {
    expect(computeEditRange('hello world', 'hello there world')).toEqual({
      start: 6,
      end: 6,
      insertedLength: 6,
    });
  });

  it('detects a pure deletion', () => {
    expect(computeEditRange('hello there world', 'hello world')).toEqual({
      start: 6,
      end: 12,
      insertedLength: 0,
    });
  });

  it('detects a replacement in the middle', () => {
    expect(computeEditRange('hey @Rob check', 'hey @Robert check')).toEqual({
      start: 8,
      end: 8,
      insertedLength: 3,
    });
  });

  it('is a no-op range for identical text', () => {
    expect(computeEditRange('same', 'same')).toEqual({
      start: 4,
      end: 4,
      insertedLength: 0,
    });
  });
});

describe('spliceMentionMarkup', () => {
  it('wraps a mention token in a raw <mention> tag', () => {
    const text = 'hey @Roman check this';
    const spans = [{ jid: 'roman@x', name: 'Roman', offset: 4, length: 6 }];
    expect(spliceMentionMarkup(text, spans)).toBe(
      'hey <mention data-jid="roman@x" data-name="Roman">@Roman</mention> check this'
    );
  });

  it('handles multiple mentions back-to-front without offset drift', () => {
    const text = '@Alice and @Bob';
    const spans = [
      { jid: 'a@x', name: 'Alice', offset: 0, length: 6 },
      { jid: 'b@x', name: 'Bob', offset: 11, length: 4 },
    ];
    const result = spliceMentionMarkup(text, spans);
    expect(result).toContain('data-jid="a@x"');
    expect(result).toContain('data-jid="b@x"');
    expect(result.indexOf('Alice')).toBeLessThan(result.indexOf('Bob'));
  });

  it('escapes HTML-sensitive characters in name/jid', () => {
    const text = '@<script>';
    const spans = [{ jid: '"x"', name: '<script>', offset: 0, length: 9 }];
    const result = spliceMentionMarkup(text, spans);
    expect(result).not.toContain('<script>@');
    expect(result).toContain('&lt;script&gt;');
  });

  it('is a no-op for missing/malformed mentions', () => {
    expect(spliceMentionMarkup('hello', undefined)).toBe('hello');
    expect(spliceMentionMarkup('hello', [])).toBe('hello');
    expect(
      spliceMentionMarkup('hello', [
        { jid: 'x', name: 'Nope', offset: 0, length: 100 },
      ])
    ).toBe('hello');
  });
});
