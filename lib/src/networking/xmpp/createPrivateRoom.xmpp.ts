import { Client } from '@xmpp/client';
import { createRoomPresence } from './createRoomPresence.xmpp';
import { setMeAsOwner } from './setMeAsOwner.xmpp';
import { roomConfig } from './roomConfig.xmpp';
import { CONFERENCE_DOMAIN } from '../../helpers/constants/PLATFORM_CONSTANTS';

export async function createPrivateRoom(
  title: string,
  description: string,
  to: string,
  client: Client
) {
  console.log(title, description, to);

  const roomHash = to;
  const roomId = `${roomHash}${CONFERENCE_DOMAIN}`;

  try {
    await createRoomPresence(roomId, client);
    await setMeAsOwner(roomId, client);
    await roomConfig(roomId, title, description, client);
  } catch (error) {
    console.log(error);
  }
  return roomId;
}
