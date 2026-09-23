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

  // Regression: before the opaque-id fix, a raw xmpp id baked into
  // `message.user.name` (e.g. a message restored from persisted state that
  // predates the fix, or written by any path that skipped enrichment) read
  // exactly like a real name and was never revisited. `insertUsers`'s
  // upgrade pass must treat that shape the same as a stale "Deleted User"
  // message and heal it once a real usersSet entry arrives - not just rely
  // on it never happening again at insert time.
  it('a message already stamped with a raw opaque id heals once a real usersSet entry arrives', () => {
    let state = reducer(
      undefined,
      addRoom({
        roomData: makeRoom({
          messages: [
            makeMessage({ user: { id: SENDER_ID, name: SENDER_ID } as any }),
          ],
        }),
      })
    );
    expect(state.rooms[JID].messages[0].user.name).toBe(SENDER_ID);

    state = reducer(
      state,
      insertUsers({
        newUsers: [
          { xmppUsername: SENDER_ID, firstName: 'фів', lastName: 'фів' } as any,
        ],
      })
    );

    expect(state.rooms[JID].messages[0].user.name).toBe('фів фів');
  });

  // Regression: the walk in insertUsers only re-checks a message when either
  // (a) that exact sender is part of THIS insertUsers batch, or (b) the
  // message is stale. Before this fix, "stale" meant only the literal
  // "Deleted User" sentinel - a message stuck with a raw opaque id (from
  // legacy persisted state, or any path that skipped the resolveSenderDisplayName
  // fix) would never be revisited by an UNRELATED insertUsers call, even
  // though it already carries a perfectly good name in its own <data>
  // fields. This is the exact "unrelated user rename/insert wakes up an old
  // broken row" shape the "Deleted User" self-heal already covered.
  it('a message stamped with a raw opaque id self-heals from its own data on an unrelated insertUsers call', () => {
    const OTHER_SENDER_ID = '646cc8dc96d4a4dc8f7b2f2d_0000000000000000000000';
    let state = reducer(
      undefined,
      addRoom({
        roomData: makeRoom({
          messages: [
            makeMessage({ user: { id: SENDER_ID, name: SENDER_ID } as any }),
          ],
        }),
      })
    );
    expect(state.rooms[JID].messages[0].user.name).toBe(SENDER_ID);

    // Insert a completely unrelated user - SENDER_ID is not in this batch,
    // so the only reason the walk revisits our message at all is that it's
    // "stale" (an opaque id counts now, same as "Deleted User").
    state = reducer(
      state,
      insertUsers({
        newUsers: [
          { xmppUsername: OTHER_SENDER_ID, firstName: 'Other', lastName: 'Person' } as any,
        ],
      })
    );

    expect(state.rooms[JID].messages[0].user.name).toBe('New User');
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
