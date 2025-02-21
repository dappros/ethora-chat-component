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

//   import { Middleware, PayloadAction } from '@reduxjs/toolkit';
// import { updateRoom } from '../roomsSlice';
// import { AddRoomMessageAction, IRoom } from '../../types/types';
// import { nanoToMs } from '../../helpers/nanoToMs';

// export const newMessageMidlleware: Middleware =
//   (storeAPI) =>
//   (next) =>
//   (action: PayloadAction<Partial<AddRoomMessageAction>>) => {
//     if (action.type !== 'roomMessages/addRoomMessage') {
//       return next(action);
//     }

//     const result = next(action);
//     const state = storeAPI.getState();
//     const rooms: { [jid: string]: IRoom } = state.rooms.rooms;
//     const { roomJID, message } = action.payload;

//     const updLastMessage = () => {
//       const updates = {
//         lastMessageTimestamp: nanoToMs(message.id) ?? 0,
//         lastMessage: { ...message },
//       };

//       storeAPI.dispatch(
//         updateRoom({
//           jid: roomJID,
//           updates,
//         })
//       );
//     };

//     if (!message.body) {
//       return result;
//     }

//     try {
//       if (
//         rooms[roomJID]?.lastMessageTimestamp <= nanoToMs(message.id) ||
//         !rooms[roomJID]?.lastMessageTimestamp
//       ) {
//         updLastMessage();
//       }
//     } catch (error) {
//       console.error('Error updating room last message:', error);
//     }

//     return result;
//   };
