import { Client, xml } from '@xmpp/client';
import { store } from '../../roomStore';
import { presenceInRoom } from './presenceInRoom.xmpp';

export async function allRoomPresences(client: Client) {
  const rooms = store.getState().rooms.rooms;
  await Promise.all(
    Object.keys(rooms).map((roomJid) => presenceInRoom(client, roomJid))
  );
}
