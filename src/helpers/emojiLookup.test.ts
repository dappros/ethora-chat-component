import { describe, expect, it } from 'vitest';
import { emojiNative } from './emojiLookup';

// Reactions arrive as emoji-mart ids; the renderer must never throw on an
// unknown id or on a host that stubbed the dataset, and a bare character on
// the wire should render as itself.
describe('emojiNative', () => {
  it('resolves emoji-mart ids to characters', () => {
    expect(emojiNative('+1')).toBe('👍');
    expect(emojiNative('heart')).toBe('❤️');
    expect(emojiNative('joy')).toBe('😂');
  });

  it('passes a raw emoji character through', () => {
    expect(emojiNative('👍')).toBe('👍');
    expect(emojiNative('🎉')).toBe('🎉');
  });

  it('renders nothing for unknown ids, words and empties', () => {
    expect(emojiNative('not_an_emoji_id')).toBe('');
    expect(emojiNative('thumbs up')).toBe('');
    expect(emojiNative('')).toBe('');
    expect(emojiNative(undefined)).toBe('');
  });
});
