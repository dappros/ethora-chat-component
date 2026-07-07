import { describe, expect, it } from 'vitest';
import { isLikelyMucJid } from './isLikelyMucJid';

describe('isLikelyMucJid', () => {
  it('accepts a real MUC room JID', () => {
    expect(
      isLikelyMucJid(
        '646cc8dc96d4a4dc8f7b2f2d_6a2718d5ef26ca2d3e1b7991@conference.xmpp.chat-qa.ethora.com'
      )
    ).toBe(true);
  });

  it('accepts a MUC JID with a resource part', () => {
    expect(isLikelyMucJid('room@conference.xmpp.example.com/resource')).toBe(
      true
    );
  });

  // Exact keys observed leaking into a live account's rooms.rooms map and
  // getting queued as fake MAM-history "rooms" (root-slice fields from
  // RoomMessagesState, not JIDs).
  it.each([
    'activeRoomJID',
    'usersSet',
    'subscribedRooms',
    'pushSubscriptionStatus',
    'rooms',
    'isChatUiVisible',
    'isLoading',
  ])('rejects the root-state key %s', (key) => {
    expect(isLikelyMucJid(key)).toBe(false);
  });

  it('rejects a bare app ID without the conference suffix', () => {
    expect(isLikelyMucJid('646cc8dc96d4a4dc8f7b2f2d')).toBe(false);
  });

  it('rejects a non-conference domain', () => {
    expect(isLikelyMucJid('user@xmpp.chat-qa.ethora.com')).toBe(false);
  });

  it('rejects non-string / empty / malformed input', () => {
    expect(isLikelyMucJid(undefined)).toBe(false);
    expect(isLikelyMucJid(null)).toBe(false);
    expect(isLikelyMucJid('')).toBe(false);
    expect(isLikelyMucJid(42)).toBe(false);
    expect(isLikelyMucJid('@conference.example.com')).toBe(false);
  });
});
