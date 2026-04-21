import { createSlice, PayloadAction, createAsyncThunk } from '@reduxjs/toolkit';
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
  subscribedRooms: string[];
  pushSubscriptionStatus: Record<string, 'pending' | 'subscribed' | 'error' | 'blocked'>;
  loadingText?: string;
}

interface PreloadRoomUpdate {
  jid: string;
  messages?: IMessage[];
  unreadCapped?: boolean;
  historyPreloadState?: 'idle' | 'loading' | 'done' | 'error';
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
  subscribedRooms: [],
  pushSubscriptionStatus: {},
  loadingText: undefined,
};

const getNormalizedSubscribedRooms = (subscribedRooms: unknown): string[] =>
  Array.isArray(subscribedRooms)
    ? subscribedRooms.filter((room): room is string => typeof room === 'string')
    : [];

const getMessageTimestampValue = (message: IMessage): number => {
  const dateTs = new Date(message?.date as string).getTime();
  if (Number.isFinite(dateTs) && dateTs > 0) return dateTs;

  const numericId = Number(message?.id);
  if (Number.isFinite(numericId) && numericId > 0) return numericId;

  const inlineTimestamp = Number((message as any)?.timestamp);
  if (Number.isFinite(inlineTimestamp) && inlineTimestamp > 0) {
    return inlineTimestamp;
  }
  return 0;
};

const getMessageKey = (message: IMessage): string =>
  String(message?.xmppId || message?.id || '');

const compareMessageOrder = (a: IMessage, b: IMessage): number => {
  const tsA = getMessageTimestampValue(a);
  const tsB = getMessageTimestampValue(b);
  if (tsA !== tsB) {
    return tsA - tsB;
  }

  const idA = String(a?.id || a?.xmppId || '');
  const idB = String(b?.id || b?.xmppId || '');
  const numA = Number(idA);
  const numB = Number(idB);

  if (Number.isFinite(numA) && Number.isFinite(numB) && numA !== numB) {
    return numA - numB;
  }

  if (idA !== idB) {
    return idA.localeCompare(idB);
  }

  return 0;
};

const enrichMessageAuthor = (
  message: IMessage,
  usersSet: Record<string, RoomMember>
): IMessage => {
  const rawUserId = String(message?.user?.id || '');
  const localUserId = rawUserId.split('@')[0];
  const currentName = String(message?.user?.name || '').trim();

  // Identity carried in the message <data> stanza by the sending client (regular users
  // and now AI Agent bots). Spread by createMessageFromXml onto the top-level message
  // object, so available here as message.fullName / senderFirstName / senderLastName.
  // Honor that BEFORE falling through to createUserNameFromSetUser, which returns the
  // literal "Deleted User" string when usersSet has no entry for the sender. Without
  // this the chat shows "Deleted User" for any sender (e.g. fresh bot, batch broadcast)
  // not yet in the locally cached usersSet.
  const dataFullName = String((message as any)?.fullName || '').trim();
  const dataFirst = String((message as any)?.senderFirstName || '').trim();
  const dataLast = String((message as any)?.senderLastName || '').trim();
  const composedFromData =
    dataFullName ||
    `${dataFirst} ${dataLast}`.trim() ||
    '';

  const usersSetName = createUserNameFromSetUser(usersSet, localUserId);
  const usersSetNameAlt = createUserNameFromSetUser(usersSet, rawUserId);
  const isUsersSetUseful = (n: string) => n && n !== 'Deleted User';

  const resolvedName =
    currentName ||
    (isUsersSetUseful(usersSetName) && usersSetName) ||
    (isUsersSetUseful(usersSetNameAlt) && usersSetNameAlt) ||
    composedFromData ||
    localUserId ||
    rawUserId;

  return {
    ...message,
    user: {
      ...message.user,
      name: resolvedName,
    },
  };
};

const mergeRoomMessages = (
  existing: IMessage[],
  incoming: IMessage[],
  usersSet: Record<string, RoomMember>
): IMessage[] => {
  if (!incoming?.length) return existing || [];
  if (!existing?.length) {
    return incoming.map((message) => enrichMessageAuthor(message, usersSet));
  }

  const byId = new Map<string, IMessage>();
  [...existing, ...incoming].forEach((message) => {
    const key = getMessageKey(message);
    if (!key) return;
    byId.set(key, enrichMessageAuthor(message, usersSet));
  });

  return [...byId.values()].sort(compareMessageOrder);
};

