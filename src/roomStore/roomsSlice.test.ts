import { describe, expect, test } from 'vitest';

import roomsReducer, {
  addRoom,
  addRoomMessage,
  deleteRoom,
  deleteRoomMessage,
  editRoomMessage,
  replaceRoomMessages,
  setComposing,
  setCurrentRoom,
  setLastViewedTimestamp,
  setRoomMessages,
  updateRoom,
} from './roomsSlice';
import { IMessage } from '../types/models/message.model';
import { IRoom } from '../types/models/room.model';

/**
 * Hermetic reducer tests for the `roomMessages` slice — the web
 * equivalent of the Android `RoomStore` + `MessageStore` reducer
 * coverage and the iOS `RoomStore` XCTests.
 *
 * Reducers are called directly with `(previousState, action)` so the
 * tests are pure — no store, no middleware, no thunks. Each test
 * starts from the slice's default initial state via `roomsReducer(
 * undefined, { type: '@@INIT' })` so they don't leak across cases.
 *
 * Cluster mapping (see QA_SCENARIOS.md in the ethora monorepo):
 *   A. Multi-room state machine — addRoom upsert, setCurrentRoom, updateRoom
 *   D. Send + duplication — addRoomMessage idempotency + cross-room
 *   F. History / render parity — setRoomMessages round-trip, deleteRoomMessage tombstone
 *   I. Per-room state isolation — setComposing per-room
 */

// ---------- helpers ----------

const initial = () => roomsReducer(undefined, { type: '@@INIT' });

const makeRoom = (
  id: string,
  overrides: Partial<IRoom> = {}
): IRoom => ({
  name: `room-${id}`,
  jid: `${id}@conference.test`,
  title: `Room ${id}`,
  usersCnt: 0,
  messages: [],
  isLoading: false,
  roomBg: '',
  ...overrides,
});

const makeMessage = (
  id: string,
  overrides: Partial<IMessage> = {}
): IMessage => ({
  id,
  user: { id: 'other-user@xmpp.test', name: 'Other' },
  date: new Date(0),
  body: `body-${id}`,
  roomJid: 'a@conference.test',
  timestamp: 1_000,
  ...overrides,
});

// ---------- Cluster A — addRoom / updateRoom / setCurrentRoom ----------

describe('roomsSlice — Cluster A (multi-room state machine)', () => {
  test('addRoom inserts a new room keyed by jid', () => {
    const state = roomsReducer(
      initial(),
      addRoom({ roomData: makeRoom('a') })
    );
    expect(state.rooms['a@conference.test']).toBeDefined();
    expect(state.rooms['a@conference.test'].title).toBe('Room a');
  });

  test('addRoom preserves existing unread + lastViewed on upsert', () => {
    // REST `/chats/my` refreshes don't carry per-user state. The
    // reducer must preserve the badge state so the chat list doesn't
    // visibly drop counters every refresh.
    let state = roomsReducer(
      initial(),
      addRoom({
        roomData: makeRoom('a', {
          unreadMessages: 5,
          lastViewedTimestamp: 999_999,
        }),
      })
    );
    state = roomsReducer(
      state,
      addRoom({
        roomData: makeRoom('a', {
          unreadMessages: 0,
          lastViewedTimestamp: 0,
        }),
      })
    );
    expect(state.rooms['a@conference.test'].unreadMessages).toBe(5);
    expect(state.rooms['a@conference.test'].lastViewedTimestamp).toBe(999_999);
  });

  test('addRoom rejects invalid jids without mutating state', () => {
    // `isValidRoomJid` is the guard; a malformed payload must not
    // blow up the rooms map.
    const before = initial();
    const after = roomsReducer(
      before,
      addRoom({ roomData: { ...makeRoom('a'), jid: '' } })
    );
    expect(after.rooms).toEqual(before.rooms);
  });

  test('setCurrentRoom transitions A then B then A', () => {
    let state = roomsReducer(
      initial(),
      addRoom({ roomData: makeRoom('a') })
    );
    state = roomsReducer(state, addRoom({ roomData: makeRoom('b') }));

    state = roomsReducer(state, setCurrentRoom({ roomJID: 'a@conference.test' }));
    expect(state.activeRoomJID).toBe('a@conference.test');

    state = roomsReducer(state, setCurrentRoom({ roomJID: 'b@conference.test' }));
    expect(state.activeRoomJID).toBe('b@conference.test');

    state = roomsReducer(state, setCurrentRoom({ roomJID: 'a@conference.test' }));
    expect(state.activeRoomJID).toBe('a@conference.test');
  });

  test('deleteRoom drops only the targeted room', () => {
    let state = roomsReducer(initial(), addRoom({ roomData: makeRoom('a') }));
    state = roomsReducer(state, addRoom({ roomData: makeRoom('b') }));

    state = roomsReducer(state, deleteRoom({ jid: 'a@conference.test' }));

    expect(state.rooms['a@conference.test']).toBeUndefined();
    expect(state.rooms['b@conference.test']).toBeDefined();
  });

  test('updateRoom merges partial updates without dropping fields', () => {
    let state = roomsReducer(
      initial(),
      addRoom({
        roomData: makeRoom('a', { title: 'Original', unreadMessages: 3 }),
      })
    );
    state = roomsReducer(
      state,
      updateRoom({ jid: 'a@conference.test', updates: { title: 'Updated' } })
    );
    expect(state.rooms['a@conference.test'].title).toBe('Updated');
    expect(state.rooms['a@conference.test'].unreadMessages).toBe(3);
  });

  test('setLastViewedTimestamp writes timestamp back onto the room (normalized to ms)', () => {
    // The reducer runs `getTimestampFromUnknown`, which normalises
    // anything that looks like seconds (< MILLISECONDS_LOWER_BOUND)
    // to milliseconds by multiplying by 1000. Same helper used
    // everywhere timestamps cross trust boundaries. Pass an
    // already-millisecond value so the assertion is round-trip.
    const millis = 1_700_000_000_000; // ~Nov 2023, definitely ms
    let state = roomsReducer(initial(), addRoom({ roomData: makeRoom('a') }));
    state = roomsReducer(
      state,
      setLastViewedTimestamp({ chatJID: 'a@conference.test', timestamp: millis })
    );
    expect(state.rooms['a@conference.test'].lastViewedTimestamp).toBe(millis);
  });
});

