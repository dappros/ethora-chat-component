import { describe, expect, it } from 'vitest';
import {
  optimizePersistedRooms,
  compactUsersSetForPersist,
  restoreUsersSetForRehydrate,
  compactMessageForPersist,
  getRoomActivityTimestamp,
  limitMessagesTransform,
  sanitizeRoomsStateTransform,
  scrubSensitiveChatStateTransform,
  MAX_MESSAGES_PER_ROOM,
  MAX_PERSISTED_ROOMS,
  PERSISTED_ROOMS_CHAR_BUDGET,
  ENCRYPTION_INFLATION_FACTOR,
} from './index';
import { IMessage, IRoom } from '../types/types';

const makeRoom = (jid: string, overrides: Partial<IRoom> = {}): IRoom =>
  ({
    jid,
    name: jid,
    title: jid,
    usersCnt: 0,
    messages: [],
    isLoading: false,
    roomBg: null,
    ...overrides,
  }) as IRoom;

const makeMessage = (id: string, overrides: Partial<IMessage> = {}): IMessage =>
  ({
    id,
    body: `msg ${id}`,
    date: new Date().toISOString(),
    user: { id: 'someone', name: 'Someone' },
    roomJid: 'r1@conf',
    ...overrides,
  }) as IMessage;

// Regression coverage for the "persist:roomMessages exceeded the quota"
// QuotaExceededError - the persisted snapshot must stay small through
// per-message field whitelisting first, with size-budget eviction as the
// backstop, regardless of how much a long-lived session accumulates.
describe('getRoomActivityTimestamp', () => {
  it('prefers lastMessageTimestamp, then messageStats, then lastViewedTimestamp', () => {
    expect(getRoomActivityTimestamp(makeRoom('a', { lastMessageTimestamp: 3 }))).toBe(3);
    expect(
      getRoomActivityTimestamp(
        makeRoom('a', { messageStats: { lastMessageTimestamp: 2 } })
      )
    ).toBe(2);
    expect(getRoomActivityTimestamp(makeRoom('a', { lastViewedTimestamp: 1 }))).toBe(1);
    expect(getRoomActivityTimestamp(makeRoom('a'))).toBe(0);
  });
});

describe('compactMessageForPersist', () => {
  it('keeps the fields the transcript UI actually renders', () => {
    const message = makeMessage('m1', {
      mimetype: 'image/png',
      location: 'https://cdn.example.com/a.png',
      locationPreview: 'https://cdn.example.com/a-thumb.png',
      isMediafile: 'true',
      langSource: 'en',
    });

    const compact = compactMessageForPersist(message);

    expect(compact.id).toBe('m1');
    expect(compact.body).toBe('msg m1');
    expect(compact.location).toBe('https://cdn.example.com/a.png');
    expect(compact.locationPreview).toBe('https://cdn.example.com/a-thumb.png');
    expect(compact.isMediafile).toBe('true');
    expect(compact.langSource).toBe('en');
    // id + name only. usersSet is the canonical name/avatar store and
    // renderers prefer it, but `name` is the sole home for broadcast /
    // system senders ("Ethora"), which never enter usersSet.
    expect(compact.user).toEqual({ id: 'someone', name: 'Someone' });
  });

  it('drops the wire-protocol junk that createMessageFromXml spreads onto every message', () => {
    const message = makeMessage('m1', {
      // These arrive as <data> attrs on every stanza and used to be
      // persisted verbatim for every single message.
      senderFirstName: 'A',
      senderLastName: 'B',
      fullName: 'A B',
      photo: 'https://cdn.example.com/avatar.png',
      photoURL: 'https://cdn.example.com/avatar.png',
      senderJID: 'a@example.com/res',
      senderWalletAddress: '0xabc',
      tokenAmount: '0',
      quickReplies: '',
      notDisplayedValue: '',
      push: 'true',
      translations: { pt: { translatedText: 'olá', language: 'pt', languageName: 'Portuguese' } },
      reaction: { bob: { emoji: ['👍'], data: {} } },
      reply: [makeMessage('child')],
    } as any);

    const compact = compactMessageForPersist(message) as any;

    for (const junk of [
      'senderFirstName',
      'senderLastName',
      'fullName',
      'photo',
      'photoURL',
      'senderJID',
      'senderWalletAddress',
      'tokenAmount',
      'quickReplies',
      'notDisplayedValue',
      'push',
      'translations',
      'reaction',
      'reply',
    ]) {
      expect(compact[junk], junk).toBeUndefined();
    }
  });

  it('strips auth material an optimistic send leaked into message.user', () => {
    const message = makeMessage('m1', {
      user: {
        id: 'me',
        name: 'Me',
        xmppUsername: 'me',
        profileImage: 'https://cdn.example.com/me.png',
        token: 'JWT secret',
        refreshToken: 'JWT refresh-secret',
        walletAddress: '0xme',
      } as any,
    });

    const compact = compactMessageForPersist(message) as any;

    expect(compact.user.token).toBeUndefined();
    expect(compact.user.refreshToken).toBeUndefined();
    expect(compact.user.walletAddress).toBeUndefined();
    expect(compact.user.id).toBe('me');
    // The avatar URL is re-resolved from usersSet - it's the bulky part
    // of the per-message identity copy.
    expect(compact.user.profileImage).toBeUndefined();
  });

  // This whitelist is easy to "helpfully" widen later. The wire identity
  // is duplicated across every message of every room, and the avatar URLs
  // are the bulky part of it - usersSet already holds all of it.
  it('persists only id + name - no avatar/xmppUsername copy per message', () => {
    const compact = compactMessageForPersist(
      makeMessage('m1', {
        user: {
          id: 'me',
          name: 'Me',
          firstName: 'Me',
          lastName: 'Myself',
          profileImage: 'https://cdn.example.com/me.png',
          photoURL: 'https://cdn.example.com/me.png',
          xmppUsername: 'me',
        } as any,
      })
    );

    expect(Object.keys(compact.user as object).sort()).toEqual(['id', 'name']);
  });
});