const normalizeDelimiterPosition = (
  messages: IMessage[],
  lastViewedTimestamp?: number
): IMessage[] => {
  const list = (messages || []).filter((msg) => msg?.id !== 'delimiter-new');
  const lastViewed = Number(lastViewedTimestamp || 0);

  if (lastViewed <= 0 || list.length === 0) {
    return list;
  }

  const firstUnreadIndex = list.findIndex((msg) => {
    if (!msg || msg.pending) return false;
    const ts = getMessageTimestampValue(msg);
    return ts > lastViewed;
  });

  if (firstUnreadIndex === -1) {
    return list;
  }

  const delimiter: IMessage = {
    id: 'delimiter-new',
    body: 'New Messages',
    date: new Date(lastViewed).toISOString(),
    roomJid: list[firstUnreadIndex]?.roomJid || '',
    user: {
      id: 'system',
      name: 'system',
      token: '',
      refreshToken: '',
    },
  } as IMessage;

  list.splice(firstUnreadIndex, 0, delimiter);
  return list;
};

export const addRoomViaApi = createAsyncThunk(
  'roomMessages/addRoomViaApi',
  async (
    { room, xmpp: _xmpp }: { room: IRoom; xmpp: XmppClient },
    { dispatch, getState }
  ) => {
    const state = getState() as { rooms: RoomMessagesState };
    const isRoomAlreadyAdded = Object.values(state.rooms.rooms).some(
      (element) => element.jid === room?.jid
    );

    if (!isRoomAlreadyAdded) {
      // Room bootstrap is handled by dedicated initialization flows.
      // Avoid per-room blocking network calls during initial room list sync.
      dispatch(roomsStore.actions.addRoomFromApi({ room }));
    }
  }
);

