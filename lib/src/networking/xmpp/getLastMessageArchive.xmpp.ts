import { Client, xml } from '@xmpp/client';

export function getLastMessage(client: Client, roomJID: string) {
  const message = xml(
    'iq',
    {
      type: 'set',
      to: roomJID,
      id: 'GetArchive',
    },
    xml(
      'query',
      { xmlns: 'urn:xmpp:mam:2' },
      xml(
        'set',
        { xmlns: 'http://jabber.org/protocol/rsm' },
        xml('max', {}, '1'),
        xml('before')
      )
    )
  );

  client.send(message);
}
