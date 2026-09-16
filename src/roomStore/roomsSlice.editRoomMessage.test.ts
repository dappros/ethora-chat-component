import { describe, expect, it } from 'vitest';
import reducer, { addRoom, editRoomMessage } from './roomsSlice';
import { IMessage, IRoom } from '../types/types';

const JID = 'room1@conference.example.com';
const MESSAGE_ID = 'msg-1';

const makeRoom = (overrides: Partial<IRoom> = {}): IRoom =>
  ({
    jid: JID,
    name: 'room1',
    title: 'Room 1',
    usersCnt: 0,
    messages: [],
    isLoading: false,
    roomBg: null,
    ...overrides,
  }) as IRoom;

const makeMessage = (overrides: Partial<IMessage> = {}): IMessage =>
  ({
    id: MESSAGE_ID,
    user: { id: 'author', name: 'Author' } as never,
    date: '2026-01-01T00:00:00.000Z',
    body: 'original text',
    roomJid: JID,
    ...overrides,
  }) as IMessage;

const withMessage = (overrides: Partial<IMessage> = {}) =>
  reducer(undefined, addRoom({ roomData: makeRoom({ messages: [makeMessage(overrides)] }) }));

describe('roomsSlice - editRoomMessage', () => {
  it('sets the new body and marks the message edited', () => {
    const state = reducer(
      withMessage(),
      editRoomMessage({ roomJID: JID, messageId: MESSAGE_ID, text: 'new text' })
    );
    const message = state.rooms[JID].messages[0];
    expect(message.body).toBe('new text');
    expect(message.isEdited).toBe(true);
  });

  it('is idempotent: dispatching the same text again leaves the state unchanged', () => {
    const once = reducer(
      withMessage(),
      editRoomMessage({ roomJID: JID, messageId: MESSAGE_ID, text: 'new text' })
    );
    const twice = reducer(
      once,
      editRoomMessage({ roomJID: JID, messageId: MESSAGE_ID, text: 'new text' })
    );
    expect(twice.rooms[JID].messages[0]).toEqual(once.rooms[JID].messages[0]);
  });

  it('a later edit with different text overwrites the previous one (another client won the race)', () => {
    const first = reducer(
      withMessage(),
      editRoomMessage({ roomJID: JID, messageId: MESSAGE_ID, text: 'mine' })
    );
    const second = reducer(
      first,
      editRoomMessage({ roomJID: JID, messageId: MESSAGE_ID, text: 'theirs' })
    );
    expect(second.rooms[JID].messages[0].body).toBe('theirs');
    expect(second.rooms[JID].messages[0].isEdited).toBe(true);
  });

  it('drops a translation cached for the pre-edit body', () => {
    const seeded = withMessage({
      translations: {
        fr: { translatedText: 'texte original', language: 'fr', languageName: 'French' },
      } as never,
    });
    const state = reducer(
      seeded,
      editRoomMessage({ roomJID: JID, messageId: MESSAGE_ID, text: 'new text' })
    );
    expect(state.rooms[JID].messages[0].translations).toBeUndefined();
  });

  it('honours an explicit isEdited: false, e.g. rolling an optimistic edit back to its pre-edit state', () => {
    const edited = reducer(
      withMessage({ isEdited: false }),
      editRoomMessage({ roomJID: JID, messageId: MESSAGE_ID, text: 'optimistic text' })
    );
    expect(edited.rooms[JID].messages[0].isEdited).toBe(true);

    const rolledBack = reducer(
      edited,
      editRoomMessage({
        roomJID: JID,
        messageId: MESSAGE_ID,
        text: 'original text',
        isEdited: false,
      })
    );
    expect(rolledBack.rooms[JID].messages[0].body).toBe('original text');
    expect(rolledBack.rooms[JID].messages[0].isEdited).toBe(false);
  });

  it('rolling back preserves isEdited: true when the message had already been edited before', () => {
    const editedOnce = reducer(
      withMessage({ isEdited: true, body: 'first edit' }),
      editRoomMessage({ roomJID: JID, messageId: MESSAGE_ID, text: 'second edit attempt' })
    );
    // The attempt failed and is rolled back to the state before it, which
    // was already edited once.
    const rolledBack = reducer(
      editedOnce,
      editRoomMessage({
        roomJID: JID,
        messageId: MESSAGE_ID,
        text: 'first edit',
        isEdited: true,
      })
    );
    expect(rolledBack.rooms[JID].messages[0].body).toBe('first edit');
    expect(rolledBack.rooms[JID].messages[0].isEdited).toBe(true);
  });

  it('is a no-op when the message does not exist', () => {
    const state = reducer(
      withMessage(),
      editRoomMessage({ roomJID: JID, messageId: 'not-there', text: 'new text' })
    );
    expect(state.rooms[JID].messages[0].body).toBe('original text');
  });

  it('is a no-op when the room does not exist', () => {
    const state = reducer(
      undefined,
      editRoomMessage({ roomJID: 'unknown@conference.example.com', messageId: MESSAGE_ID, text: 'new text' })
    );
    expect(state.rooms['unknown@conference.example.com']).toBeUndefined();
  });
});

describe('roomsSlice - editRoomMessage does not disturb unrelated message state', () => {
  it('leaves pending/failed/reaction fields untouched', () => {
    const seeded = withMessage({
      pending: true,
      failed: true,
      reaction: { user1: { emoji: ['👍'], data: {} } },
    });
    const state = reducer(
      seeded,
      editRoomMessage({ roomJID: JID, messageId: MESSAGE_ID, text: 'new text' })
    );
    const message = state.rooms[JID].messages[0];
    expect(message.pending).toBe(true);
    expect(message.failed).toBe(true);
    expect(message.reaction).toEqual({ user1: { emoji: ['👍'], data: {} } });
  });
});
