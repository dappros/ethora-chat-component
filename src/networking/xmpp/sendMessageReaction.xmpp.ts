import { Client, xml } from '@xmpp/client';
import { isE2eeEnabled, isE2eeRoom } from '../../e2ee';

export interface ReactionStanzaData {
  firstName?: string;
  lastName?: string;
  photoURL?: string;
  push?: boolean;
  messageAuthor?: string;
  messageText?: string;
  isMediafile?: string;
  mimetype?: string;
  fileName?: string;
}

export const REACTION_MESSAGE_TEXT_MAX = 120;

export function sendMessageReaction(
  client: Client,
  messageId: string,
  roomJid: string,
  reactionsList: string[],
  data: ReactionStanzaData = {}
) {
  const id = `message-reaction:${Date.now().toString()}`;

  const push = Boolean(data.push) && reactionsList.length > 0;
  const encrypted = isE2eeEnabled() && isE2eeRoom(roomJid);
  const messageText =
    push && !encrypted ? String(data.messageText ?? '').slice(0, REACTION_MESSAGE_TEXT_MAX) : '';

  const dataReaction: Record<string, string> = {
    senderFirstName: data.firstName ?? '',
    senderLastName: data.lastName ?? '',
    senderJID: client.jid?.toString() ?? '',
    roomJid,
    ...(data.photoURL ? { photoURL: data.photoURL } : {}),
    ...(push
      ? {
          push: 'true',
          messageAuthor: data.messageAuthor ?? '',
          messageText,
          isMediafile: data.isMediafile ?? '',
          mimetype: data.mimetype ?? '',
          fileName: data.fileName ?? '',
        }
      : {}),
  };

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
        from: client.jid?.toString(),
        xmlns: 'urn:xmpp:reactions:0',
      },
      ...reactionsList.map((reaction) => xml('reaction', {}, reaction ?? ''))
    ),
    xml('data', dataReaction),
    xml('store', { xmlns: 'urn:xmpp:hints' })
  );

  client.send(message);
}
