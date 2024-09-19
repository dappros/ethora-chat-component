import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { IMessage } from "../types/types";

interface ChatState {
  messages: IMessage[];
  isLoading: boolean;
}

const initialState: ChatState = {
  messages: [],
  isLoading: false,
};

// Utility function to add unique messages
const addUniqueMessages = (
  existingMessages: IMessage[],
  newMessages: IMessage[]
) => {
  const existingMessageIds = new Set(existingMessages.map((msg) => msg.id));
  const uniqueNewMessages = newMessages.filter(
    (msg) => !existingMessageIds.has(msg.id)
  );
  return [...existingMessages, ...uniqueNewMessages];
};

export const chatSlice = createSlice({
  name: "chat",
  initialState,
  reducers: {
    addMessage: (state, action: PayloadAction<IMessage>) => {
      state.messages = addUniqueMessages(state.messages, [action.payload]);
    },
    addMessages: (state, action: PayloadAction<IMessage[]>) => {
      state.messages = addUniqueMessages(state.messages, action.payload);
    },
    setMessages: (state, action: PayloadAction<IMessage[]>) => {
      state.messages = action.payload;
    },
    resetMessages: (state) => {
      state.messages = [];
    },
    setIsLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
  },
});

export const {
  addMessage,
  setMessages,
  addMessages,
  resetMessages,
  setIsLoading,
} = chatSlice.actions;

export default chatSlice.reducer;
