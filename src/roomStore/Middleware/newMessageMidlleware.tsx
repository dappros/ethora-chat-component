import { Middleware } from '@reduxjs/toolkit';
import { updateRoom } from '../roomsSlice';

export const newMessageMidlleware: Middleware =
  (storeAPI) => (next) => (action: any) => {
    if (action.type !== 'roomMessages/addRoomMessage') {
      return next(action);
    }
    const result = next(action);

    const { roomJID, message } = action.payload;

    storeAPI.dispatch(
      updateRoom({
        jid: roomJID,
        updates: { lastMessageTimestamp: Number(message.id) ?? 0 },
      })
    );

    return result;
  };
