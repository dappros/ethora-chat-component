import { Client } from '@xmpp/client';
import { store } from '../../roomStore';
import { presenceInRoom } from './presenceInRoom.xmpp';

export interface AllRoomPresenceSummary {
  total: number;
  success: number;
  failed: number;
  failedRooms: string[];
  failures?: Array<{ roomJid: string; reason: string }>;
}

export async function allRoomPresences(
  client: Client
): Promise<AllRoomPresenceSummary> {
  const rooms = store.getState().rooms.rooms;
  const roomJids = Object.keys(rooms);
  if (!roomJids.length) {
    return { total: 0, success: 0, failed: 0, failedRooms: [], failures: [] };
  }

  const settled = await Promise.allSettled(
    roomJids.map((roomJid) => presenceInRoom(client, roomJid))
  );
  const failedRooms: string[] = [];
  const failures: Array<{ roomJid: string; reason: string }> = [];
  let success = 0;

  settled.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      success += 1;
      return;
    }
    const roomJid = roomJids[index];
    failedRooms.push(roomJid);
    const reason =
      result.reason instanceof Error
        ? result.reason.message
        : typeof result.reason === 'string'
          ? result.reason
          : JSON.stringify(result.reason ?? { error: 'unknown' });
    failures.push({ roomJid, reason });
  });

  return {
    total: roomJids.length,
    success,
    failed: failedRooms.length,
    failedRooms,
    failures,
  };
}
