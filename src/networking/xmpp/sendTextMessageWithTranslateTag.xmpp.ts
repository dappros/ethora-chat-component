import { Client, xml } from '@xmpp/client';
import { Iso639_1Codes } from '../../types/types';

export const sendTextMessageWithTranslateTag = (
  client: Client,
  stanzaMessage: {
    roomJID: string;
    firstName: string;
    lastName: string;
    photo: string;
    walletAddress: string;
    userMessage: string;
    notDisplayedValue?: string;
    isReply?: boolean;
    showInChannel?: boolean;
    mainMessage?: string;
    devServer?: string;
  },
  source: Iso639_1Codes
) => {
  const id = `get-translate-messsage:${Date.now().toString()}`;

  try {
    const message = xml(
      'message',
      {
        to: stanzaMessage.roomJID,
        type: 'groupchat',
        id: id,
      },
      xml('data', {
        ...stanzaMessage,
      }),
      xml('body', {}, stanzaMessage.userMessage),
      xml('translate', { source: source || 'es' })
    );

    client.send(message);
  } catch (error) {
    console.error('An error occurred while sending message:', error);
  }
};
