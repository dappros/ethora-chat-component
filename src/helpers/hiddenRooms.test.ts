import { describe, expect, it } from 'vitest';
import { isRoomHidden } from './hiddenRooms';

const mainChat = {
  jid: 'abc_123@conference.example.com',
  title: 'Main chat',
  name: 'Main chat',
};

describe('isRoomHidden', () => {
  it('returns false without hiddenRooms config', () => {
    expect(isRoomHidden(mainChat, undefined)).toBe(false);
    expect(isRoomHidden(mainChat, {})).toBe(false);
  });

  it('hides by case-insensitive title', () => {
    expect(
      isRoomHidden(mainChat, { hiddenRooms: { titles: ['main CHAT'] } })
    ).toBe(true);
    expect(
      isRoomHidden(mainChat, { hiddenRooms: { titles: ['Other room'] } })
    ).toBe(false);
  });

  it('hides by exact jid', () => {
    expect(
      isRoomHidden(mainChat, {
        hiddenRooms: { jids: ['abc_123@conference.example.com'] },
      })
    ).toBe(true);
    expect(
      isRoomHidden(mainChat, {
        hiddenRooms: { jids: ['other@conference.example.com'] },
      })
    ).toBe(false);
  });

  it('ignores empty/blank entries', () => {
    expect(
      isRoomHidden(mainChat, { hiddenRooms: { titles: ['', '  '], jids: [''] } })
    ).toBe(false);
  });
});
