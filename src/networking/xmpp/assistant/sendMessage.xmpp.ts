import { Client, xml } from '@xmpp/client';

export const sendTextMessageAssistant = (
  client: Client,
  roomJID: string,
  userMessage: string
) => {
  const id = `send-text-message-to-assistant-${Date.now().toString()}`;
  console.log(id);

  try {
    const message = xml(
      'message',
      {
        to: roomJID,
        type: 'chat',
        id: id,
      },
      xml('body', {}, userMessage)
    );
    client.send(message);
  } catch (error) {
    console.error('An error occurred while sending message:', error);
  }
};
