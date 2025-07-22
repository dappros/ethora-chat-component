import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { AddRoomMessageAction, IMessage } from '../types/types';
import { insertMessageWithDelimiter } from '../helpers/insertMessageWithDelimiter';
import { ETHO_ASSISTANT_MESSAGES } from '../helpers/constants/ASSISTANT_LOCAL_STORAGE';

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

const saveMessagesToLocalStorage = (messages: {
  [roomJID: string]: IMessage[];
}) => {
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const filteredMessages: { [roomJID: string]: IMessage[] } = {};

  for (const roomJID in messages) {
    if (messages.hasOwnProperty(roomJID)) {
      filteredMessages[roomJID] = messages[roomJID].filter(
        (message) => (message.timestamp || 0) > thirtyDaysAgo
      );
    }
  }

  window.localStorage.setItem(
    ETHO_ASSISTANT_MESSAGES,
    JSON.stringify(filteredMessages)
  );
};

export const assistanRoomSlice = createSlice({
  name: 'assistanRoomSlice',
  initialState,
  reducers: {
    initRoomMessages(state) {
      const savedMessages = window.localStorage.getItem(
        ETHO_ASSISTANT_MESSAGES
      );
      if (savedMessages) {
        state.messages = JSON.parse(savedMessages);
      }
    },
    setRoomMessages(
      state,
      action: PayloadAction<{ roomJID: string; messages: IMessage[] }>
    ) {
      const { roomJID, messages } = action.payload;
      state.messages[roomJID] = messages;
      saveMessagesToLocalStorage(state.messages);
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
        saveMessagesToLocalStorage(state.messages);
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

      const messageWithTimestamp = { ...message, timestamp: Date.now() };

      if (roomMessages.length === 0 || start) {
        const index = roomMessages.findIndex(
          (msg) => msg.id === message.xmppId
        );
        if (index !== -1) {
          roomMessages[index] = {
            ...messageWithTimestamp,
            id: message.id,
            pending: false,
          };
        } else {
          roomMessages.unshift(messageWithTimestamp);
        }
      } else {
        insertMessageWithDelimiter(roomMessages, messageWithTimestamp);
      }
      saveMessagesToLocalStorage(state.messages);
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
  initRoomMessages,
  setRoomMessages,
  addRoomMessage,
  deleteRoomMessage,
  setComposing,
  setIsLoading,
} = assistanRoomSlice.actions;

export default assistanRoomSlice.reducer;
