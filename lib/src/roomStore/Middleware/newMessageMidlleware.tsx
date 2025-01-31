import { Middleware } from '@reduxjs/toolkit';
import { updateRoom } from '../roomsSlice';
import { IRoom } from '../../types/types';

export const newMessageMidlleware: Middleware =
  (storeAPI) => (next) => (action: any) => {
    if (action.type !== 'roomMessages/addRoomMessage') {
      return next(action);
    }
    const result = next(action);
    const state = storeAPI.getState();
    const rooms: { [jid: string]: IRoom } = state.rooms.rooms;

    const { roomJID, message } = action.payload;

    if (rooms[roomJID]?.lastMessageTimestamp <= Number(message.id)) {
      storeAPI.dispatch(
        updateRoom({
          jid: roomJID,
          updates: { lastMessageTimestamp: Number(message.id) ?? 0 },
        })
      );
    }

    return result;
  };
