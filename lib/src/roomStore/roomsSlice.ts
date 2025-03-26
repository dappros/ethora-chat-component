import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import {
  AddRoomMessageAction,
  ApiRoom,
  EditAction,
  IMessage,
  IRoom,
  ReactionAction,
  RoomMember,
} from '../types/types';
import { insertMessageWithDelimiter } from '../helpers/insertMessageWithDelimiter';
import XmppClient from '../networking/xmppClient';
import { createUserNameFromSetUser } from '../helpers/createUserNameFromSetUser';
import { extractUniqueMembersFromRooms } from '../helpers/extractUniqueMembersFromRooms';

interface RoomMessagesState {
  rooms: { [jid: string]: IRoom };
  activeRoomJID: string;
  editAction?: EditAction;
  isLoading: boolean;
  usersSet: Record<string, RoomMember>;
  reportRoom: {
    isOpen: boolean;
  };
}

const initialState: RoomMessagesState = {
  rooms: {},
  activeRoomJID: null,
  isLoading: false,
  editAction: {
    isEdit: false,
    roomJid: '',
    messageId: '',
    text: '',
  },
  usersSet: {},
  reportRoom: {
    isOpen: false,
  },
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
    updateRoom(
      state,
      action: PayloadAction<{ jid: string; updates: Partial<IRoom> }>
    ) {
      const { jid, updates } = action.payload;
      const existingRoom = state.rooms[jid];

      if (existingRoom) {
        state.rooms[jid] = {
          ...existingRoom,
          ...updates,
        };
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
        state.rooms[roomJID].messages = state.rooms[roomJID].messages.filter(
          (message) => message.id !== messageId
        );
      }
    },
    setReactions: (
      state,
      action: PayloadAction<ReactionAction | undefined>
    ) => {
      const { roomJID, messageId, reactions, from, data } = action.payload;

      if (state.rooms[roomJID]) {
        state.rooms[roomJID].messages.map((message) => {
          if (message.id === messageId) {
            if (from) {
              if (!message.reaction) {
                message.reaction = {};
              }

              const fromId = from.split('@')[0];
              message.reaction[fromId] = {
                emoji: reactions,
                data: data,
              };
            }
          }
        });
      }
    },
    setEditAction: (state, action: PayloadAction<EditAction | undefined>) => {
      const { isEdit } = action.payload;
      if (isEdit) {
        state.editAction = action.payload;
      } else {
        state.editAction = {
          isEdit: false,
          roomJid: '',
          messageId: '',
          text: '',
        };
      }
    },
    editRoomMessage(
      state,
      action: PayloadAction<{
        roomJID: string;
        messageId: string;
        text: string;
      }>
    ) {
      const { roomJID, messageId, text } = action.payload;
      if (state.rooms[roomJID]) {
        state.rooms[roomJID].messages.map((message) => {
          if (message.id === messageId) {
            message.body = text;
          }
        });
      }
    },
    addRoomMessage(state, action: PayloadAction<AddRoomMessageAction>) {
      const { roomJID, message, start } = action.payload;

      if (!message?.body) return;

      const roomMessages = state.rooms[roomJID]?.messages;

      if (!roomMessages) {
        state.rooms[roomJID].messages = [];
      }

      if (roomMessages.some((msg) => msg.id === message.id)) {
        return;
      }

      const updMessage = {
        ...message,
        user: {
          name: createUserNameFromSetUser(state.usersSet, message.user.id),
          ...message.user,
        },
      };

      if (roomMessages.length === 0 || start) {
        const index = roomMessages.findIndex(
          (msg) => msg.id === message.xmppId
        );
        if (index !== -1) {
          roomMessages[index] = {
            ...updMessage,
            id: updMessage.id,
            pending: false,
          };
        } else {
          roomMessages.unshift(updMessage);
        }
      } else {
        const lastViewedTimestamp = state.rooms[roomJID].lastViewedTimestamp
          ? new Date(state.rooms[roomJID].lastViewedTimestamp)
          : null;

        insertMessageWithDelimiter(
          roomMessages,
          updMessage,
          lastViewedTimestamp
        );
      }
    },
    deleteAllRooms(state) {
      state.rooms = {};
    },
    setComposing(
      state,
      action: PayloadAction<{
        chatJID: string;
        composing: boolean;
        composingList?: string[];
      }>
    ) {
      const { chatJID, composing, composingList } = action.payload;
      state.rooms[chatJID].composing = composing;
      state.rooms[chatJID].composingList = composingList;
    },
    setIsLoading: (
      state,
      action: PayloadAction<{ chatJID?: string; loading: boolean }>
    ) => {
      const { chatJID, loading } = action.payload;
      if (chatJID && state.rooms?.[chatJID]) {
        state.rooms[chatJID].isLoading = loading;
      }
      if (!chatJID) {
        state.isLoading = loading;
      }
    },
    setLastViewedTimestamp: (
      state,
      action: PayloadAction<{ chatJID: string; timestamp: number }>
    ) => {
      const { chatJID, timestamp } = action.payload;
      if (state.rooms[chatJID]) {
        state.rooms[chatJID].lastViewedTimestamp = timestamp;
        if (timestamp) {
          state.rooms[chatJID].unreadMessages = countNewerMessages(
            state.rooms[chatJID].messages,
            timestamp
          );
        }
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
    setCurrentRoom: (
      state,
      action: PayloadAction<{ roomJID: string | null }>
    ) => {
      const { roomJID } = action.payload;
      state.activeRoomJID = roomJID;
    },
    setLogoutState: (state) => {
      state.rooms = {};
      state.activeRoomJID = null;
      state.isLoading = false;
    },
    setActiveMessage: (
      state,
      action: PayloadAction<{ id: string; chatJID: string }>
    ) => {
      const { id, chatJID } = action.payload;

      state.rooms[chatJID].messages.map((message) => {
        if (message.id === id) {
          message.activeMessage = true;
        } else {
          message.activeMessage = false;
        }
      });
    },
    setCloseActiveMessage: (
      state,
      action: PayloadAction<{ chatJID: string }>
    ) => {
      const { chatJID } = action.payload;

      state.rooms[chatJID].messages.map((message) => {
        message.activeMessage = false;
      });
    },
    addRoomViaApi: (
      state,
      action: PayloadAction<{ room: IRoom; xmpp: XmppClient }>
    ) => {
      const { room, xmpp } = action.payload;

      const isRoomAlreadyAdded = Object.values(state.rooms).some(
        (element) => element.jid === room?.jid
      );

      if (!isRoomAlreadyAdded) {
        state.rooms[room.jid] = room;
        if (!state.rooms.activeRoomJID) {
          state.activeRoomJID = room.jid;
        }
        if (room.jid) {
          xmpp.presenceInRoomStanza(room.jid);
        }
      }
    },
    updateUsersSet: (state, action: PayloadAction<{ rooms: ApiRoom[] }>) => {
      const { rooms } = action.payload;
      state.usersSet = extractUniqueMembersFromRooms(rooms).object;
    },
    setOpenReportModal: (state, action: PayloadAction<{ isOpen: boolean }>) => {
      state.reportRoom.isOpen = action.payload.isOpen;
    },
  },
});

const countNewerMessages = (
  messages: IMessage[],
  timestamp: number
): number => {
  if (timestamp !== 0) {
    return messages.filter((message) => {
      return Number(message.id) < timestamp;
    }).length;
  } else return 0;
};

export const getLastMessageTimestamp = (
  state: RoomMessagesState,
  jid: string
): string | null => {
  const room = state.rooms[jid];
  if (!room || room.messages.length === 0) {
    return null;
  }
  const lastMessage = room.messages[room.messages.length - 1];
  return lastMessage.id;
};

export const {
  addRoom,
  deleteAllRooms,
  setRoomMessages,
  addRoomMessage,
  deleteRoomMessage,
  setEditAction,
  editRoomMessage,
  setComposing,
  setIsLoading,
  setLastViewedTimestamp,
  setRoomNoMessages,
  setCurrentRoom,
  setRoomRole,
  setReactions,
  setLogoutState,
  setActiveMessage,
  setCloseActiveMessage,
  deleteRoom,
  updateRoom,
  addRoomViaApi,
  updateUsersSet,
  setOpenReportModal,
} = roomsStore.actions;

export default roomsStore.reducer;