describe('optimizePersistedRooms', () => {
  it('caps each room to the last MAX_MESSAGES_PER_ROOM messages, newest kept', () => {
    const messages = Array.from({ length: MAX_MESSAGES_PER_ROOM + 20 }, (_, i) =>
      makeMessage(`m${i}`)
    );
    const result = optimizePersistedRooms({
      'r1@conf': makeRoom('r1@conf', { messages }),
    });

    expect(result['r1@conf'].messages).toHaveLength(MAX_MESSAGES_PER_ROOM);
    expect(result['r1@conf'].messages[0].id).toBe('m20');
  });

  it('keeps only the MAX_PERSISTED_ROOMS most recently active rooms', () => {
    const rooms: Record<string, IRoom> = {};
    const roomCount = MAX_PERSISTED_ROOMS + 10;
    for (let i = 0; i < roomCount; i++) {
      rooms[`r${i}@conf`] = makeRoom(`r${i}@conf`, { lastMessageTimestamp: i });
    }

    const result = optimizePersistedRooms(rooms);

    expect(Object.keys(result)).toHaveLength(MAX_PERSISTED_ROOMS);
    expect(result[`r${roomCount - 1}@conf`]).toBeDefined();
    expect(result['r0@conf']).toBeUndefined();
  });

  it('compacts every persisted message', () => {
    const message = makeMessage('m1', { tokenAmount: '0', push: 'true' } as any);
    const result = optimizePersistedRooms({
      'r1@conf': makeRoom('r1@conf', { messages: [message] }),
    });

    expect((result['r1@conf'].messages[0] as any).tokenAmount).toBeUndefined();
    expect((result['r1@conf'].messages[0] as any).push).toBeUndefined();
  });

  it('when over budget, evicts message caches from the LEAST active rooms but keeps their shells', () => {
    const bigBody = 'x'.repeat(2000);
    const rooms: Record<string, IRoom> = {};
    for (let i = 0; i < 10; i++) {
      rooms[`r${i}@conf`] = makeRoom(`r${i}@conf`, {
        lastMessageTimestamp: i,
        unreadMessages: 3,
        messages: Array.from({ length: 10 }, (_, j) =>
          makeMessage(`m${i}-${j}`, { body: bigBody })
        ),
      });
    }
    // Every room serializes to ~20k chars; a 60k budget fits only ~3 rooms
    // with messages.
    const result = optimizePersistedRooms(rooms, 60_000);

    // All 10 room entries survive (shells keep unread counts / previews).
    expect(Object.keys(result)).toHaveLength(10);
    expect(result['r0@conf'].unreadMessages).toBe(3);
    // The most recently active room keeps its transcript cache...
    expect(result['r9@conf'].messages.length).toBeGreaterThan(0);
    // ...the least recently active one gave its messages up.
    expect(result['r0@conf'].messages).toHaveLength(0);
    // And the total is actually under budget now.
    const total = Object.values(result).reduce(
      (sum, room) => sum + JSON.stringify(room).length,
      0
    );
    expect(total).toBeLessThanOrEqual(60_000);
  });

  it('does not evict anything while under budget', () => {
    const rooms = {
      'r1@conf': makeRoom('r1@conf', { messages: [makeMessage('m1')] }),
      'r2@conf': makeRoom('r2@conf', { messages: [makeMessage('m2')] }),
    };

    const result = optimizePersistedRooms(rooms);

    expect(result['r1@conf'].messages).toHaveLength(1);
    expect(result['r2@conf'].messages).toHaveLength(1);
  });

  it('handles an empty/undefined rooms map without throwing', () => {
    expect(optimizePersistedRooms({})).toEqual({});
    expect(optimizePersistedRooms(undefined as any)).toEqual({});
  });
});

