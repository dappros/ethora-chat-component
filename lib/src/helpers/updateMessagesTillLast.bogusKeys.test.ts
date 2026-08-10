import { describe, expect, it, vi } from 'vitest';
import { updateMessagesTillLast } from './updateMessagesTillLast';
import { IRoom } from '../types/types';

const room = (jid: string): IRoom => ({ jid, name: jid, messages: [] }) as IRoom;

describe('updateMessagesTillLast — skips non-JID keys (live-observed bug)', () => {
  it('only fetches history for real MUC JIDs, never for leaked root-state keys', async () => {
    // Exact shape observed on a live account: real rooms mixed with root-slice
    // keys (activeRoomJID, usersSet, subscribedRooms, pushSubscriptionStatus,
    // rooms) that leaked into rooms.rooms from corrupted/legacy persisted
    // state and were being queued as fake "rooms" for MAM history fetches.
    const rooms: Record<string, IRoom> = {
      'room1@conference.xmpp.example.com': room(
        'room1@conference.xmpp.example.com'
      ),
      'room2@conference.xmpp.example.com': room(
        'room2@conference.xmpp.example.com'
      ),
      activeRoomJID: 'some-jid@conference.xmpp.example.com' as unknown as IRoom,
      usersSet: {} as unknown as IRoom,
      subscribedRooms: [] as unknown as IRoom,
      pushSubscriptionStatus: {} as unknown as IRoom,
      rooms: {} as unknown as IRoom,
    };

    const requestedJids: string[] = [];
    const client = {
      getHistoryStanza: vi.fn((jid: string) => {
        requestedJids.push(jid);
        return Promise.resolve([]);
      }),
      promoteRoomHistory: vi.fn(),
    } as any;

    await updateMessagesTillLast(rooms, client, 2);

    expect(requestedJids).toEqual(
      expect.arrayContaining([
        'room1@conference.xmpp.example.com',
        'room2@conference.xmpp.example.com',
      ])
    );
    expect(requestedJids).toHaveLength(2);
    expect(requestedJids).not.toContain('activeRoomJID');
    expect(requestedJids).not.toContain('usersSet');
    expect(requestedJids).not.toContain('subscribedRooms');
    expect(requestedJids).not.toContain('pushSubscriptionStatus');
    expect(requestedJids).not.toContain('rooms');
  });

  it('no-ops cleanly when every entry is a bogus key (no real rooms)', async () => {
    const rooms: Record<string, IRoom> = {
      activeRoomJID: 'x' as unknown as IRoom,
      usersSet: {} as unknown as IRoom,
    };
    const client = {
      getHistoryStanza: vi.fn(),
      promoteRoomHistory: vi.fn(),
    } as any;

    await expect(
      updateMessagesTillLast(rooms, client, 2)
    ).resolves.toBeUndefined();
    expect(client.getHistoryStanza).not.toHaveBeenCalled();
  });
});
