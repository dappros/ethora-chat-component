import { describe, expect, it } from 'vitest';
import reducer, { addRoom, addRoomMessage, insertUsers } from './roomsSlice';
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

const makeMessage = (overrides: Partial<IMessage> = {}): IMessage =>
  ({
    id: 'm1',
    xmppId: 'm1',
    body: 'hello',
    date: new Date().toISOString(),
    roomJid: JID,
    user: { id: SENDER_ID },
    // Every client stamps these on the outgoing stanza (sendTextMessage.xmpp.ts);
    // createMessageFromXml spreads them onto the top-level message object, which
    // is what enrichMessageAuthor/resolveSenderDisplayName resolve the name from
    // in the absence of a useful usersSet entry.
    senderFirstName: 'New',
    senderLastName: 'User',
    ...overrides,
  }) as IMessage;

// Regression: a brand-new user's message resolves a real name at insert time
// (from the stanza's own senderFirstName/senderLastName), but a *later*
// insertUsers call for that same sender - e.g. a retried profile lookup that
// succeeds while the backend still hasn't populated firstName/lastName - used
// to "upgrade" the message by echoing the raw xmpp id back as the name,
// clobbering the good name that was already there. That's the same raw-id
// regression as the reported bug, just triggered from insertUsers instead of
// the initial insert, and it kept re-triggering on every insertUsers call for
// that sender until a reload rebuilt usersSet from scratch.
describe('roomsSlice - insertUsers does not downgrade an already-resolved name', () => {
  it('a nameless usersSet entry for the sender leaves the message name untouched', () => {
    let state = reducer(undefined, addRoom({ roomData: makeRoom() }));
    state = reducer(
      state,
      addRoomMessage({ roomJID: JID, message: makeMessage() })
    );
    expect(state.rooms[JID].messages[0].user.name).toBe('New User');

    state = reducer(
      state,
      insertUsers({
        newUsers: [
          { xmppUsername: SENDER_ID, firstName: '', lastName: '' } as any,
        ],
      })
    );

    expect(state.rooms[JID].messages[0].user.name).toBe('New User');
  });

  it('a real usersSet entry for the sender still upgrades the message name', () => {
    let state = reducer(undefined, addRoom({ roomData: makeRoom() }));
    state = reducer(
      state,
      addRoomMessage({ roomJID: JID, message: makeMessage() })
    );

    state = reducer(
      state,
      insertUsers({
        newUsers: [
          { xmppUsername: SENDER_ID, firstName: 'Fresh', lastName: 'Name' } as any,
        ],
      })
    );

    expect(state.rooms[JID].messages[0].user.name).toBe('Fresh Name');
  });

  it('a nameless usersSet entry still lets a stale "Deleted User" message self-heal from the message data', () => {
    let state = reducer(undefined, addRoom({ roomData: makeRoom() }));
    state = reducer(
      state,
      addRoomMessage({
        roomJID: JID,
        message: makeMessage({ user: { id: SENDER_ID, name: 'Deleted User' } as any }),
      })
    );
    // enrichMessageAuthor already resolves this from senderFirstName/senderLastName
    // at insert time (the "Deleted User" seed name is itself a miss sentinel), so
    // it should never actually land in the store as "Deleted User".
    expect(state.rooms[JID].messages[0].user.name).toBe('New User');

    state = reducer(
      state,
      insertUsers({
        newUsers: [
          { xmppUsername: SENDER_ID, firstName: '', lastName: '' } as any,
        ],
      })
    );

    expect(state.rooms[JID].messages[0].user.name).toBe('New User');
  });
});
