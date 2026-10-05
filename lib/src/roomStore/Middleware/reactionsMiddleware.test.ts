import { describe, expect, it, beforeEach } from 'vitest';
import { store, resetSessionRoomState } from '../index';
import { addRoom, deleteAllRooms, setReactions } from '../roomsSlice';
import type { IRoom } from '../../types/types';

const JID = 'rooma@conference.xmpp.example.com';

describe('reactionsMiddleware', () => {
  beforeEach(() => {
    store.dispatch(deleteAllRooms());
    store.dispatch(
      addRoom({
        roomData: { jid: JID, name: 'a', messages: [] } as unknown as IRoom,
      })
    );
  });

  it('does not throw when a reaction is removed in a room with no messages', () => {
    expect(() =>
      store.dispatch(
        setReactions({
          roomJID: JID,
          messageId: 'x',
          from: 'peer@example.com',
          reactions: [],
          latestReactionTimestamp: '1700000000000000',
          data: { senderFirstName: 'A', senderLastName: 'B' },
        } as any)
      )
    ).not.toThrow();
  });

  it('a live reaction sets the preview, an archive replay does not', () => {
    const payload = {
      roomJID: JID,
      messageId: 'x',
      from: 'peer@example.com',
      reactions: ['heart'],
      latestReactionTimestamp: '1700000000000000',
      data: { senderFirstName: 'A', senderLastName: 'B' },
    } as any;
    store.dispatch({ ...setReactions(payload), meta: { fromHistory: true } });
    expect(store.getState().rooms.rooms[JID].lastMessage?.body).not.toBe(
      'heart'
    );
    store.dispatch(setReactions(payload));
    expect(store.getState().rooms.rooms[JID].lastMessage?.body).toBe('heart');
  });
});

describe('resetSessionRoomState', () => {
  it("demotes 'error' so the room is retried", () => {
    const out = resetSessionRoomState({
      a: { jid: 'a', messages: [], historyPreloadState: 'error' } as any,
      b: {
        jid: 'b',
        messages: [{ id: '1' }],
        historyPreloadState: 'error',
      } as any,
    });
    expect(out.a.historyPreloadState).toBe('idle');
    expect(out.b.historyPreloadState).toBe('partial');
  });
});
