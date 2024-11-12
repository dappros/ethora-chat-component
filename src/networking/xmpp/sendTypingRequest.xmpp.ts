import { Client, xml } from '@xmpp/client';

export function sendTypingRequest(
  client: Client,
  chatId: string,
  fullName: string,
  start: boolean
) {
  let id = start ? `typing-${Date.now()}` : `stop-typing-${Date.now()}`;
  const stanza = xml(
    'message',
    {
      type: 'groupchat',
      id: id,
      to: chatId,
    },
    xml(start ? 'composing' : 'paused', {
      xmlns: 'http://jabber.org/protocol/chatstates',
    }),
    xml('data', {
      fullName: fullName,
    })
  );

  client.send(stanza);
}
