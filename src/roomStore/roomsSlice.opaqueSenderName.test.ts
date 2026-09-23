import { describe, expect, it } from 'vitest';
import reducer, { addRoom, addRoomMessage } from './roomsSlice';
import { IMessage, IRoom } from '../types/types';

const JID = 'room1@conference.example.com';
const SENDER_ID = '646cc8dc96d4a4dc8f7b2f2d_6ab3a116d1f5c231da4c84fd';

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

// Regression: `addRoomMessage` runs every newly-arrived message through
// `enrichMessageAuthor` (which calls `resolveSenderDisplayName`). Before the
// opaque-id fix, a message that already carried the raw xmpp id as
// `user.name` (e.g. echoed back by a caller that built the message object
// itself, or a value inherited from an earlier, less careful resolution)
// read as an already-good "current name" and short-circuited the whole
// chain - the stanza's own senderFirstName/senderLastName, sitting right
// there on the same message, never got a chance to win. This is the exact
// live bug: the room-list row showed the raw id while the bubble in the
// transcript, resolved from the same data, showed the real name.
describe('roomsSlice - addRoomMessage does not let an opaque stamped name win', () => {
  it('replaces an opaque user.name with the name from the stanza data at insert time', () => {
    let state = reducer(undefined, addRoom({ roomData: makeRoom() }));

    const message = {
      id: 'm1',
      xmppId: 'm1',
      body: 'hello',
      date: new Date().toISOString(),
      roomJid: JID,
      user: { id: SENDER_ID, name: SENDER_ID },
      senderFirstName: 'фів',
      senderLastName: 'фів',
    } as unknown as IMessage;

    state = reducer(state, addRoomMessage({ roomJID: JID, message }));

    expect(state.rooms[JID].messages[0].user.name).toBe('фів фів');
  });

  it('falls back to "Deleted User" rather than the opaque id when no name data exists at all', () => {
    let state = reducer(undefined, addRoom({ roomData: makeRoom() }));

    const message = {
      id: 'm1',
      xmppId: 'm1',
      body: 'hello',
      date: new Date().toISOString(),
      roomJid: JID,
      user: { id: SENDER_ID, name: SENDER_ID },
    } as unknown as IMessage;

    state = reducer(state, addRoomMessage({ roomJID: JID, message }));

    expect(state.rooms[JID].messages[0].user.name).toBe('Deleted User');
  });
});
