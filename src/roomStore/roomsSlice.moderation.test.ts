import { describe, expect, it } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import { compactMessageForPersist } from './index';
import roomsSlice, {
  addRoom,
  addRoomMessage,
  applyModerationNotice,
  setRoomMessages,
} from './roomsSlice';
import { resolveTouchedRooms } from './Middleware/unreadMidlleware';
import type { IMessage } from '../types/types';

const ROOM = 'room1@conference.xmpp.example';
const OTHER = 'room2@conference.xmpp.example';

const msg = (id: string, sender: string, overrides: Partial<IMessage> = {}): IMessage =>
  ({
    id,
    xmppId: `client-${id}`,
    body: `text ${id}`,
    date: new Date(1730000000000 + Number(id)).toISOString(),
    roomJid: ROOM,
    user: { id: sender, name: sender },
    ...overrides,
  }) as IMessage;

const setup = () => {
  const store = configureStore({
    reducer: { rooms: roomsSlice },
    middleware: (getDefault) =>
      getDefault({ serializableCheck: false, immutableCheck: false }),
  });
  for (const jid of [ROOM, OTHER]) {
    store.dispatch(
      addRoom({ roomData: { jid, name: jid, title: jid, messages: [] } as never })
    );
  }
  store.dispatch(
    setRoomMessages({
      roomJID: ROOM,
      messages: [msg('1', 'alice'), msg('2', 'bob'), msg('3', 'alice')],
    })
  );
  store.dispatch(setRoomMessages({ roomJID: OTHER, messages: [msg('9', 'alice', { roomJid: OTHER })] }));
  const messages = (jid = ROOM) =>
    (store.getState() as any).rooms.rooms[jid].messages as IMessage[];
  return { store, messages };
};

describe('applyModerationNotice', () => {
  it('blurs the targeted message by archive id, in place', () => {
    const { store, messages } = setup();
    store.dispatch(
      applyModerationNotice({ roomJID: ROOM, action: 'blur', category: 'toxicity', stanzaId: '2' })
    );
    const [, second] = messages();
    expect(second.moderation).toEqual({ action: 'blur', category: 'toxicity' });
    expect(second.body).toBe('text 2');
    expect(messages()).toHaveLength(3);
    expect(messages()[0].moderation).toBeUndefined();
  });

  it('hides by client id', () => {
    const { store, messages } = setup();
    store.dispatch(applyModerationNotice({ roomJID: ROOM, action: 'hidden', originId: 'client-1' }));
    expect(messages()[0].moderation?.action).toBe('hidden');
    expect(messages()[0].body).toBe('');
  });

  it('deletes with the existing tombstone', () => {
    const { store, messages } = setup();
    store.dispatch(applyModerationNotice({ roomJID: ROOM, action: 'deleted', stanzaId: '3' }));
    expect(messages()[2].isDeleted).toBe(true);
  });

  it('a user-level notice applies to every message of that sender in that room only', () => {
    const { store, messages } = setup();
    store.dispatch(
      applyModerationNotice({ roomJID: ROOM, action: 'hidden', category: 'suspension', user: 'alice' })
    );
    const [first, second, third] = messages();
    expect(first.moderation?.action).toBe('hidden');
    expect(third.moderation?.action).toBe('hidden');
    expect(second.moderation).toBeUndefined();
    expect(messages(OTHER)[0].moderation).toBeUndefined();
  });

  it('never inserts anything', () => {
    const { store, messages } = setup();
    store.dispatch(applyModerationNotice({ roomJID: ROOM, action: 'blur', stanzaId: 'unknown' }));
    expect(messages()).toHaveLength(3);
    expect(messages().every((m) => !m.moderation)).toBe(true);
  });

  it('only recomputes unread for its own room', () => {
    const touched = resolveTouchedRooms(
      applyModerationNotice({ roomJID: ROOM, action: 'blur', stanzaId: '2' }),
      {},
      { rooms: { rooms: { [ROOM]: {}, [OTHER]: {} } } }
    );
    expect([...touched]).toEqual([ROOM]);
  });
});

describe('addRoomMessage with moderation', () => {
  it('keeps a hidden message that has no body', () => {
    const { store, messages } = setup();
    store.dispatch(
      addRoomMessage({
        roomJID: ROOM,
        message: msg('4', 'carol', { body: '', moderation: { action: 'hidden' } }),
      })
    );
    expect(messages().find((m) => m.id === '4')?.moderation?.action).toBe('hidden');
  });

  it('still drops a bodiless message without moderation', () => {
    const { store, messages } = setup();
    store.dispatch(addRoomMessage({ roomJID: ROOM, message: msg('5', 'carol', { body: '' }) }));
    expect(messages().find((m) => m.id === '5')).toBeUndefined();
  });
});

describe('persisted message fields', () => {
  it('keep the Trust & Safety state', () => {
    const compact = compactMessageForPersist(
      msg('6', 'dave', {
        isSensitive: 'true',
        sensitiveCategory: 'nudity',
        moderation: { action: 'blur', category: 'pii' },
        senderMasked: true,
      })
    );
    expect(compact.isSensitive).toBe('true');
    expect(compact.sensitiveCategory).toBe('nudity');
    expect(compact.moderation).toEqual({ action: 'blur', category: 'pii' });
    expect(compact.senderMasked).toBe(true);
  });
});
