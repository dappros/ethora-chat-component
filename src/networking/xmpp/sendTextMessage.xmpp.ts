import { Client, xml } from '@xmpp/client';
import { SERVICE } from '../../config';

export const sendTextMessage = (
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
  customId?: string
): boolean => {
  const id = customId
    ? customId
    : isReply
      ? `send-reply-message-${Date.now().toString()}`
      : `send-text-message-${Date.now().toString()}`;

  try {
    const message = xml(
      'message',
      {
        to: roomJID,
        type: 'groupchat',
        id: id,
      },
      xml('data', {
        xmlns: devServer || SERVICE,
        senderFirstName: firstName,
        senderLastName: lastName,
        fullName: `${firstName} ${lastName}`,
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
        push: "true",
      }),
      xml('body', {}, userMessage)
    );
    client.send(message);
    return true;
  } catch (error) {
    console.error('An error occurred while sending message:', error);
    return false;
  }
};
