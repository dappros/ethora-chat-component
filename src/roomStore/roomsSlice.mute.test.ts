import { afterEach, describe, expect, it } from 'vitest';
import reducer, {
  addRoom,
  addRoomViaApi,
  setLogoutState,
  setRoomMuted,
} from './roomsSlice';
import { store } from './index';
import { IRoom } from '../types/types';

const JID = 'room1@conference.example.com';

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

describe('roomsSlice - per-chat mute', () => {
  it('setRoomMuted flips the flag on an existing room', () => {
    let state = reducer(undefined, addRoom({ roomData: makeRoom() }));
    state = reducer(state, setRoomMuted({ jid: JID, muted: true }));
    expect(state.rooms[JID].muted).toBe(true);

    state = reducer(state, setRoomMuted({ jid: JID, muted: false }));
    expect(state.rooms[JID].muted).toBe(false);
  });

  it('setRoomMuted is a no-op when the room does not exist', () => {
    const state = reducer(undefined, setRoomMuted({ jid: JID, muted: true }));
    expect(state.rooms[JID]).toBeUndefined();
  });

  it('setRoomMuted with undefined clears the field back to "unsupported" (rollback case)', () => {
    let state = reducer(undefined, addRoom({ roomData: makeRoom({ muted: true }) }));
    state = reducer(state, setRoomMuted({ jid: JID, muted: undefined }));
    expect('muted' in state.rooms[JID]).toBe(false);
  });

  it('the same "omits muted preserves value" behaviour applies via addRoom (the /chats/my bulk path)', () => {
    let state = reducer(undefined, addRoom({ roomData: makeRoom({ muted: true }) }));
    state = reducer(state, addRoom({ roomData: makeRoom({ title: 'renamed' }) }));
    expect(state.rooms[JID].muted).toBe(true);
  });

  // addRoomFromApi is only reachable through the addRoomViaApi thunk (it's
  // not part of the slice's own action exports), so this exercises it via
  // the real store - the same path stanzaHandlers' onMembersRefreshSignal
  // and useGetNewArchRoom's syncRooms actually dispatch through.
  describe('addRoomFromApi via addRoomViaApi (the single-room refetch path)', () => {
    afterEach(() => {
      store.dispatch(setLogoutState());
    });

    it('a refetch that omits `muted` preserves the previously known value', async () => {
      store.dispatch(addRoom({ roomData: makeRoom({ muted: true }) }));
      await store.dispatch(
        addRoomViaApi({
          room: makeRoom({ title: 'Room 1 updated' }),
          xmpp: undefined as never,
        })
      );
      expect(store.getState().rooms.rooms[JID].muted).toBe(true);
    });

    it('a refetch that reports `muted: false` overwrites a stale local `true`', async () => {
      store.dispatch(addRoom({ roomData: makeRoom({ muted: true }) }));
      await store.dispatch(
        addRoomViaApi({ room: makeRoom({ muted: false }), xmpp: undefined as never })
      );
      expect(store.getState().rooms.rooms[JID].muted).toBe(false);
    });
  });
});
