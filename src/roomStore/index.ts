import { configureStore, combineReducers, Reducer } from '@reduxjs/toolkit';
import chatSettingsReducer from './chatSettingsSlice';
import roomsSlice from './roomsSlice';
import roomHeapSlice from './roomHeapSlice';
import { IRoom } from '../types/types';
import { unreadMiddleware } from './Middleware/unreadMidlleware';
import storage from 'redux-persist/lib/storage';
import { persistReducer, persistStore } from 'redux-persist';
import { createTransform } from 'redux-persist';
import { AnyAction } from 'redux-saga';
import { newMessageMidlleware } from './Middleware/newMessageMidlleware';
import { logoutMiddleware } from './Middleware/logoutMiddleware';
import { encryptTransform } from 'redux-persist-transform-encrypt';

const limitMessagesTransform = createTransform(
  (inboundState: { [jid: string]: IRoom }) => {
    if (!inboundState || Object.keys(inboundState).length < 1) {
      return inboundState;
    }

    const rooms = { ...inboundState };
    for (const jid in rooms) {
      if (rooms[jid]?.messages?.length > 50) {
        rooms[jid] = {
          ...rooms[jid],
          messages: rooms[jid].messages.slice(-50),
        };
      }
    }
    return { ...rooms };
  },

  (outboundState: { [jid: string]: IRoom }) => outboundState
);

const encryptor = encryptTransform({
  secretKey: 'hey-this-is-dappros',
  onError: (error) => {
    console.error('Encryption error:', error);
  },
});

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
  ],
  transforms: [encryptor],
};

const roomsPersistConfig = {
  key: 'roomMessages',
  storage,
  blacklist: ['editAction', 'activeRoomJID', 'loadingText'],
  transforms: [limitMessagesTransform],
};

const roomHeapSliceConfig = {
  key: 'roomHeapSlice',
  storage,
};

const persistConfig = {
  key: 'root',
  storage,
  whitelist: ['chatSettingStore', 'roomMessages'],
  blacklist: ['routing'],
  transforms: [encryptor],
};

const rootReducer = combineReducers({
  chatSettingStore: persistReducer(
    chatSettingPersistConfig,
    chatSettingsReducer
  ),
  rooms: persistReducer(roomsPersistConfig, roomsSlice),
  roomHeapSlice: persistReducer(roomHeapSliceConfig, roomHeapSlice),
});

export type RootState = ReturnType<typeof rootReducer>;

const persistedReducer: Reducer<RootState, AnyAction> = persistReducer(
  persistConfig,
  rootReducer
) as Reducer<RootState, AnyAction>;

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
      serializableCheck: {
        ignoredActions: [
          'chat/addMessage',
          'persist/PERSIST',
          'persist/REHYDRATE',
        ],
        ignoredPaths: [
          'chat.messages.timestamp',
          'chatSettingStore.client',
          'chatSettingStore.config',
        ],
      },
    })
      .concat(unreadMiddleware)
      .concat(newMessageMidlleware)
      .concat(logoutMiddleware),
});

export type AppDispatch = typeof store.dispatch;

export const persistor = persistStore(store);
