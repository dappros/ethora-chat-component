import { Client, xml } from '@xmpp/client';
import { Iso639_1Codes, IMentionSpan } from '../../types/types';

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
    mentions?: IMentionSpan[];
  },
  source: Iso639_1Codes,
  customId?: string
): boolean => {
  const id = customId || `get-translate-messsage:${Date.now().toString()}`;

  try {
    // `<translate source>` only DECLARES what language this text is in -
    // it costs nothing to send and is what lets each reader translate the
    // message into their own language on their side. The message is never
    // pre-translated here: that put an HTTP round trip in front of every
    // send (see sendTextMessageWithTranslateTagStanza).
    const { mentions, ...restStanzaMessage } = stanzaMessage;
    const message = xml(
      'message',
      {
        to: stanzaMessage.roomJID,
        type: 'groupchat',
        id: id,
      },
      xml('data', {
        ...restStanzaMessage,
        // Same side-channel encoding as sendTextMessage.xmpp.ts: a JSON
        // array of {jid, name, offset, length} spans into `userMessage`.
        ...(mentions && mentions.length > 0
          ? { mentions: JSON.stringify(mentions) }
          : {}),
        push: 'true',
      }),
      xml('body', {}, stanzaMessage.userMessage),
      xml('translate', { source: source })
    );

    client.send(message);
    return true;
  } catch (error) {
    console.error('An error occurred while sending message:', error);
    return false;
  }
};
