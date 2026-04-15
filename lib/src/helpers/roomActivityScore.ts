import { IMessage, IRoom } from '../types/types';

export const getMessageTimestamp = (message?: IMessage): number => {
  if (!message) return 0;

  const dateTs = new Date(message?.date as string).getTime();
  if (Number.isFinite(dateTs) && dateTs > 0) return dateTs;

  const numericId = Number(message?.id);
  if (Number.isFinite(numericId) && numericId > 0) return numericId;

  const inlineTimestamp = Number((message as any)?.timestamp);
  if (Number.isFinite(inlineTimestamp) && inlineTimestamp > 0) {
    return inlineTimestamp;
  }

  return 0;
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
