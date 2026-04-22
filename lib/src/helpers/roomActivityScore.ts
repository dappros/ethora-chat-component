import { IMessage, IRoom } from '../types/types';
import { getTimestampFromUnknown } from './timestamp';

export const getMessageTimestamp = (message?: IMessage): number => {
  if (!message) return 0;

  const hasExplicitTimestamp = Object.prototype.hasOwnProperty.call(
    message || {},
    'messageTimestampMs'
  );
  if (hasExplicitTimestamp) {
    return getTimestampFromUnknown((message as any)?.messageTimestampMs);
  }

  return (
    getTimestampFromUnknown(message?.date) ||
    getTimestampFromUnknown((message as any)?.timestamp) ||
    getTimestampFromUnknown(message?.id)
  );
};

export const getLastLocalMessageTimestamp = (room?: IRoom): number => {
  if (!room?.messages?.length) return 0;
  for (let i = room.messages.length - 1; i >= 0; i -= 1) {
    const message = room.messages[i];
    if (!message || message.id === 'delimiter-new' || message.pending) continue;
    const ts = getMessageTimestamp(message);
    if (ts > 0) return ts;
  }
  return 0;
};

export const getRoomLastActivityScore = (room?: IRoom): number => {
  if (!room) return 0;
  return Math.max(
    Number(room.lastMessageTimestamp || 0),
    Number(room.messageStats?.lastMessageTimestamp || 0),
    getLastLocalMessageTimestamp(room)
  );
};