// ---------- Cluster D — send + duplication ----------

describe('roomsSlice — Cluster D (send + duplication)', () => {
  test('addRoomMessage appends a new message', () => {
    let state = roomsReducer(initial(), addRoom({ roomData: makeRoom('a') }));
    state = roomsReducer(
      state,
      addRoomMessage({
        roomJID: 'a@conference.test',
        message: makeMessage('m-1'),
      })
    );
    expect(state.rooms['a@conference.test'].messages.length).toBe(1);
    expect(state.rooms['a@conference.test'].messages[0].id).toBe('m-1');
  });

  test('addRoomMessage is idempotent on duplicate id (MAM replay safety)', () => {
    let state = roomsReducer(initial(), addRoom({ roomData: makeRoom('a') }));
    const msg = makeMessage('m-1', { pending: false });
    state = roomsReducer(
      state,
      addRoomMessage({ roomJID: 'a@conference.test', message: msg })
    );
    state = roomsReducer(
      state,
      addRoomMessage({ roomJID: 'a@conference.test', message: msg })
    );
    expect(state.rooms['a@conference.test'].messages.length).toBe(1);
  });

  test('addRoomMessage merges pending then echo across optimistic/server ids', () => {
    // Optimistic send → pending bubble. Server echo arrives with new
    // id but xmppId == optimistic id. The bidirectional match must
    // collapse them into one bubble with pending=false.
    let state = roomsReducer(initial(), addRoom({ roomData: makeRoom('a') }));
    state = roomsReducer(
      state,
      addRoomMessage({
        roomJID: 'a@conference.test',
        message: makeMessage('optimistic-1', { pending: true }),
      })
    );
    state = roomsReducer(
      state,
      addRoomMessage({
        roomJID: 'a@conference.test',
        message: makeMessage('server-1', {
          xmppId: 'optimistic-1',
          pending: false,
        }),
      })
    );

    const messages = state.rooms['a@conference.test'].messages;
    expect(messages.length).toBe(1);
    expect(messages[0].pending).toBe(false);
  });

  test('addRoomMessage cross-room — sending to A does not touch B', () => {
    let state = roomsReducer(initial(), addRoom({ roomData: makeRoom('a') }));
    state = roomsReducer(state, addRoom({ roomData: makeRoom('b') }));
    state = roomsReducer(
      state,
      setRoomMessages({
        roomJID: 'b@conference.test',
        messages: [makeMessage('b-1', { roomJid: 'b@conference.test' })],
      })
    );

    state = roomsReducer(
      state,
      addRoomMessage({
        roomJID: 'a@conference.test',
        message: makeMessage('a-1', { roomJid: 'a@conference.test' }),
      })
    );

    expect(
      state.rooms['a@conference.test'].messages.map((m) => m.id)
    ).toContain('a-1');
    expect(
      state.rooms['b@conference.test'].messages.map((m) => m.id)
    ).toEqual(['b-1']);
  });
});

// ---------- Cluster F — history / render parity ----------

