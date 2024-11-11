import { Client, xml } from '@xmpp/client';

export function deleteMessage(client: Client, room: string, msgId: string) {
  const stanza = xml(
    'message',
    {
      from: client.jid?.toString(),
      to: room,
      id: 'deleteMessageStanza',
      type: 'groupchat',
    },
    xml('body', 'wow'),
    xml('delete', {
      id: msgId,
    })
  );

  client.send(stanza);
}
