import XmppClient from '../networking/xmppClient';
import { IRoom } from '../types/types';
import { ethoraLogger } from './ethoraLogger';
import { isLikelyMucJid } from './isLikelyMucJid';

const inFlightByClient = new Map<string, Promise<void>>();

export const initRoomsPresence = async (
  client: XmppClient,
  rooms: { [jid: string]: IRoom }
) => {
  ethoraLogger.log('Persisted presence');
  if (!client) return null;
  const clientKey = client.client?.jid?.toString() || 'xmpp-client';
  const existing = inFlightByClient.get(clientKey);
  if (existing) {
    return existing;
  }
  if (typeof client.client?.setMaxListeners === 'function') {
    client.client.setMaxListeners(100);
  }
  // Same class of bug as the MAM-queue leak: non-JID root-slice keys
  // (usersSet, subscribedRooms, ...) leaking into rooms.rooms would each cost
  // up to the full 5000ms presenceInRoomStanza timeout in this already-slow
  // sequential fallback loop, on top of a wasted stanza round-trip.
  const jids = Object.keys(rooms || {}).filter(isLikelyMucJid);
  if (!jids.length) return null;
  // Bounded concurrency instead of a strictly serial walk: worst case used
  // to be rooms x (5000ms timeout + 35ms), i.e. minutes of background
  // presence work on a degraded connection. ensureRoomPresence dedupes
  // per-room, so parallel workers are safe.
  const CONCURRENCY = 5;
  const queue = [...jids];
  const run = (async () => {
    const worker = async () => {
      while (queue.length) {
        const jid = queue.shift();
        if (!jid) break;
        try {
          await client.presenceInRoomStanza(jid, 0, 5000, true);
        } catch (e) {
          // ignore individual failures
        }
        await new Promise((resolve) => setTimeout(resolve, 35));
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, jids.length) }, worker)
    );
  })();
  inFlightByClient.set(clientKey, run);
  try {
    await run;
  } finally {
    inFlightByClient.delete(clientKey);
  }
};