describe('roomsSlice — Cluster F (history + render parity)', () => {
  test('setRoomMessages round-trips content into the room', () => {
    let state = roomsReducer(initial(), addRoom({ roomData: makeRoom('a') }));
    state = roomsReducer(
      state,
      setRoomMessages({
        roomJID: 'a@conference.test',
        messages: [
          makeMessage('c-1', { body: 'one', timestamp: 1_000 }),
          makeMessage('c-2', { body: 'two', timestamp: 2_000 }),
          makeMessage('c-3', { body: 'three', timestamp: 3_000 }),
        ],
      })
    );
    const ids = state.rooms['a@conference.test'].messages
      .filter((m) => m.id !== 'delimiter-new')
      .map((m) => m.id);
    expect(ids).toEqual(['c-1', 'c-2', 'c-3']);
  });

  test('replaceRoomMessages sorts by timestamp ascending', () => {
    let state = roomsReducer(initial(), addRoom({ roomData: makeRoom('a') }));
    state = roomsReducer(
      state,
      replaceRoomMessages({
        roomJID: 'a@conference.test',
        messages: [
          makeMessage('m-3', { timestamp: 3_000 }),
          makeMessage('m-1', { timestamp: 1_000 }),
          makeMessage('m-2', { timestamp: 2_000 }),
        ],
      })
    );
    const ids = state.rooms['a@conference.test'].messages
      .filter((m) => m.id !== 'delimiter-new')
      .map((m) => m.id);
    expect(ids).toEqual(['m-1', 'm-2', 'm-3']);
  });

  test('deleteRoomMessage tombstones the bubble instead of dropping the row', () => {
    // Web's contract diverges from iOS here — web preserves the row
    // with isDeleted=true so ordering / replies / quoting stay intact.
    // (iOS drops the row outright; both are documented contracts.)
    let state = roomsReducer(initial(), addRoom({ roomData: makeRoom('a') }));
    state = roomsReducer(
      state,
      setRoomMessages({
        roomJID: 'a@conference.test',
        messages: [
          makeMessage('doomed', { body: 'delete me', timestamp: 1_000 }),
          makeMessage('survivor', { body: 'keep me', timestamp: 2_000 }),
        ],
      })
    );

    state = roomsReducer(
      state,
      deleteRoomMessage({
        roomJID: 'a@conference.test',
        messageId: 'doomed',
      })
    );

    const messages = state.rooms['a@conference.test'].messages.filter(
      (m) => m.id !== 'delimiter-new'
    );
    expect(messages.length).toBe(2);
    const doomed = messages.find((m) => m.id === 'doomed');
    expect(doomed?.isDeleted).toBe(true);
    expect(doomed?.body).toBe('');
  });

  test('editRoomMessage updates the body in place', () => {
    let state = roomsReducer(initial(), addRoom({ roomData: makeRoom('a') }));
    state = roomsReducer(
      state,
      setRoomMessages({
        roomJID: 'a@conference.test',
        messages: [makeMessage('m-1', { body: 'original' })],
      })
    );
    state = roomsReducer(
      state,
      editRoomMessage({
        roomJID: 'a@conference.test',
        messageId: 'm-1',
        text: 'edited',
      })
    );
    const messages = state.rooms['a@conference.test'].messages.filter(
      (m) => m.id !== 'delimiter-new'
    );
    const m1 = messages.find((m) => m.id === 'm-1');
    expect(m1?.body).toBe('edited');
  });
});

// ---------- Per-room state isolation ----------

describe('roomsSlice — per-room state isolation', () => {
  test('setComposing on room A does not bleed into room B', () => {
    let state = roomsReducer(initial(), addRoom({ roomData: makeRoom('a') }));
    state = roomsReducer(state, addRoom({ roomData: makeRoom('b') }));

    state = roomsReducer(
      state,
      setComposing({
        chatJID: 'a@conference.test',
        composing: true,
      })
    );

    expect(state.rooms['a@conference.test'].composing).toBe(true);
    // B must remain in its default (undefined / false) state.
    expect(state.rooms['b@conference.test'].composing).toBeFalsy();
  });

  test('setComposing transitions true → false on the same room', () => {
    let state = roomsReducer(initial(), addRoom({ roomData: makeRoom('a') }));

    state = roomsReducer(
      state,
      setComposing({
        chatJID: 'a@conference.test',
        composing: true,
      })
    );
    expect(state.rooms['a@conference.test'].composing).toBe(true);

    state = roomsReducer(
      state,
      setComposing({
        chatJID: 'a@conference.test',
        composing: false,
      })
    );
    expect(state.rooms['a@conference.test'].composing).toBe(false);
  });
});
