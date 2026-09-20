import { Client, xml } from '@xmpp/client';
import { SERVICE } from '../../config';
import { IMentionSpan } from '../../types/types';
import {
  accountDomain,
  isE2eeRoom,
  omemoReady,
  roomRecipients,
} from '../../e2ee';

export const sendTextMessage = async (
  client: Client,
  roomJID: string,
  firstName: string,
  lastName: string,
  photo: string,
  walletAddress: string,
  userMessage: string,
  notDisplayedValue?: string,
  isReply?: boolean,
  showInChannel?: boolean,
  mainMessage?: string,
  devServer?: string,
  customId?: string,
  mentions?: IMentionSpan[]
): Promise<boolean> => {
  const id = customId
    ? customId
    : isReply
      ? `send-reply-message-${Date.now().toString()}`
      : `send-text-message-${Date.now().toString()}`;

  try {
    const data = xml('data', {
      xmlns: devServer || SERVICE,
      senderFirstName: firstName,
      senderLastName: lastName,
      fullName: `${firstName} ${lastName}`,
      // IMPORTANT: getDataFromXml.ts reads the avatar from the `photo`
      // attribute, not `photoURL`. Stamping `photoURL` here is a legacy
      // mismatch (regular user messages historically rendered without an
      // avatar). Emit BOTH keys for now so we don't break anything still
      // reading `photoURL` on the receiving side, while modern receivers
      // (chat-component getDataFromXml + ai-service xmpp.ts identity)
      // pick up the correct `photo` field.
      photo: photo,
      photoURL: photo,
      senderJID: client.jid?.toString(),
      senderWalletAddress: walletAddress,
      roomJid: roomJID,
      isSystemMessage: false,
      tokenAmount: 0,
      quickReplies: '',
      notDisplayedValue: '',
      showInChannel: showInChannel || false,
      isReply: isReply || false,
      mainMessage: mainMessage || '',
      // Side-channel metadata for @-mentions in `userMessage`: a JSON array
      // of {jid, name, offset, length}. Only stamped when non-empty so old
      // messages/clients never see a stray empty attribute.
      ...(mentions && mentions.length > 0
        ? { mentions: JSON.stringify(mentions) }
        : {}),
      push: 'true',
    });
    const body = xml('body', {}, userMessage);

    // E2EE seam. Both <data> and <body> go inside the SCE envelope: the
    // sender's name, avatar, mentions and reply target live in <data>, so
    // encrypting only the body would leave the interesting half in clear.
    if (isE2eeRoom(roomJID)) {
      const crypto = await omemoReady();
      try {
        if (!crypto) throw new Error('omemo_not_ready');
        const encrypted = await crypto.encryptGroupMessage(
          roomJID,
          roomRecipients(roomJID, accountDomain(client)),
          [data, body],
          id
        );
        client.send(encrypted);
        return true;
      } catch (error) {
        // The message goes out in clear rather than not at all - a deliberate
        // choice, since the usual cause is simply that nobody in the room has
        // opened it with encryption on yet. The receiving side does not take
        // our word for it: in an `e2ee` room anything that arrives outside an
        // OMEMO payload is marked unprotected in the UI regardless.
        console.warn(
          `OMEMO: sending to ${roomJID} in clear - ${String(
            (error as Error)?.message || error
          )}`
        );
      }
    }

    client.send(
      xml(
        'message',
        {
          to: roomJID,
          type: 'groupchat',
          id: id,
        },
        data,
        body
      )
    );
    return true;
  } catch (error) {
    console.error('An error occurred while sending message:', error);
    return false;
  }
};
