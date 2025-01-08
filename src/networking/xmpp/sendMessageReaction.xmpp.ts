import { Client, xml } from '@xmpp/client';

export function sendMessageReaction(
  client: Client,
  messageId: string,
  reactionSymbol?: any
) {
  const message = xml(
    'message',
    {
      id: 'sendReaction',
      type: 'chat',
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