// redux-persist calls transforms PER TOP-LEVEL KEY of the slice state:
// `transformer.in(state[key], key, state)`. The old transforms assumed the
// whole slice object ({rooms: {...}}), so for key 'rooms' they read
// `.rooms` off the rooms MAP (undefined), capped an empty object, and
// passed the real uncapped map straight through - the message cap never
// worked at all (persist:roomMessages observed at ~7M chars), and every
// persist write serialized+encrypted megabytes on the main thread, making
// each message send visibly slow. These tests exercise the transforms
// through redux-persist's actual calling convention.
describe('persist transforms - per-key calling convention', () => {
  it('limitMessagesTransform caps the rooms map when called with key "rooms"', () => {
    const messages = Array.from({ length: MAX_MESSAGES_PER_ROOM + 50 }, (_, i) =>
      makeMessage(`m${i}`)
    );
    const roomsMap = { 'r1@conf': makeRoom('r1@conf', { messages }) };

    const persisted = limitMessagesTransform.in(roomsMap, 'rooms', {} as any) as any;

    // The cap actually applied - and no slice keys leaked into the map.
    expect(persisted['r1@conf'].messages).toHaveLength(MAX_MESSAGES_PER_ROOM);
    expect(persisted.rooms).toBeUndefined();
    expect(persisted.activeRoomJID).toBeUndefined();
    expect(persisted.usersSet).toBeUndefined();
  });

  it('limitMessagesTransform leaves keys it has no business touching alone', () => {
    // usersSet is deliberately NOT in this list any more - it now goes
    // through the xmppUsername de-dup (see its own describe block).
    const subscribed = ['r1@conf'];

    expect(
      limitMessagesTransform.in(subscribed, 'subscribedRooms', {} as any)
    ).toBe(subscribed);
    expect(
      limitMessagesTransform.in('anything', 'pushSubscriptionStatus', {} as any)
    ).toBe('anything');
  });

  it('sanitizeRoomsStateTransform drops legacy leaked slice keys from the rooms map on rehydrate', () => {
    // Shape an old broken build actually persisted: JID rooms plus leaked
    // slice keys at the same level.
    const legacyPersistedRoomsMap = {
      'r1@conf': makeRoom('r1@conf', { messages: [makeMessage('m1')] }),
      rooms: {},
      activeRoomJID: 'r1@conf',
      usersSet: {},
    };

    const rehydrated = sanitizeRoomsStateTransform.out(
      legacyPersistedRoomsMap,
      'rooms',
      {} as any
    ) as any;

    expect(rehydrated['r1@conf']).toBeDefined();
    expect(rehydrated.rooms).toBeUndefined();
    expect(rehydrated.activeRoomJID).toBeUndefined();
    expect(rehydrated.usersSet).toBeUndefined();
  });

  it('scrubSensitiveChatStateTransform strips auth material when called with key "user"', () => {
    const user = {
      xmppUsername: 'me',
      firstName: 'Me',
      token: 'JWT secret',
      refreshToken: 'JWT refresh',
      xmppPassword: 'hunter2',
    };

    const persisted = scrubSensitiveChatStateTransform.in(user, 'user', {} as any) as any;

    expect(persisted.token).toBe('');
    expect(persisted.refreshToken).toBe('');
    expect(persisted.xmppPassword).toBe('');
    expect(persisted.firstName).toBe('Me');
  });

  it('scrubSensitiveChatStateTransform leaves other keys untouched', () => {
    expect(
      scrubSensitiveChatStateTransform.in('en', 'langSource', {} as any)
    ).toBe('en');
  });
});

