import XmppClient from '../networking/xmppClient';
import { IRoom } from '../types/types';
import { presenceInRoom } from '../networking/xmpp/presenceInRoom.xmpp';

export const initRoomsPresence = async (
  client: XmppClient,
  rooms: { [jid: string]: IRoom }
) => {
  console.log('Persisted presence');
  if (!client) return null;
  const jids = Object.keys(rooms || {});
  if (!jids.length) return null;
  await Promise.allSettled(
    jids.map(async (jid) => {
      try {
        await presenceInRoom(client.client, jid);
      } catch (e) {}
    })
  );
};
