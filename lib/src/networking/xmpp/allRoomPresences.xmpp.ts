import { Client, xml } from '@xmpp/client';
import { store } from '../../roomStore';
import { presenceInRoom } from './presenceInRoom.xmpp';

export function allRoomPresences(client: Client) {
  {
    const rooms = store.getState().rooms.rooms;
    Object.keys(rooms).forEach((roomJid) => {
      presenceInRoom(client, roomJid);
    });
  }
}
