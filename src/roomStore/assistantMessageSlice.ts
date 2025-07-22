import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { AddRoomMessageAction, IMessage, RoomMember } from '../types/types';
import { insertMessageWithDelimiter } from '../helpers/insertMessageWithDelimiter';

interface RoomMessagesState {
  isLoading: boolean;
  loadingText?: string;
  messages: { [roomJID: string]: IMessage[] };
  composing?: { [roomJID: string]: boolean };
}

const initialState: RoomMessagesState = {
  isLoading: false,
  loadingText: undefined,
  messages: {},
  composing: {},
};

export const assistanRoomSlice = createSlice({
  name: 'assistanRoomSlice',
  initialState,
  reducers: {
    setRoomMessages(
      state,
      action: PayloadAction<{ roomJID: string; messages: IMessage[] }>
    ) {
      const { roomJID, messages } = action.payload;
      state.messages[roomJID] = messages;
    },
    deleteRoomMessage(
      state,
      action: PayloadAction<{ roomJID: string; messageId: string }>
    ) {
      const { roomJID, messageId } = action.payload;
      if (state.messages[roomJID]) {
        state.messages[roomJID] = state.messages[roomJID].filter(
          (message) => message.id !== messageId
        );
      }
    },
    addRoomMessage(state, action: PayloadAction<AddRoomMessageAction>) {
      const { roomJID, message, start } = action.payload;
      if (!message?.body) return;
      if (!state.messages[roomJID]) {
        state.messages[roomJID] = [];
      }
      const roomMessages = state.messages[roomJID];
      if (roomMessages.some((msg) => msg.id === message.id)) {
        return;
      }
      if (roomMessages.length === 0 || start) {
        const index = roomMessages.findIndex(
          (msg) => msg.id === message.xmppId
        );
        if (index !== -1) {
          roomMessages[index] = {
            ...message,
            id: message.id,
            pending: false,
          };
        } else {
          roomMessages.unshift(message);
        }
      } else {
        insertMessageWithDelimiter(roomMessages, message);
      }
    },
    setComposing(
      state,
      action: PayloadAction<{
        chatJID: string;
        composing: boolean;
        composingList?: string[];
      }>
    ) {
      const { chatJID, composing } = action.payload;
      if (!state.composing) state.composing = {};
      state.composing[chatJID] = composing;
    },
    setIsLoading: (
      state,
      action: PayloadAction<{
        chatJID?: string;
        loading: boolean;
        loadingText?: string;
      }>
    ) => {
      //   const { chatJID, loading, loadingText } = action.payload;
      //   if (chatJID && state.messages) {
      //     state.messages = loading;
      //   }
      //   if (!chatJID) {
      //     state.isLoading = loading;
      //   }
      //   if (loadingText) {
      //     state.loadingText = loadingText;
      //   }
    },
  },
});

export const {
  setRoomMessages,
  addRoomMessage,
  deleteRoomMessage,
  setComposing,
  setIsLoading,
} = assistanRoomSlice.actions;

export default assistanRoomSlice.reducer;
