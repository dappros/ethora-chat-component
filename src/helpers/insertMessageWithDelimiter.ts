import { IMessage } from '../types/types';
import { isDateAfter, isDateBefore } from './dateComparison';

export function insertMessageWithDelimiter(
  roomMessages: Partial<IMessage>[],
  message: IMessage
) {
  const existingMessage = roomMessages.find((msg) => msg.id === message.id);

  if (existingMessage) return;

  const newMessageDate = message.date;
  const lastMessage = roomMessages[roomMessages.length - 1];
  const firstMessage = roomMessages[0];

  if (isDateAfter(newMessageDate.toString(), lastMessage.date.toString())) {
    const index = roomMessages.findIndex((msg) => msg.id === message.xmppId);
    if (index !== -1) {
      roomMessages[index] = { ...message, id: message.id, pending: false };
    } else {
      roomMessages.push(message);
    }

    if (!roomMessages.some((msg) => msg.id === 'delimiter-new')) {
    }
  } else if (
    isDateBefore(newMessageDate.toString(), firstMessage.date.toString())
  ) {
    roomMessages.unshift(message);
  } else {
    for (let i = 0; i < roomMessages.length; i++) {
      if (
        isDateBefore(newMessageDate.toString(), roomMessages[i].date.toString())
      ) {
        roomMessages.splice(i, 0, message);
        break;
      }
    }
  }
}
