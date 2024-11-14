import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { IMessage, IRoom } from '../types/types';
import { insertMessageWithDelimiter } from '../helpers/insertMessageWithDelimiter';

interface RoomMessagesState {
  rooms: { [jid: string]: IRoom };
  activeRoomJID: string;
  isLoading: boolean;
}

const initialState: RoomMessagesState = {
  rooms: {},
  activeRoomJID: null,
  isLoading: false,
};

export const roomsStore = createSlice({
  name: 'roomMessages',
  initialState,
  reducers: {
    addRoom(state, action: PayloadAction<{ roomData: IRoom }>) {
      const { roomData } = action.payload;
      state.rooms[roomData.jid] = roomData;
    },
    deleteRoom(state, action: PayloadAction<{ jid: string }>) {
      const { jid } = action.payload;
      if (state.rooms[jid]) {
        delete state.rooms[jid];
      }
    },
    setRoomMessages(
      state,
      action: PayloadAction<{ roomJID: string; messages: IMessage[] }>
    ) {
      const { roomJID, messages } = action.payload;
      if (state.rooms[roomJID]) {
        state.rooms[roomJID].messages = messages;
      }
    },
    deleteRoomMessage(
      state,
      action: PayloadAction<{ roomJID: string; messageId: string }>
    ) {
      const { roomJID, messageId } = action.payload;
      if (state.rooms[roomJID]) {
        const roomMessages = state.rooms[roomJID].messages;
        const messageIndex = roomMessages.findIndex(
          (msg) => msg.id === messageId
        );
        if (messageIndex !== -1) {
          roomMessages.splice(messageIndex, 1);
        }
      }
    },
    addRoomMessage(
      state,
      action: PayloadAction<{
        roomJID: string;
        message: IMessage;
        start?: boolean;
      }>
    ) {
      const { roomJID, message, start } = action.payload;

      if (!state.rooms[roomJID]?.messages) {
        state.rooms[roomJID].messages = [];
      }

      const roomMessages = state.rooms[roomJID].messages;

      if (roomMessages.length === 0 || start) {
        roomMessages.unshift(message);
      } else {
        const lastViewedTimestamp = state.rooms[roomJID].lastViewedTimestamp
          ? new Date(state.rooms[roomJID].lastViewedTimestamp)
          : null;

        insertMessageWithDelimiter(roomMessages, message, lastViewedTimestamp);
      }
    },
    deleteAllRooms(state) {
      state.rooms = {};
    },
    setComposing(
      state,
      action: PayloadAction<{ chatJID: string; composing: boolean }>
    ) {
      const { chatJID, composing } = action.payload;
      state.rooms[chatJID].composing = composing;
    },
    setIsLoading: (
      state,
      action: PayloadAction<{ chatJID?: string; loading: boolean }>
    ) => {
      const { chatJID, loading } = action.payload;
      if (chatJID && state.rooms?.[chatJID]) {
        state.rooms[chatJID].isLoading = loading;
      }
      state.isLoading = loading;
    },
    setLastViewedTimestamp: (
      state,
      action: PayloadAction<{ chatJID: string; timestamp: number }>
    ) => {
      const { chatJID, timestamp } = action.payload;
      if (state.rooms[chatJID]) {
        state.rooms[chatJID].lastViewedTimestamp = timestamp;
        state.rooms[chatJID].unreadMessages = countNewerMessages(
          state.rooms[chatJID].messages,
          timestamp
        );
      }
    },
    setRoomRole: (
      state,
      action: PayloadAction<{ chatJID: string; role: string }>
    ) => {
      const { chatJID, role } = action.payload;
      if (state.rooms[chatJID]) {
        state.rooms[chatJID].role = role;
      }
    },
    setRoomNoMessages: (
      state,
      action: PayloadAction<{ value: boolean; chatJID?: string }>
    ) => {
      const { value, chatJID } = action.payload;
      if (chatJID) {
        state.rooms[chatJID].noMessages = value;
      }
    },
    setCurrentRoom: (state, action: PayloadAction<{ roomJID: string }>) => {
      const { roomJID } = action.payload;
      if (roomJID) {
        state.activeRoomJID = roomJID;
      }
    },
    setLogoutState: (state) => {
      state.rooms = {};
      state.activeRoomJID = null;
      state.isLoading = false;
    },
  },
});

const countNewerMessages = (
  messages: IMessage[],
  timestamp: number
): number => {
  return messages.filter((message) => {
    return Number(message.id) < timestamp;
  }).length;
};

export const {
  addRoom,
  deleteAllRooms,
  setRoomMessages,
  addRoomMessage,
  deleteRoomMessage,
  setComposing,
  setIsLoading,
  setLastViewedTimestamp,
  setRoomNoMessages,
  setCurrentRoom,
  setRoomRole,
  setLogoutState,
  deleteRoom,
} = roomsStore.actions;

export default roomsStore.reducer;