// Reproduces the shape measured in a real user's localStorage: rooms
// whose `members` roster (3478 entries, ~838k chars) dwarfs everything
// else by ~750x. The eviction pass can only drop `messages`, so a budget
// blown by ROSTERS made it throw away every message in every room, still
// land ~4.2M, and persist a multi-megabyte blob containing zero of the
// thing the cache exists for. Reload then showed rooms with no history
// ("empty chats") and the oversized write kept tripping the quota.
describe('a member roster must never squeeze the message cache out', () => {
  const makeRoster = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      _id: `id${i}`,
      xmppUsername: `appid_user${i}`,
      firstName: `First${i}`,
      lastName: `Last${i}`,
      profileImage: `https://cdn.example.com/u${i}.png`,
      role: 'participant',
      ban_status: 'none',
      last_active: 1700000000,
    })) as any;

  const makeRoomsWithHugeRosters = () => {
    const roster = makeRoster(3478);
    const rooms: Record<string, IRoom> = {};
    for (let r = 0; r < 5; r++) {
      rooms[`room${r}@conference.example.com`] = makeRoom(
        `room${r}@conference.example.com`,
        {
          lastMessageTimestamp: 1700000000 + r,
          usersCnt: 3478,
          members: roster,
          messages: Array.from({ length: 60 }, (_, m) =>
            makeMessage(`m${r}-${m}`, { body: 'hello world '.repeat(8) })
          ),
        } as any
      );
    }
    return rooms;
  };

  it('keeps every message even when rosters blow the budget many times over', () => {
    const rooms = makeRoomsWithHugeRosters();
    // Sanity: the input really is the pathological shape (~3.8M).
    expect(JSON.stringify(rooms).length).toBeGreaterThan(
      PERSISTED_ROOMS_CHAR_BUDGET * 3
    );

    const persisted = optimizePersistedRooms(rooms);

    const totalMessages = Object.values(persisted).reduce(
      (sum, room) => sum + room.messages.length,
      0
    );
    // The whole point: 5 rooms x 60 messages all survive. The old code
    // shelled them to 0 and STILL blew the budget.
    expect(totalMessages).toBe(300);
  });

  it('drops the roster itself - the thing that was actually over budget', () => {
    const persisted = optimizePersistedRooms(makeRoomsWithHugeRosters());

    Object.values(persisted).forEach((room) => {
      expect('members' in room).toBe(false);
    });
    expect(JSON.stringify(persisted).length).toBeLessThanOrEqual(
      PERSISTED_ROOMS_CHAR_BUDGET
    );
  });

  it('preserves usersCnt, so the header still shows the real member count', () => {
    const persisted = optimizePersistedRooms(makeRoomsWithHugeRosters());

    Object.values(persisted).forEach((room) => {
      expect(room.usersCnt).toBe(3478);
    });
  });

  it('derives usersCnt from the roster when the room has no explicit count', () => {
    const rooms: Record<string, IRoom> = {
      'r@conf': makeRoom('r@conf', {
        usersCnt: undefined,
        members: makeRoster(7),
        messages: [],
      } as any),
    };

    expect(optimizePersistedRooms(rooms)['r@conf'].usersCnt).toBe(7);
  });
});

