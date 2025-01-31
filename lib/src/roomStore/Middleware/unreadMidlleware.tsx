import { Middleware } from '@reduxjs/toolkit';
import { updateRoom } from '../roomsSlice';
import { IMessage } from '../../types/types';

let previousMessagesCount: { [jid: string]: number } = {};

export const unreadMiddleware: Middleware =
  (storeAPI) => (next) => (action: any) => {
    if (action.type === 'roomMessages/deleteRoomMessage') {
      return next(action);
    }

    const result = next(action);

    const state = storeAPI.getState();
    const rooms = state.rooms.rooms;
    const activeChatJID = state.rooms.activeRoomJID;

    if (rooms && Object.keys(rooms).length > 0) {
      Object.keys(rooms).forEach((jid) => {
        const room = rooms[jid];
        if (room.lastViewedTimestamp !== 0 && jid !== activeChatJID) {
          const currentMessagesLength = room.messages?.length || 0;

          if (previousMessagesCount[jid] !== currentMessagesLength) {
            previousMessagesCount[jid] = currentMessagesLength;

            const unreadMessagesCount = room.messages?.filter(
              (msg: IMessage) =>
                msg.id !== 'delimiter-new' &&
                new Date(msg.date).getTime() > (room.lastViewedTimestamp || 0)
            ).length;

            if (room.unreadMessages !== unreadMessagesCount) {
              storeAPI.dispatch(
                updateRoom({
                  jid,
                  updates: { unreadMessages: unreadMessagesCount },
                })
              );
            }
          }
        }
      });
    }

    return result;
  };
