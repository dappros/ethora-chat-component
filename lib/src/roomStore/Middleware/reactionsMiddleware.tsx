import { Middleware, PayloadAction } from '@reduxjs/toolkit';
import { updateRoom } from '../roomsSlice';
import { IRoom, ReactionAction } from '../../types/types';
import { nanoToMs } from '../../helpers/nanoToMs';

export const reactionsMiddleware: Middleware =
  (storeAPI) => (next) => (action: any) => {
    if (action.type !== 'roomMessages/setReactions') {
      return next(action);
    }

    if (!action.payload || typeof action.payload !== 'object') {
      console.error('Invalid action payload for setReactions:', action);
      return next(action);
    }

    const result = next(action);
    // Reactions replayed from the archive update the target message only. The
    // room preview showing an emoji is for LIVE reactions; a history replay
    // would otherwise replace the latest real message with 'heart'.
    if (action.meta?.fromHistory) return result;
    const state = storeAPI.getState();
    const rooms: { [jid: string]: IRoom } = state.rooms.rooms;
    const { roomJID, reactions, latestReactionTimestamp, data, ...rest } =
      action.payload;

    const updLastMessage = () => {
      if (!reactions?.[0]) {
        // A reaction was removed (or an archive replay carried an empty
        // reaction set) for a room that has no loaded messages yet: there is
        // no message to fall back to. This used to throw on `messages[-1].id`,
        // which killed the whole MAM page parse and left the room in the
        // 'error' preload state forever.
        const roomMessages = rooms[roomJID].messages || [];
        const newLastMessage = roomMessages[roomMessages.length - 1];
        if (!newLastMessage) return;

        storeAPI.dispatch(
          updateRoom({
            jid: roomJID,
            updates: {
              lastMessageTimestamp: nanoToMs(newLastMessage.id),
              lastMessage: newLastMessage,
            },
          })
        );
      } else {
        const updates = {
          lastMessageTimestamp: nanoToMs(latestReactionTimestamp) ?? 0,
          lastMessage: {
            ...rest,
            body: reactions[0],
            emoji: reactions[0],
            user: {
              name: `${data.senderFirstName} ${data.senderLastName}`,
              id: `emoji-${new Date().toString()}`,
            },
            date: new Date(nanoToMs(latestReactionTimestamp)).toISOString(),
          },
        };

        storeAPI.dispatch(
          updateRoom({
            jid: roomJID,
            updates,
          })
        );
      }
    };

    if (!rooms[roomJID]) {
      console.warn(`Room ${roomJID} not found in reactions middleware`);
      return result;
    }

    if (
      rooms[roomJID]?.lastMessageTimestamp <= nanoToMs(latestReactionTimestamp)
    ) {
      updLastMessage();
    } else if (!rooms[roomJID]?.lastMessageTimestamp) {
      updLastMessage();
    }

    return result;
  };
