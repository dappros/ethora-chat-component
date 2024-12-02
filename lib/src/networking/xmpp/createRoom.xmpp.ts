import { sha256 } from 'js-sha256';

import { Client } from '@xmpp/client';
import { createRoomPresence } from './createRoomPresence.xmpp';
import { setMeAsOwner } from './setMeAsOwner.xmpp';
import { roomConfig } from './roomConfig.xmpp';
import { CONFERENCE_DOMAIN } from '../../helpers/constants/PLATFORM_CONSTANTS';

export async function createRoom(
  title: string,
  description: string,
  client: Client,
  to?: string
) {
  const randomNumber = Math.round(Math.random() * 100_000);
  const chatNameWithSalt = title + Date.now() + randomNumber;
  const roomHash = to || sha256(chatNameWithSalt);
  const roomId = `${roomHash}${CONFERENCE_DOMAIN}`;

  try {
    await createRoomPresence(roomId, client);
    await setMeAsOwner(roomId, client);
    await roomConfig(roomId, title, description, client);

    // await Promise.all([
    //   createRoomPresence(roomId, client),
    //   setMeAsOwner(roomId, client),
    //   roomConfig(roomId, title, description, client),
    // ]);
  } catch (error) {
    console.log(error);
  }
  return roomId;
}
