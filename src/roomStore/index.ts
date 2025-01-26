import { configureStore, combineReducers, Reducer } from '@reduxjs/toolkit';
import chatSettingsReducer from './chatSettingsSlice';
import roomsSlice from './roomsSlice';
import { IRoom } from '../types/types';
import { unreadMiddleware } from './Middleware/unreadMidlleware';
import storage from 'redux-persist/lib/storage';
import { persistReducer, persistStore } from 'redux-persist';
import { encryptTransform } from 'redux-persist-transform-encrypt';
import { AnyAction } from 'redux-saga';

const encryptor = encryptTransform({
  secretKey: 'hey-this-is-rtesad',
  onError: (error) => {
    console.error('Encryption error:', error);
  },
});

const chatSettingPersistConfig = {
  key: 'chatSettingStore',
  storage,
  blacklist: [
    'client',
    'activeModal',
    'deleteModal',
    'selectedUser',
    'activeFile',
  ],
  transforms: [encryptor],
};

const roomsPersistConfig = {
  key: 'roomMessages',
  storage,
  blacklist: ['editAction'],
  transforms: [encryptor],
};

const persistConfig = {
  key: 'root',
  storage,
  whitelist: ['chatSettingStore', 'roomMessages'],
  transforms: [encryptor],
};

const rootReducer = combineReducers({
  chatSettingStore: persistReducer(
    chatSettingPersistConfig,
    chatSettingsReducer
  ),
  rooms: persistReducer(roomsPersistConfig, roomsSlice),
});

const persistedReducer: Reducer<RootState, AnyAction> = persistReducer(
  persistConfig,
  rootReducer
);

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
          'chatSettingStore/setStoreClient',
          'persist/PERSIST',
          'persist/REHYDRATE',
        ],
        ignoredPaths: ['chat.messages.timestamp', 'chatSettingStore.client'],
        serializableCheck: true,
      },
    }).concat(unreadMiddleware),
});

export const persistor = persistStore(store);

export type RootState = {
  chatSettingStore: ReturnType<typeof chatSettingsReducer>;
  rooms: ReturnType<typeof roomsSlice>;
};

export type AppDispatch = typeof store.dispatch;

// import { configureStore, combineReducers } from '@reduxjs/toolkit';
// import chatSettingsReducer from './chatSettingsSlice';
// import roomsSlice from './roomsSlice';
// import { IRoom } from '../types/types';
// import { unreadMiddleware } from './Middleware/unreadMidlleware';

// const rootReducer = combineReducers({
//   chatSettingStore: chatSettingsReducer,
//   rooms: roomsSlice,
// });

// export const getActiveRoom = (state: RootState): IRoom | null => {
//   const roomMessagesState = state.rooms;
//   return roomMessagesState.activeRoomJID
//     ? roomMessagesState.rooms[roomMessagesState.activeRoomJID]
//     : null;
// };

// export const store = configureStore({
//   reducer: rootReducer,
//   middleware: (getDefaultMiddleware) =>
//     getDefaultMiddleware({
//       serializableCheck: {
//         ignoredActions: ['chat/addMessage', 'chatSettingStore/setStoreClient'],
//         ignoredPaths: ['chat.messages.timestamp', 'chatSettingStore.client'],
//         serializableCheck: false,
//       },
//     }).concat(unreadMiddleware),
// });

// export type RootState = ReturnType<typeof rootReducer>;
// export type AppDispatch = typeof store.dispatch;
