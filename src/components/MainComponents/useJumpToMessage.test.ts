import { describe, expect, it } from 'vitest';
import { findMessageIndex } from './useJumpToMessage';

const m = (id: string, xmppId?: string) => ({ id, xmppId }) as any;

describe('findMessageIndex', () => {
  const list = [m('100', 'send-text-message-a'), m('200', 'send-text-message-b'), m('300')];

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
