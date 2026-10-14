import { IMessage } from '../types/types';

/**
 * Ids of the messages that end a run of one sender: the next row is another
 * sender, a system row, or a message on the next day. A run is a block of
 * consecutive messages from one person, which the bubbles group visually.
 *
 * Pass the full list, not a window of it, so the last row of a window still
 * knows what follows it.
 */
export const messageRunEnds = (list: IMessage[]): Set<string> => {
  const ends = new Set<string>();
  list.forEach((message, index) => {
    const next = list[index + 1];
    const continues =
      !!next &&
      next.user.id === message.user.id &&
      next.isSystemMessage !== 'true' &&
      message.isSystemMessage !== 'true' &&
      new Date(next.date).toDateString() === new Date(message.date).toDateString();
    if (!continues) ends.add(message.id);
  });
  return ends;
};
