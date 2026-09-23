import { Client, xml } from '@xmpp/client';
import { Iso639_1Codes, IMentionSpan } from '../../types/types';
import {
  accountDomain,
  isE2eeRoom,
  omemoReady,
  roomRecipients,
} from '../../e2ee';

export const sendTextMessageWithTranslateTag = async (
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
): Promise<boolean> => {
  const id = customId || `get-translate-messsage:${Date.now().toString()}`;

  try {
    const { mentions, userMessage, ...restStanzaMessage } = stanzaMessage;
    const roomJID = stanzaMessage.roomJID;
    const e2ee = isE2eeRoom(roomJID);

    const data = xml('data', {
      ...restStanzaMessage,
      // `<data>` always rides along in the clear - the server's push module
      // builds notifications out of its attributes, so it is never part of
      // the OMEMO payload (see sendTextMessage.xmpp.ts for the full trade).
      // Which means the message text must not be stamped here in an e2ee
      // room: doing so would hand the server, and MAM, the very plaintext
      // the encrypted <body> is there to withhold.
      ...(e2ee ? {} : { userMessage }),
      // Same side-channel encoding as sendTextMessage.xmpp.ts: a JSON
      // array of {jid, name, offset, length} spans into `userMessage`.
      ...(mentions && mentions.length > 0
        ? { mentions: JSON.stringify(mentions) }
        : {}),
      push: 'true',
    });
    const body = xml('body', {}, userMessage);

    // `<translate source>` only DECLARES what language this text is in -
    // it costs nothing to send and is what lets each reader translate the
    // message into their own language on their side. The message is never
    // pre-translated here: that put an HTTP round trip in front of every
    // send (see sendTextMessageWithTranslateTagStanza).
    //
    // Except in an e2ee room, where the tag is left off entirely. Actual
    // translations are attached server-side (useMessageTranslation is a
    // pure lookup over what arrived on the stanza), and the server only
    // ever sees the OMEMO fallback string - so the tag buys the reader
    // nothing there, while inviting mod_translate to store a second copy
    // of whatever plaintext it can reach. This holds on the clear-text
    // fallback below too: a room marked e2ee does not get server-side
    // translation, whether or not this particular send got encrypted.
    const translate = e2ee ? [] : [xml('translate', { source: source })];

    if (e2ee) {
      const crypto = await omemoReady();
      try {
        if (!crypto) throw new Error('omemo_not_ready');
        const encrypted = await crypto.encryptGroupMessage(
          roomJID,
          roomRecipients(roomJID, accountDomain(client)),
          [body],
          id,
          [data]
        );
        client.send(encrypted);
        return true;
      } catch (error) {
        // The message goes out in clear rather than not at all - the same
        // deliberate choice sendTextMessage makes, for the same reason: the
        // usual cause is that nobody in the room has opened it with
        // encryption on yet. The receiving side marks anything that arrives
        // outside an OMEMO payload as unprotected regardless.
        console.warn(
          `OMEMO: sending to ${roomJID} in clear - ${String(
            (error as Error)?.message || error
          )}`
        );
      }
    }

    const message = xml(
      'message',
      {
        to: roomJID,
        type: 'groupchat',
        id: id,
      },
      data,
      body,
      ...translate
    );

    client.send(message);
    return true;
  } catch (error) {
    console.error('An error occurred while sending message:', error);
    return false;
  }
};
