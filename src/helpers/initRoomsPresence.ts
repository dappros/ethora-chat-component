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
  const run = (async () => {
    for (const jid of jids) {
      try {
        await client.presenceInRoomStanza(jid, 0, 5000, true);
      } catch (e) {
        // ignore individual failures
      }
      await new Promise((resolve) => setTimeout(resolve, 35));
    }
  })();
  inFlightByClient.set(clientKey, run);
  try {
    await run;
  } finally {
    inFlightByClient.delete(clientKey);
  }
};
