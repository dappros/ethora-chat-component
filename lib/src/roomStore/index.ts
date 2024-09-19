import { configureStore, combineReducers } from "@reduxjs/toolkit";
import createSagaMiddleware from "redux-saga";
import chatReducer from "./chatSlice";
import roomMessagesReducer from "./roomMessagesSlice";
import loginReducer from "./loginSlice";
import chatSettingsReducer from "./chatSettingsSlice";
import roomsSlice from "./roomsSlice";

const sagaMiddleware = createSagaMiddleware();

const rootReducer = combineReducers({
  chat: chatReducer,
  roomMessages: roomMessagesReducer,
  loginStore: loginReducer,
  chatSettingStore: chatSettingsReducer,
  rooms: roomsSlice,
});

export const store = configureStore({
  reducer: rootReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: ["chat/addMessage"],
        ignoredPaths: ["chat.messages.timestamp"],
        serializableCheck: false,
      },
    }).concat(sagaMiddleware),
});

export type RootState = ReturnType<typeof rootReducer>;
export type AppDispatch = typeof store.dispatch;
