import { Client, xml } from '@xmpp/client';

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
  devServer?: string
) => {
  const id = isReply
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
        xmlns: `wss://${devServer || 'xmpp.ethoradev.com:5443'}/ws`,
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
      }),
      xml('body', {}, userMessage)
    );
    client.send(message);
  } catch (error) {
    console.error('An error occurred while sending message:', error);
  }
};
