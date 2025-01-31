import { Client, xml } from '@xmpp/client';
import { CHAT_DOMAIN } from '../../helpers/constants/PLATFORM_CONSTANTS';

export async function inviteRoomRequest(
  client: Client,
  to: string,
  roomJid: string
) {
  const id = `invite-rooms:${Date.now().toString()}`;

  const xmlMessage = xml(
    'message',
    {
      to: roomJid,
      id: id,
    },
    xml(
      'x',
      'http://jabber.org/protocol/muc#user',
      xml('invite', { to: to + CHAT_DOMAIN })
    )
  );

  client.send(xmlMessage);
}
