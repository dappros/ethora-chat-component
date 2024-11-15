import { configureStore, combineReducers } from '@reduxjs/toolkit';
import createSagaMiddleware from 'redux-saga';
import chatSettingsReducer from './chatSettingsSlice';
import roomsSlice from './roomsSlice';
import { IRoom } from '../types/types';

const sagaMiddleware = createSagaMiddleware();

const rootReducer = combineReducers({
  chatSettingStore: chatSettingsReducer,
  rooms: roomsSlice,
});

export const getActiveRoom = (state: RootState): IRoom | null => {
  const roomMessagesState = state.rooms;
  return roomMessagesState.activeRoomJID
    ? roomMessagesState.rooms[roomMessagesState.activeRoomJID]
    : null;
};

export const store = configureStore({
  reducer: rootReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: ['chat/addMessage'],
        ignoredPaths: ['chat.messages.timestamp'],
        serializableCheck: false,
      },
    }).concat(sagaMiddleware),
});

export type RootState = ReturnType<typeof rootReducer>;
export type AppDispatch = typeof store.dispatch;
