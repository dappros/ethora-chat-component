import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { IMessage, IRoom } from "../types/types";
import { isDateAfter, isDateBefore } from "../helpers/dateComparison";

interface RoomMessagesState {
  rooms: { [jid: string]: IRoom };
  activeRoom: IRoom | null;
}

const initialState: RoomMessagesState = {
  rooms: {},
  activeRoom: null,
};

export const roomsStore = createSlice({
  name: "roomMessages",
  initialState,
  reducers: {
    addRoom(state, action: PayloadAction<{ roomData: IRoom }>) {
      const { roomData } = action.payload;
      state.rooms[roomData.jid] = roomData;
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

      if (!state.rooms[roomJID]) {
        console.log("creating");
        state.rooms[roomJID] = {
          jid: roomJID,
          messages: [],
          title: "", // Default title, replace as needed
          usersCnt: 1, // Default users count, replace as needed
          id: "",
          name: "test",
          isLoading: false,
        };
      }

      if (!state.rooms[roomJID].messages) {
        state.rooms[roomJID].messages = [];
      }

      const roomMessages = state.rooms[roomJID].messages;

      const existingMessage = roomMessages.find((msg) => msg.id === message.id);

      if (roomMessages.length === 0 || start) {
        roomMessages.unshift(message);
      } else {
        const lastMessage = roomMessages[roomMessages.length - 1];
        const firstMessage = roomMessages[0];
        const lastMessageDate = lastMessage.date;
        const firstMessageDate = firstMessage.date;
        const newMessageDate = message.date;

        if (!existingMessage) {
          if (
            isDateAfter(newMessageDate.toString(), lastMessageDate.toString())
          ) {
            roomMessages.push(message);
          } else if (
            isDateBefore(newMessageDate.toString(), firstMessageDate.toString())
          ) {
            roomMessages.unshift(message);
          } else {
            for (let i = 0; i < roomMessages.length; i++) {
              if (
                isDateBefore(
                  newMessageDate.toString(),
                  roomMessages[i].date.toString()
                )
              ) {
                roomMessages.splice(i, 0, message);
                break;
              }
            }
          }
        }
      }
    },

    deleteAllRooms(state) {
      state.rooms = {};
      state.activeRoom = null;
    },
    setActiveRoom(state, action: PayloadAction<{ roomData: IRoom }>) {
      state.activeRoom = action.payload.roomData;
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
      action: PayloadAction<{ chatJID: string; loading: boolean }>
    ) => {
      const { chatJID, loading } = action.payload;
      state.rooms[chatJID].isLoading = loading;
    },
  },
});

export const {
  addRoom,
  deleteAllRooms,
  setRoomMessages,
  addRoomMessage,
  deleteRoomMessage,
  setActiveRoom,
  setComposing,
  setIsLoading,
} = roomsStore.actions;

export default roomsStore.reducer;
