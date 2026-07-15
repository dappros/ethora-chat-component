import { describe, expect, it } from 'vitest';
import {
  optimizePersistedRooms,
  compactMessageForPersist,
  getRoomActivityTimestamp,
  MAX_MESSAGES_PER_ROOM,
  MAX_PERSISTED_ROOMS,
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
    expect(compact.user.profileImage).toBe('https://cdn.example.com/me.png');
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
