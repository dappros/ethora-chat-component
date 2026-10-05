import { Client } from '@xmpp/client';
import { store } from '../../roomStore';
import { presenceInRoom } from './presenceInRoom.xmpp';
import { isLikelyMucJid } from '../../helpers/isLikelyMucJid';

export interface AllRoomPresenceSummary {
  total: number;
  success: number;
  failed: number;
  failedRooms: string[];
  // Every JID this sweep sent a presence for (snapshot taken at start).
  sweptRooms: string[];
  failures?: Array<{ roomJid: string; reason: string }>;
}

// `join` lets the owner route each room through its dedup layer
// (XmppClient.ensureRoomPresence) so the sweep shares an in-flight join with
// background history tasks instead of sending a second <presence> for the
// same room: the server answers a duplicate join once, one waiter would time
// out and the room got a failure backoff while actually being joined.
export type RoomJoiner = (roomJid: string) => Promise<boolean>;

export interface AllRoomPresencesOptions {
  /** Parallel joins. Default 5. */
  concurrency?: number;
  /** Pause after each join, per worker. Default 30 ms. */
  pacingMs?: number;
  /** Rooms the connection already joined: skipped, no round trip. */
  isJoined?: (roomJid: string) => boolean;
  /** The room the user has open: always joined next, ahead of the queue. */
  getActiveRoomJid?: () => string | null | undefined;
  /** Higher = joined earlier (recent activity). Default: store order. */
  rank?: (roomJid: string) => number;
  /** True once this sweep is obsolete (connection dropped and replaced). */
  isCancelled?: () => boolean;
  /** Fired once the first wave (the active room plus one pool-width of the
   *  most recent rooms) has settled, long before the rest of the sweep. */
  onPriorityDone?: () => void;
}

// Joins every room in the store in the background. Order: the active room
// first (re-read before every pick, so a room the user opens while it is
// still queued jumps the queue), then by recent activity. Rooms discovered
// while the sweep runs are picked up before it ends.
export async function allRoomPresences(
  client: Client,
  join?: RoomJoiner,
  options: AllRoomPresencesOptions = {}
): Promise<AllRoomPresenceSummary> {
  const concurrency = Math.max(1, Math.floor(options.concurrency || 5));
  const pacingMs = options.pacingMs ?? 30;
  const isJoined = options.isJoined || (() => false);
  const rank = options.rank || (() => 0);

  const seen = new Set<string>();
  const queue: string[] = [];
  const collect = () => {
    const rooms = store.getState().rooms.rooms;
    const keys = rooms && typeof rooms === 'object' ? Object.keys(rooms) : [];
    const fresh = keys.filter(
      (jid) => isLikelyMucJid(jid) && !seen.has(jid) && !isJoined(jid)
    );
    fresh.forEach((jid) => seen.add(jid));
    // Stable sort: equal scores keep store order.
    fresh.sort((a, b) => rank(b) - rank(a));
    queue.push(...fresh);
  };
  collect();

  const sweptRooms: string[] = [];
  const settledByJid = new Map<string, PromiseSettledResult<any>>();
  const firstWave = Math.min(concurrency, queue.length);
  let started = 0;
  let waveSettled = 0;
  let priorityFired = false;
  const firePriority = () => {
    if (priorityFired) return;
    priorityFired = true;
    options.onPriorityDone?.();
  };
  if (firstWave === 0) firePriority();

  const pickNext = (): string | undefined => {
    const active = options.getActiveRoomJid?.();
    if (active) {
      const at = queue.indexOf(active);
      if (at >= 0) return queue.splice(at, 1)[0];
    }
    return queue.shift();
  };

  const worker = async () => {
    while (!options.isCancelled?.()) {
      if (queue.length === 0) collect();
      const roomJid = pickNext();
      if (!roomJid) return;
      // Opened (and joined) by someone else while this one waited.
      if (isJoined(roomJid)) continue;
      const inFirstWave = started < firstWave;
      started += 1;
      sweptRooms.push(roomJid);
      const result = await Promise.allSettled([
        join
          ? join(roomJid).then((joined) => {
              if (!joined) throw new Error(`presence_failed:${roomJid}`);
              return joined;
            })
          : presenceInRoom(client, roomJid, 0, 5000),
      ]);
      settledByJid.set(roomJid, result[0]);
      if (inFirstWave) {
        waveSettled += 1;
        if (waveSettled >= firstWave) firePriority();
      }
      if (pacingMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, pacingMs));
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  firePriority();
  const roomJids = sweptRooms;
  const settled = roomJids.map(
    (jid) =>
      settledByJid.get(jid) ||
      ({ status: 'rejected', reason: 'cancelled' } as PromiseRejectedResult)
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
    sweptRooms: roomJids,
    failures,
  };
}
