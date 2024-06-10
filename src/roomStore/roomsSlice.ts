import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { IMessage, IRoom } from "../types/types";

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
    addRoomMessage(
      state,
      action: PayloadAction<{ roomJID: string; message: IMessage }>
    ) {
      const { roomJID, message } = action.payload;
      if (!state.rooms[roomJID]) {
        state.rooms[roomJID] = {
          jid: roomJID,
          messages: [message],
          title: "", // Default title, replace as needed
          usersCnt: 1, // Default users count, replace as needed
          id: "",
          name: "test",
        };
      } else {
        if (!state.rooms[roomJID].messages) {
          console.log("created mes array for", state.activeRoom);
          state.rooms[roomJID].messages = [];
        }
        state.rooms[roomJID].messages.push(message);
      }
    },
    deleteAllRooms(state) {
      state.rooms = {};
      state.activeRoom = null;
    },
    setActiveRoom(state, action: PayloadAction<{ roomData: IRoom }>) {
      state.activeRoom = action.payload.roomData;
    },
  },
});

export const {
  addRoom,
  deleteAllRooms,
  setRoomMessages,
  addRoomMessage,
  setActiveRoom,
} = roomsStore.actions;

export default roomsStore.reducer;