export const roomsStore = createSlice({
  name: 'roomMessages',
  initialState,
  reducers: {
    addRoom(state, action: PayloadAction<{ roomData: IRoom }>) {
      const { roomData } = action.payload;
      state.rooms[roomData.jid] = {
        ...roomData,
        unreadCapped: roomData.unreadCapped ?? false,
        historyPreloadState: roomData.historyPreloadState ?? 'idle',
      };
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
        const merged = mergeRoomMessages(
          state.rooms[roomJID].messages || [],
          messages || [],
          state.usersSet
        );
        state.rooms[roomJID].messages = normalizeDelimiterPosition(
          merged,
          state.rooms[roomJID].lastViewedTimestamp
        );
      }
    },
    replaceRoomMessages(
      state,
      action: PayloadAction<{ roomJID: string; messages: IMessage[] }>
    ) {
      const { roomJID, messages } = action.payload;
      if (state.rooms[roomJID]) {
        const enriched = (messages || []).map((message) =>
          enrichMessageAuthor(message, state.usersSet)
        );
        const sorted = [...enriched].sort(compareMessageOrder);
        state.rooms[roomJID].messages = normalizeDelimiterPosition(
          sorted,
          state.rooms[roomJID].lastViewedTimestamp
        );
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
              if (reactions.length === 0) {
                delete message.reaction[fromId];
              } else {
                message.reaction[fromId] = {
                  emoji: reactions,
                  data: data,
                };
              }
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

      const roomsExist =
        Object.keys(JSON.parse(JSON.stringify(state.rooms))).length > 0;

      const roomExist = !!state?.rooms[roomJID];
      if (!roomsExist || !roomExist) {
        return;
      }

      if (!roomMessages) {
        state.rooms[roomJID].messages = [];
      }

      const existingIndex = roomMessages.findIndex(
        (msg) =>
          msg.id === message.id ||
          (message.xmppId && msg.id === message.xmppId) ||
          (msg.xmppId && msg.xmppId === message.id)
      );
      if (existingIndex !== -1) {
        roomMessages[existingIndex] = deepMerge(
          { ...roomMessages[existingIndex] },
          { ...message, pending: false }
        );
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
          (msg) => msg.id === message.xmppId || msg.id === message.id
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

      state.rooms[roomJID].messages = normalizeDelimiterPosition(
        state.rooms[roomJID].messages,
        state.rooms[roomJID].lastViewedTimestamp
      );
    },
    deleteAllRooms(state) {
      state.rooms = {};
    },
    insertUsers(state, action: PayloadAction<{ newUsers: RoomMember[] }>) {
      const { newUsers } = action.payload;
      if (!newUsers || newUsers.length === 0) return;

      newUsers.forEach((user) => {
        state.usersSet[user.xmppUsername] = user;
      });

      const updatedUsernames = new Set(newUsers.map((u) => u.xmppUsername));
      Object.values(state.rooms).forEach((room) => {
        room.messages.forEach((message) => {
          const msgUserLocal = message.user?.id?.split('@')[0] ?? '';
          if (updatedUsernames.has(msgUserLocal) || updatedUsernames.has(message.user?.id)) {
            const matched =
              state.usersSet[msgUserLocal] ||
              state.usersSet[message.user?.id];
            if (matched) {
              message.user = {
                ...message.user,
                name: createUserNameFromSetUser(state.usersSet, msgUserLocal) ||
                      createUserNameFromSetUser(state.usersSet, message.user?.id),
              };
            }
          }
        });
      });
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
      if (!state.rooms[chatJID]) {
        return;
      }
      state.rooms[chatJID].composing = composing;
      state.rooms[chatJID].composingList = composingList;
    },
    setIsLoading: (
      state,
      action: PayloadAction<{
        chatJID?: string;
        loading: boolean;
        loadingText?: string;
      }>
    ) => {
      const { chatJID, loading, loadingText } = action.payload;
      if (chatJID && state.rooms?.[chatJID]) {
        state.rooms[chatJID].isLoading = loading;
      }
      if (!chatJID) {
        state.isLoading = loading;
      }
      if (loadingText) {
        state.loadingText = loadingText;
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
        state.rooms[chatJID].messages = normalizeDelimiterPosition(
          state.rooms[chatJID].messages,
          timestamp
        );
        state.rooms[chatJID].unreadCapped = false;
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
      state.usersSet = {};
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
    addRoomFromApi: (state, action: PayloadAction<{ room: IRoom }>) => {
      const { room } = action.payload;
      state.rooms[room.jid] = {
        ...room,
        unreadCapped: room.unreadCapped ?? false,
        historyPreloadState: room.historyPreloadState ?? 'idle',
      };
    },
    applyRoomsPreloadBatch: (
      state,
      action: PayloadAction<{ rooms: PreloadRoomUpdate[] }>
    ) => {
      const { rooms } = action.payload;
      if (!rooms?.length) return;

      rooms.forEach((update) => {
        const room = state.rooms[update.jid];
        if (!room) return;

        if (typeof update.historyPreloadState !== 'undefined') {
          room.historyPreloadState = update.historyPreloadState;
        }

        if (typeof update.unreadCapped !== 'undefined') {
          room.unreadCapped = update.unreadCapped;
        }

        if (update.messages) {
          const merged = mergeRoomMessages(
            room.messages || [],
            update.messages,
            state.usersSet
          );
          room.messages = normalizeDelimiterPosition(
            merged,
            room.lastViewedTimestamp
          );
        }
      });
    },
    updateUsersSet: (state, action: PayloadAction<{ rooms: ApiRoom[] }>) => {
      const { rooms } = action.payload;
      state.usersSet = extractUniqueMembersFromRooms(rooms).object;
    },
    setOpenReportModal: (state, action: PayloadAction<{ isOpen: boolean }>) => {
      if (!state.reportRoom) {
        state.reportRoom = { isOpen: false };
      }
      state.reportRoom.isOpen = action.payload.isOpen;
    },
    setPushSubscriptionStatus: (
      state,
      action: PayloadAction<{ jid: string; status: 'pending' | 'subscribed' | 'error' | 'blocked' }>
    ) => {
      const { jid, status } = action.payload;
      const subscribedRooms = getNormalizedSubscribedRooms(state.subscribedRooms);

      if (subscribedRooms !== state.subscribedRooms) {
        state.subscribedRooms = subscribedRooms;
      }

      state.pushSubscriptionStatus[jid] = status;
      if (status === 'subscribed') {
        if (!subscribedRooms.includes(jid)) {
          subscribedRooms.push(jid);
        }
      } else if (status === 'blocked' || status === 'error') {
        state.subscribedRooms = subscribedRooms.filter((id) => id !== jid);
      }
    },
    clearPushSubscriptions: (state) => {
      state.subscribedRooms = [];
      state.pushSubscriptionStatus = {};
    },
  },
});

function deepMerge(target: any, source: any): any {
  for (const key in source) {
    if (
      source[key] &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key])
    ) {
      target[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

const countNewerMessages = (
  messages: IMessage[],
  timestamp: number
): number => {
  if (timestamp <= 0) return 0;
  const getMessageTimestamp = (message: IMessage): number => {
    const dateTs = new Date(message?.date as string).getTime();
    if (Number.isFinite(dateTs) && dateTs > 0) return dateTs;

    const numericId = Number(message?.id);
    if (Number.isFinite(numericId) && numericId > 0) return numericId;

    const inlineTimestamp = Number((message as any)?.timestamp);
    if (Number.isFinite(inlineTimestamp) && inlineTimestamp > 0) {
      return inlineTimestamp;
    }
    return 0;
  };

  return messages.filter((message) => {
    if (!message || message.id === 'delimiter-new' || message.pending) return false;
    const ts = getMessageTimestamp(message);
    return ts > timestamp;
  }).length;
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
  replaceRoomMessages,
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
  updateUsersSet,
  setOpenReportModal,
  insertUsers,
  setPushSubscriptionStatus,
  clearPushSubscriptions,
  applyRoomsPreloadBatch,
} = roomsStore.actions;

export default roomsStore.reducer;
