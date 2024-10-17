import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { IMessage, IRoom } from "../types/types";
import { isDateAfter, isDateBefore } from "../helpers/dateComparison";

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

            // Check for lastViewedTimestamp and insert delimiter if needed
            if (
              state.rooms[roomJID].lastViewedTimestamp &&
              !roomMessages.some((msg) => msg.id === "delimiter-new")
            ) {
              const lastViewedTimestamp =
                new Date(state.rooms[roomJID].lastViewedTimestamp) ||
                new Date();

              // If the new message is after the last viewed timestamp

              isDateAfter(
                newMessageDate.toString(),
                lastViewedTimestamp.toString()
              );

              if (
                isDateAfter(
                  newMessageDate.toString(),
                  lastViewedTimestamp.toString()
                )
              ) {
                const delimiterIndex = roomMessages.findIndex((msg) =>
                  isDateAfter(
                    msg.date.toString(),
                    lastViewedTimestamp.toString()
                  )
                );

                // Insert the delimiter before the new messages
                if (delimiterIndex !== -1) {
                  roomMessages.splice(delimiterIndex, 0, {
                    id: "delimiter-new",
                    user: {
                      id: "system",
                      name: null,
                      token: "",
                      refreshToken: "",
                    },
                    date: new Date().toString(),
                    body: "New Messages",
                    roomJID: "",
                  });
                }
              }
            }
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
      if (chatJID) {
        state.isLoading = loading;
        state.rooms[chatJID].isLoading = loading;
      }
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
} = roomsStore.actions;

export default roomsStore.reducer;
