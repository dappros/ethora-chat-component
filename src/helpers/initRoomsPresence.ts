import XmppClient from '../networking/xmppClient';
import { IRoom } from '../types/types';

export const initRoomsPresence = async (
  client: XmppClient,
  rooms: { [jid: string]: IRoom }
) => {
  console.log('Persisted presence');
  if (!client) return null;
  return new Promise<void>((resolve, reject) => {
    Promise.all(
      Object.keys(rooms).map((jid) => {
        client.presenceInRoomStanza(jid);
        console.log('Persisted history');
      })
    )
      .then(() => resolve())
      .catch(reject);
  });
};