// usersSet is the OTHER refetched pile that outgrew the cache it lives
// in: measured on a real session it was 1,022,344 chars for 3,483 users -
// 95% of the entire persisted blob - while the messages it exists to
// annotate were 5%. 23% of the whole blob was one field duplicated per
// entry, because usersSet is keyed BY xmppUsername.
describe('usersSet xmppUsername de-duplication', () => {
  const usersSet = {
    appid_alice: {
      _id: 'a1',
      xmppUsername: 'appid_alice',
      firstName: 'Alice',
      lastName: 'Doe',
      profileImage: 'https://cdn.example.com/a.png',
    },
    appid_bob: {
      _id: 'b1',
      xmppUsername: 'appid_bob',
      firstName: 'Bob',
      lastName: 'Roe',
    },
  } as any;

  it('drops the field that is already the key', () => {
    const compact = compactUsersSetForPersist(usersSet);

    expect('xmppUsername' in compact.appid_alice).toBe(false);
    expect('xmppUsername' in compact.appid_bob).toBe(false);
    // Everything else is untouched.
    expect(compact.appid_alice.firstName).toBe('Alice');
    expect(compact.appid_alice.profileImage).toBe('https://cdn.example.com/a.png');
  });

  // The whole safety argument for dropping it: the key IS the value, so
  // every field value must survive the round trip. (Key ORDER shifts -
  // xmppUsername returns last - which is why this asserts deep equality,
  // not a stringified compare.) If this ever fails, the optimization is
  // silently corrupting user identities.
  it('round-trips without losing a single field value', () => {
    const restored = restoreUsersSetForRehydrate(
      compactUsersSetForPersist(usersSet)
    );

    expect(restored).toEqual(usersSet);
  });

  it('rebuilds xmppUsername from the key on the way back in', () => {
    const restored = restoreUsersSetForRehydrate({
      appid_carol: { _id: 'c1', firstName: 'Carol' },
    } as any);

    expect(restored.appid_carol.xmppUsername).toBe('appid_carol');
  });

  it('measurably shrinks a realistic set', () => {
    const many: Record<string, any> = {};
    for (let i = 0; i < 500; i++) {
      const jid = `646cc8dc96d4a4dc8f7b2f2d_646cc8d396d4a4dc8f7b2f${i}`;
      many[jid] = {
        _id: `id${i}`,
        xmppUsername: jid,
        firstName: `First${i}`,
        lastName: `Last${i}`,
        profileImage: `https://files.chat.ethora.com/files/${i}.jpg`,
      };
    }

    const before = JSON.stringify(many).length;
    const after = JSON.stringify(compactUsersSetForPersist(many)).length;

    // ~49 chars x 500 entries of pure duplication.
    expect(before - after).toBeGreaterThan(500 * 40);
    expect(restoreUsersSetForRehydrate(compactUsersSetForPersist(many))).toEqual(many);
  });

  it('survives junk without throwing', () => {
    expect(compactUsersSetForPersist(null as any)).toEqual({});
    expect(restoreUsersSetForRehydrate(undefined as any)).toEqual({});
    expect(compactUsersSetForPersist({ a: null } as any)).toEqual({ a: null });
  });
});

// The transform is what redux-persist actually calls - a helper that
// works in isolation but isn't wired to the right key is exactly the bug
// class that let the caps sit dormant for months.
describe('limitMessagesTransform wires usersSet through the de-dup', () => {
  const usersSet = {
    appid_alice: { _id: 'a1', xmppUsername: 'appid_alice', firstName: 'Alice' },
  } as any;

  it('strips on the way out and restores on the way back in', () => {
    const stored = limitMessagesTransform.in(usersSet, 'usersSet', {} as any);
    expect('xmppUsername' in stored.appid_alice).toBe(false);

    const rehydrated = limitMessagesTransform.out(stored, 'usersSet', {} as any);
    expect(rehydrated).toEqual(usersSet);
  });

  it('leaves unrelated keys alone', () => {
    expect(limitMessagesTransform.in('x', 'subscribedRooms', {} as any)).toBe('x');
    expect(limitMessagesTransform.out('x', 'reportRoom', {} as any)).toBe('x');
  });
});

