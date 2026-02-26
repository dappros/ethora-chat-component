import XmppClient from '../networking/xmppClient';
import { IRoom } from '../types/types';
import { presenceInRoom } from '../networking/xmpp/presenceInRoom.xmpp';

const inFlightByClient = new Map<string, Promise<void>>();

export const initRoomsPresence = async (
  client: XmppClient,
  rooms: { [jid: string]: IRoom }
) => {
  console.log('Persisted presence');
  if (!client) return null;
  const clientKey = client.client?.jid?.toString() || 'xmpp-client';
  const existing = inFlightByClient.get(clientKey);
  if (existing) {
    return existing;
  }
  if (typeof client.client?.setMaxListeners === 'function') {
    client.client.setMaxListeners(100);
  }
  const jids = Object.keys(rooms || {});
  if (!jids.length) return null;
  const run = (async () => {
    for (const jid of jids) {
      try {
        await presenceInRoom(client.client, jid);
      } catch (e) {
        // ignore individual failures
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  })();
  inFlightByClient.set(clientKey, run);
  try {
    await run;
  } finally {
    inFlightByClient.delete(clientKey);
  }
};
