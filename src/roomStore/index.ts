import {
  configureStore,
  combineReducers,
  Reducer,
  AnyAction,
} from '@reduxjs/toolkit';
import chatSettingsReducer from './chatSettingsSlice';
import roomsSlice from './roomsSlice';
import roomHeapSlice from './roomHeapSlice';
import { IMessage, IRoom } from '../types/types';
import { unreadMiddleware } from './Middleware/unreadMidlleware';
import { storage } from './storage';
import { persistReducer, persistStore } from 'redux-persist';
import { createTransform } from 'redux-persist';
import { newMessageMidlleware } from './Middleware/newMessageMidlleware';
import { logoutMiddleware } from './Middleware/logoutMiddleware';
import { encryptTransform } from 'redux-persist-transform-encrypt';
import { reactionsMiddleware } from './Middleware/reactionsMiddleware';
import { ETHORA_CHAT_COMPONENT_VERSION } from '../version';
import { sanitizeUserForPersistentStorage } from '../helpers/authStorage';
import { ethoraLogger } from '../helpers/ethoraLogger';

const debugMiddleware = (storeAPI) => (next) => (action) => {
  if (typeof action !== 'object' || action === null) {
    console.error('Non-plain object action detected:', action);
    console.error('Action type:', typeof action);
    console.error('Action constructor:', action?.constructor?.name);
    console.error('Stack trace:', new Error().stack);
    throw new Error(
      'Actions must be plain objects. Received: ' + typeof action
    );
  }

  if (!action.type) {
    console.error('Action missing type property:', action);
    console.error('Stack trace:', new Error().stack);
    throw new Error('Actions must have a type property');
  }

  if (
    (action.type && action.type.endsWith('/pending')) ||
    (action.type && action.type.endsWith('/fulfilled')) ||
    (action.type && action.type.endsWith('/rejected'))
  ) {
    if (!action.payload && !action.meta && !action.error) {
      console.warn('Thunk action missing expected properties:', action);
    }
  }

  return next(action);
};

const normalizeMessageList = (messages: unknown): IMessage[] =>
  Array.isArray(messages)
    ? messages.filter(
        (message): message is IMessage =>
          Boolean(message) && typeof message === 'object'
      )
    : [];

const normalizeRoomsState = (state: Record<string, any>) => {
  if (!state || typeof state !== 'object') {
    return state;
  }

  const roomsState =
    state.rooms && typeof state.rooms === 'object' ? state.rooms : {};

  const normalizedRooms = Object.fromEntries(
    Object.entries(roomsState).filter(([, room]) => room && typeof room === 'object').map(
      ([jid, room]: [string, IRoom]) => [
        jid,
        {
          ...room,
          messages: normalizeMessageList(room?.messages),
          composingList: Array.isArray((room as any)?.composingList)
            ? (room as any).composingList.filter(
                (item: unknown): item is string => typeof item === 'string'
              )
            : [],
        },
      ]
    )
  );

  return {
    ...state,
    rooms: normalizedRooms,
    activeRoomJID:
      typeof state.activeRoomJID === "string" ? state.activeRoomJID : null,
    usersSet:
      state.usersSet && typeof state.usersSet === 'object' ? state.usersSet : {},
    subscribedRooms: Array.isArray(state.subscribedRooms)
      ? state.subscribedRooms.filter(
          (room: unknown): room is string => typeof room === 'string'
        )
      : [],
    pushSubscriptionStatus:
      state.pushSubscriptionStatus && typeof state.pushSubscriptionStatus === 'object'
        ? state.pushSubscriptionStatus
        : {},
  };
};

const limitMessagesTransform = createTransform(
  (inboundState: Record<string, any>) => {
    const normalizedState = normalizeRoomsState(inboundState);
    if (!normalizedState || typeof normalizedState !== 'object') {
      return normalizedState;
    }

    const limitedRooms = Object.fromEntries(
      Object.entries(normalizedState.rooms).map(([jid, room]: [string, IRoom]) => [
        jid,
        room?.messages?.length > 50
          ? {
              ...room,
              messages: room.messages.slice(-50),
            }
          : room,
      ])
    );

    return {
      ...normalizedState,
      rooms: limitedRooms,
    };
  },

  (outboundState: Record<string, any>) => normalizeRoomsState(outboundState)
);

