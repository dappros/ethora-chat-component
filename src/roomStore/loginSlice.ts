import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { IUser } from '../types/types';

interface LoginState {
  isAuthenticated: boolean;
  user: IUser;
}

const initialState: LoginState = {
  isAuthenticated: false,
  user: {
    id: '',
    name: null,
    token: '',
    refreshToken: '',
  },
};

export const loginSlice = createSlice({
  name: 'login',
  initialState,
  reducers: {
    login: (
      state,
      action: PayloadAction<{
        id: string;
        name: string;
        token: '';
        refreshToken: '';
      }>
    ) => {
      state.isAuthenticated = true;

      console.log({ action: action.payload });

      state.user = action.payload;
    },
    logout: (state) => {
      state.isAuthenticated = false;
      state.user = {
        id: '',
        name: null,
        token: '',
        refreshToken: '',
      };
    },
    getInfo: (state, action: PayloadAction<{ id: string }>) => {
      if (state.isAuthenticated) {
        state.user.id = action.payload.id;
      }
    },
    refreshTokens: (
      state,
      action: PayloadAction<{ token: string; refreshToken: string }>
    ) => {
      console.log('changing tokens');
      state.user.refreshToken = action.payload.refreshToken;
      state.user.token = action.payload.token;
    },
  },
});

export const { login, logout, getInfo, refreshTokens } = loginSlice.actions;

export default loginSlice.reducer;
