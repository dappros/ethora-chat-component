import { describe, it, expect } from 'vitest';
import { messageRunEnds } from './messageRuns';
import { IMessage } from '../types/types';

const msg = (id: string, user: string, date = '2026-10-14T12:00:00', extra: Partial<IMessage> = {}) =>
  ({ id, user: { id: user }, date: new Date(date).toISOString(), ...extra }) as IMessage;

describe('messageRunEnds', () => {
  it('ends only the last message of each sender run', () => {
    const list = [msg('a', 'x'), msg('b', 'x'), msg('c', 'x'), msg('d', 'y'), msg('e', 'y')];
    expect([...messageRunEnds(list)].sort()).toEqual(['c', 'e']);
  });

  it('ends a run at a system row even from the same sender', () => {
    const list = [msg('a', 'x'), msg('s', 'x', undefined, { isSystemMessage: 'true' }), msg('b', 'x')];
    expect(messageRunEnds(list).has('a')).toBe(true);
    expect(messageRunEnds(list).has('b')).toBe(true);
  });

  it('ends a run at midnight', () => {
    const list = [msg('a', 'x', '2026-10-13T23:59:00'), msg('b', 'x', '2026-10-14T00:01:00')];
    expect(messageRunEnds(list).has('a')).toBe(true);
  });

  it('treats the single last message of the list as a run end', () => {
    expect(messageRunEnds([msg('a', 'x')]).has('a')).toBe(true);
  });
});
