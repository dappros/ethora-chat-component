import { describe, expect, it } from 'vitest';
import reducer, { addRoom, setActiveMessage, setRoomMessages } from './roomsSlice';
import { IRoom } from '../types/types';

const makeRoom = (overrides: Partial<IRoom> = {}): IRoom =>
  ({
    jid: 'room1@conference.example.com',
    name: 'room1',
    title: 'Room 1',
    usersCnt: 0,
    messages: [],
    isLoading: false,
    roomBg: null,
    ...overrides,
  }) as IRoom;

describe('roomsSlice activeMessage survives background merges', () => {
  it('keeps activeMessage:true when a background history merge re-delivers the same id without the flag', () => {
    const roomJID = 'room1@conference.example.com';
    const now = Date.now();

    let state = reducer(
      undefined,
      addRoom({
        roomData: makeRoom({
          messages: [
            {
              id: 'msg-1',
              body: 'hello',
              date: new Date(now - 60_000).toISOString(),
              roomJid: roomJID,
              user: { id: 'someone', name: 'Someone' },
            } as never,
          ],
        }),
      })
    );

    // User opens a thread on msg-1.
    state = reducer(state, setActiveMessage({ id: 'msg-1', chatJID: roomJID }));
    expect(
      state.rooms[roomJID].messages.find((m) => m.id === 'msg-1')?.activeMessage
    ).toBe(true);

    // A background catch-up (e.g. an ack-catchup MAM fetch after a reply
    // send) re-delivers the same message id as a plain server-shaped
    // object - no `activeMessage` field, because the wire never carries
    // client-only UI flags.
    state = reducer(
      state,
      setRoomMessages({
        roomJID,
        messages: [
          {
            id: 'msg-1',
            body: 'hello',
            date: new Date(now - 60_000).toISOString(),
            roomJid: roomJID,
            user: { id: 'someone', name: 'Someone' },
          } as never,
        ],
      })
    );

    // The thread must stay open: activeMessage should not have been wiped
    // out by the merge.
    expect(
      state.rooms[roomJID].messages.find((m) => m.id === 'msg-1')?.activeMessage
    ).toBe(true);
  });
});
