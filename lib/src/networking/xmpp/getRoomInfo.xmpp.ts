import { Client, xml } from '@xmpp/client';

export const getRoomInfo = (roomJID: string, client: Client) => {
  //main info, descrription etc
  const message = xml(
    'iq',
    {
      id: 'roomInfo',
      to: roomJID,
      type: 'get',
    },
    xml('query', { xmlns: 'http://jabber.org/protocol/disco#info' })
  );
  client.send(message);
};
