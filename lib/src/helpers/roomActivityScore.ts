import { IMessage, IRoom } from '../types/types';
import { getTimestampFromUnknown, normalizeTimestampValue } from './timestamp';

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
  // Everything normalised to milliseconds: the MAM-derived timestamps are
  // archive ids (microseconds), which made any room that had one outrank a
  // room whose only signal is in ms. `lastMessage.date` is the API's seed
  // for a room that has loaded nothing yet - the newest of all signals wins.
  return Math.max(
    normalizeTimestampValue(Number(room.lastMessageTimestamp || 0)),
    normalizeTimestampValue(Number(room.messageStats?.lastMessageTimestamp || 0)),
    getLastLocalMessageTimestamp(room),
    getTimestampFromUnknown(room.lastMessage?.date)
  );
};
