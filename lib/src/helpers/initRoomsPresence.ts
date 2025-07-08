import XmppClient from '../networking/xmppClient';
import { IRoom } from '../types/types';
import { presenceInRoom } from '../networking/xmpp/presenceInRoom.xmpp';

export const initRoomsPresence = async (
  client: XmppClient,
  rooms: { [jid: string]: IRoom }
) => {
  console.log('Persisted presence');
  if (!client) return null;
  await Promise.all(
    Object.keys(rooms).map((jid) => presenceInRoom(client.client, jid))
  );
};