const encryptor = encryptTransform({
  secretKey: 'hey-this-is-dappros',
  onError: (error) => {
    console.error('Encryption error:', error);
  },
});

const scrubSensitiveChatStateTransform = createTransform(
  (inboundState: Record<string, any>) => {
    if (!inboundState?.user) {
      return inboundState;
    }

    return {
      ...inboundState,
      user:
        sanitizeUserForPersistentStorage(inboundState.user) ?? inboundState.user,
    };
  },
  (outboundState: Record<string, any>) => outboundState
);

const sanitizeRoomsStateTransform = createTransform(
  (inboundState: Record<string, any>) => normalizeRoomsState(inboundState),
  (outboundState: Record<string, any>) => normalizeRoomsState(outboundState)
);

const chatSettingPersistConfig = {
  key: 'chatSettingStore',
  storage,
  blacklist: [
    'activeModal',
    'deleteModal',
    'selectedUser',
    'activeFile',
    'config.refreshTokens',
    'refreshTokens',
    'client',
    'config',
  ],
  transforms: [scrubSensitiveChatStateTransform, encryptor],
};

const roomsPersistConfig = {
  key: 'roomMessages',
  storage,
  blacklist: ['editAction', 'activeRoomJID', 'loadingText'],
  transforms: [sanitizeRoomsStateTransform, limitMessagesTransform, encryptor],
};

const rootReducer = combineReducers({
  chatSettingStore: persistReducer(
    chatSettingPersistConfig,
    chatSettingsReducer
  ),
  rooms: persistReducer(roomsPersistConfig, roomsSlice),
  roomHeapSlice,
});

export type RootState = ReturnType<typeof rootReducer>;

// Keep persistence scoped to the slices that actually need it. Persisting the
// already-persisted root state again can rehydrate malformed nested data and
// breaks the encrypt transform because it receives objects instead of strings.
const persistedReducer: Reducer<RootState, AnyAction> =
  rootReducer as Reducer<RootState, AnyAction>;

export const getActiveRoom = (state: RootState): IRoom | null => {
  const roomMessagesState = state.rooms;
  return roomMessagesState.activeRoomJID
    ? roomMessagesState.rooms[roomMessagesState.activeRoomJID]
    : null;
};

export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      thunk: true,
      immutableCheck: { warnAfter: 128 },
      serializableCheck: {
        warnAfter: 128,
        ignoredActions: [
          'chat/addMessage',
          'persist/PERSIST',
          'persist/REHYDRATE',
          'persist/FLUSH',
          'persist/PAUSE',
          'persist/PURGE',
          'persist/REGISTER',
          'roomMessages/addRoomViaApi/pending',
          'roomMessages/addRoomViaApi/fulfilled',
          'roomMessages/addRoomViaApi/rejected',
          // setConfig payload contains non-serializable callback functions (eventHandlers)
          'chatSettingStore/setConfig',
        ],
        ignoredPaths: [
          'chat.messages.timestamp',
          'chatSettingStore.client',
          'chatSettingStore.config',
        ],
        ignoredActionPaths: ['result', 'register'],
      },
    })
      .concat(unreadMiddleware)
      .concat(newMessageMidlleware)
      .concat(logoutMiddleware)
      .concat(reactionsMiddleware),
  // .concat(testMiddleware)
  // .concat(debugMiddleware)
  // .concat(actionLoggerMiddleware),
});

export type AppDispatch = typeof store.dispatch;

export const persistor = persistStore(store);

try {
  ethoraLogger.always('[EthoraChatComponent] version:', ETHORA_CHAT_COMPONENT_VERSION);
} catch (e) {
  // Ignore console access issues in restricted runtimes.
}
