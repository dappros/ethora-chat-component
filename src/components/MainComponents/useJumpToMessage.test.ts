import { describe, expect, it } from 'vitest';
import { findMessageIndex } from './useJumpToMessage';

const m = (id: string, xmppId?: string) => ({ id, xmppId }) as any;

describe('findMessageIndex', () => {
  const list = [
    m('100', 'send-text-message-a'),
    m('200', 'send-text-message-b'),
    m('300'),
  ];

  it('matches the stanza id the store keys history messages by', () => {
    expect(findMessageIndex(list, ['200'])).toBe(1);
  });

  it('matches the client message id kept as xmppId', () => {
    expect(findMessageIndex(list, ['send-text-message-a'])).toBe(0);
  });

  it('accepts either id of a search hit', () => {
    expect(findMessageIndex(list, ['999', 'send-text-message-b'])).toBe(1);
  });

  it('returns -1 when the message is not loaded', () => {
    expect(findMessageIndex(list, ['nope'])).toBe(-1);
    expect(findMessageIndex([], ['100'])).toBe(-1);
  });
});

describe('findMessageIndex without any id (archive rows often carry none)', () => {
  const list = [
    { id: '1', body: 'hello', date: '2026-06-26T10:00:00.000Z' },
    { id: '2', body: 'hello', date: '2026-06-26T10:30:00.000Z' },
    { id: '3', body: 'other', date: '2026-06-26T10:30:01.000Z' },
  ] as any;

  it('matches on text and a close timestamp, picking the right one of two identical texts', () => {
    const at = '2026-06-26T10:30:02.500Z';
    expect(findMessageIndex(list, [], { createdAt: at, body: 'hello' })).toBe(
      1
    );
  });

  it('does not match when the text or the time is off', () => {
    expect(
      findMessageIndex(list, [], {
        createdAt: '2026-06-26T10:30:00.000Z',
        body: 'nope',
      })
    ).toBe(-1);
    expect(
      findMessageIndex(list, [], {
        createdAt: '2026-06-26T12:00:00.000Z',
        body: 'hello',
      })
    ).toBe(-1);
    expect(
      findMessageIndex(list, [], { createdAt: 'garbage', body: 'hello' })
    ).toBe(-1);
    expect(findMessageIndex(list, [])).toBe(-1);
  });

  it('prefers an id match over a content match', () => {
    expect(
      findMessageIndex(list, ['3'], {
        createdAt: '2026-06-26T10:00:00.000Z',
        body: 'hello',
      })
    ).toBe(2);
  });
});
