import { describe, expect, it } from 'vitest';
import {
  isLikelyMucJid,
  isLikelyRoomLocalpart,
  toRoomJid,
} from './isLikelyMucJid';

const CONF = 'conference.xmpp.chat.ethora.com';
const REAL_ROOM = '646cc8dc96d4a4dc8f7b2f2d_6a7125459c9eec1a2cdf4918';

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

describe('isLikelyRoomLocalpart', () => {
  it('accepts an Ethora room localpart', () => {
    expect(isLikelyRoomLocalpart(REAL_ROOM)).toBe(true);
  });

  it.each([
    'rooms',
    'activeRoomJID',
    'usersSet',
    'subscribedRooms',
    'pushSubscriptionStatus',
    'presenceByRoom',
    'editAction',
    'isLoading',
    'loadingText',
    'reportRoom',
    'isChatUiVisible',
  ])('rejects the rooms-slice root key %s', (key) => {
    expect(isLikelyRoomLocalpart(key)).toBe(false);
  });

  it('rejects a value that is already a JID', () => {
    expect(isLikelyRoomLocalpart(`${REAL_ROOM}@${CONF}`)).toBe(false);
  });

  it('rejects anything without the appId underscore', () => {
    expect(isLikelyRoomLocalpart('mainchat')).toBe(false);
    expect(isLikelyRoomLocalpart('')).toBe(false);
    expect(isLikelyRoomLocalpart('   ')).toBe(false);
    expect(isLikelyRoomLocalpart(undefined)).toBe(false);
  });
});

describe('toRoomJid', () => {
  it('passes a full JID through untouched', () => {
    const jid = `${REAL_ROOM}@${CONF}`;
    expect(toRoomJid(jid, CONF)).toBe(jid);
  });

  it('appends the conference domain to a valid localpart', () => {
    expect(toRoomJid(REAL_ROOM, CONF)).toBe(`${REAL_ROOM}@${CONF}`);
  });

  // The live bug: these produced `usersSet@conference.host` and a stream of
  // "Conference room does not exist" errors against rooms that never existed.
  it.each([
    'usersSet',
    'activeRoomJID',
    'rooms',
    'subscribedRooms',
    'pushSubscriptionStatus',
  ])('refuses to manufacture a JID from the slice key %s', (key) => {
    expect(toRoomJid(key, CONF)).toBeNull();
  });

  it('returns null when there is no conference domain to append', () => {
    expect(toRoomJid(REAL_ROOM, undefined)).toBeNull();
    expect(toRoomJid(REAL_ROOM, '')).toBeNull();
  });

  it('returns null for empty / non-string input', () => {
    expect(toRoomJid('', CONF)).toBeNull();
    expect(toRoomJid(undefined, CONF)).toBeNull();
    expect(toRoomJid(null, CONF)).toBeNull();
  });

  it('round-trips: anything it returns is a valid MUC JID', () => {
    const inputs = [
      REAL_ROOM,
      `${REAL_ROOM}@${CONF}`,
      'usersSet',
      'rooms',
      '',
      undefined,
    ];
    for (const input of inputs) {
      const out = toRoomJid(input, CONF);
      if (out !== null) expect(isLikelyMucJid(out)).toBe(true);
    }
  });
});
