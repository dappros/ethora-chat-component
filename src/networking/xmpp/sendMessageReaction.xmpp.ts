import { Client, xml } from '@xmpp/client';

export function sendMessageReaction(
  client: Client,
  messageId: string,
  roomJid: string,
  reactionSymbol?: any
) {
  const id = `message-reaction:${Date.now().toString()}`;

  const message = xml(
    'message',
    {
      id: id,
      type: 'groupchat',
      from: client.jid?.toString(),
      to: roomJid,
    },
    xml(
      'reactions',
      {
        id: messageId,
        xmlns: 'urn:xmpp:reactions:0',
      },
      xml('reaction', {}, reactionSymbol ?? '👋')
    ),
    xml('store', { xmlns: 'urn:xmpp:hints' })
  );

  client.send(message);
}