// The bug that kept surviving "fixes": a persisted blob of ~7M chars
// (~13MB as UTF-16, which is what localStorage actually counts) against a
// ~5MB per-origin quota. Asserting the exact byte ceiling the browser
// enforces - not just "the caps ran" - is what makes this regression
// impossible to reintroduce by tuning a constant to a plausible-looking
// but wrong value.
describe('persisted rooms blob fits the real localStorage quota', () => {
  // Browsers store strings as UTF-16 and give ~5MB per origin, so the
  // whole origin holds only ~2.6M chars - the trap that made a 2.5M-char
  // budget look safe while encrypting to ~6.4MB.
  const LOCALSTORAGE_QUOTA_BYTES = 5 * 1024 * 1024;
  const BYTES_PER_CHAR = 2;
  const utf16Bytes = (chars: number) => chars * BYTES_PER_CHAR;

  const makeBloatedMessage = (id: string): IMessage =>
    ({
      id,
      body: 'x'.repeat(200),
      date: new Date().toISOString(),
      roomJid: 'r@conf',
      user: {
        id: 'someone',
        name: 'Someone Somebody',
        xmppUsername: 'someone',
        profileImage: `https://cdn.example.com/${id}/avatar.png`,
        token: 'JWT '.repeat(60),
        refreshToken: 'JWT '.repeat(60),
        walletAddress: '0x'.repeat(30),
      },
      // The wire junk createMessageFromXml spreads onto every message.
      senderFirstName: 'Someone',
      senderLastName: 'Somebody',
      fullName: 'Someone Somebody',
      photo: `https://cdn.example.com/${id}/avatar.png`,
      photoURL: `https://cdn.example.com/${id}/avatar.png`,
      senderJID: 'someone@example.com/resource',
      senderWalletAddress: '0x'.repeat(30),
      tokenAmount: '0',
      quickReplies: '',
      notDisplayedValue: '',
      push: 'true',
      translations: {
        pt: { translatedText: 'y'.repeat(200), language: 'pt', languageName: 'Portuguese' },
        fr: { translatedText: 'z'.repeat(200), language: 'fr', languageName: 'French' },
        zh: { translatedText: 'w'.repeat(200), language: 'zh', languageName: 'Chinese' },
      },
      reaction: Object.fromEntries(
        Array.from({ length: 10 }, (_, i) => [
          `user${i}`,
          { emoji: ['👍', '🎉'], data: { senderFirstName: 'A', senderLastName: 'B' } },
        ])
      ),
    }) as any;

  // Deliberately worse than anything real: 3x the room cap, 5x the
  // message cap, every message carrying the full junk payload.
  const makePathologicalRoomsMap = () => {
    const rooms: Record<string, IRoom> = {};
    for (let r = 0; r < MAX_PERSISTED_ROOMS * 3; r++) {
      rooms[`r${r}@conf`] = makeRoom(`r${r}@conf`, {
        lastMessageTimestamp: r,
        messages: Array.from({ length: MAX_MESSAGES_PER_ROOM * 5 }, (_, m) =>
          makeBloatedMessage(`m${r}-${m}`)
        ),
      });
    }
    return rooms;
  };

  it('a pathological state (300 rooms x 500 bloated messages) still fits the quota after encryption', () => {
    const rooms = makePathologicalRoomsMap();

    // Sanity: the raw state really is way over quota - otherwise this
    // test would pass for the wrong reason.
    const rawChars = JSON.stringify(rooms).length;
    expect(utf16Bytes(rawChars)).toBeGreaterThan(LOCALSTORAGE_QUOTA_BYTES);

    // Run the real transform chain, in the real order, the way
    // redux-persist calls it (per key, key === 'rooms').
    const sanitized = sanitizeRoomsStateTransform.in(rooms, 'rooms', {} as any);
    const persisted = limitMessagesTransform.in(sanitized, 'rooms', {} as any);

    const persistedChars = JSON.stringify(persisted).length;
    expect(persistedChars).toBeLessThanOrEqual(PERSISTED_ROOMS_CHAR_BUDGET);

    // What actually reaches localStorage is the encrypted string, and it
    // shares the origin's ~5MB with persist:chatSettingStore - so require
    // real headroom, not a hairline pass.
    const encryptedBytes = utf16Bytes(persistedChars * ENCRYPTION_INFLATION_FACTOR);
    expect(encryptedBytes).toBeLessThan(LOCALSTORAGE_QUOTA_BYTES * 0.7);
  });

  it('the budget constant itself cannot be set to a value that encrypts past the quota', () => {
    // Guards the exact mistake that shipped: a budget that reads fine but
    // blows the quota once encryption and UTF-16 are accounted for.
    const encryptedBytes = utf16Bytes(
      PERSISTED_ROOMS_CHAR_BUDGET * ENCRYPTION_INFLATION_FACTOR
    );
    expect(encryptedBytes).toBeLessThan(LOCALSTORAGE_QUOTA_BYTES * 0.7);
  });

  it('keeps the newest rooms cached rather than shelling everything', () => {
    const persisted = limitMessagesTransform.in(
      makePathologicalRoomsMap(),
      'rooms',
      {} as any
    ) as Record<string, IRoom>;

    const withMessages = Object.values(persisted).filter(
      (room) => room.messages.length > 0
    );
    expect(withMessages.length).toBeGreaterThan(0);
  });
});
