import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { IConfig, IUser, User } from '../types/types';
import { localStorageConstants } from '../helpers/constants/LOCAL_STORAGE';
import { useLocalStorage } from '../hooks/useLocalStorage';

interface ChatState {
  user: User;
  config?: IConfig;
  activeModal?: 'settings' | 'profile' | 'chatprofile';
  selectedUser?: IUser;
}

const unpackAndTransform = (input?: User): User => {
  return {
    description: '',
    token: input?.token || '',
    profileImage: input?.profileImage || '',
    _id: input?._id || '',
    walletAddress: input?.defaultWallet?.walletAddress || '',
    xmppPassword: input?.xmppPassword || '',
    refreshToken: input?.refreshToken || '',
    firstName: input?.firstName || '',
    lastName: input?.lastName || '',
    defaultWallet: {
      walletAddress: input?.defaultWallet?.walletAddress || '',
    },
    email: input?.email || '',
    username: input?.username || '',
    appId: input?.appId || '',
    homeScreen: input?.homeScreen || '',
    registrationChannelType: input?.registrationChannelType || '',
    updatedAt: input?.updatedAt || '',
    authMethod: input?.authMethod || '',
    resetPasswordExpires: input?.resetPasswordExpires || '',
    resetPasswordToken: input?.resetPasswordToken || '',
    xmppUsername: input?.xmppUsername || '',
    roles: input?.roles || [],
    tags: input?.tags || [],
    __v: input?.__v || 0,
    isProfileOpen: input?.isProfileOpen || false,
    isAssetsOpen: input?.isAssetsOpen || false,
    isAgreeWithTerms: input?.isAgreeWithTerms || false,
  };
};

const initialState: ChatState = {
  user: {
    description: '',
    token: '',
    profileImage: '',
    _id: '',
    walletAddress: '',
    xmppPassword: '',
    refreshToken: '',
    firstName: '',
    lastName: '',
    defaultWallet: {
      walletAddress: '',
    },
    email: '',
    username: '',
    appId: '',
    homeScreen: '',
    registrationChannelType: '',
    updatedAt: '',
    authMethod: '',
    resetPasswordExpires: '',
    resetPasswordToken: '',
    xmppUsername: '',
    roles: [],
    tags: [],
    __v: 0,
    isProfileOpen: true,
    isAssetsOpen: true,
    isAgreeWithTerms: false,
  },
  config: undefined,
};

export const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    setUser: (state, action: PayloadAction<User>) => {
      state.user = unpackAndTransform(action.payload);
      useLocalStorage(localStorageConstants.ETHORA_USER).set(
        unpackAndTransform(action.payload)
      );
    },
    setConfig: (state, action: PayloadAction<IConfig | undefined>) => {
      state.config = action.payload;
    },
    setActiveModal: (
      state,
      action: PayloadAction<'settings' | 'profile' | 'chatprofile' | undefined>
    ) => {
      state.activeModal = action.payload;
    },
    setSelectedUser: (state, action: PayloadAction<IUser | undefined>) => {
      state.selectedUser = action.payload;
    },
    refreshTokens: (
      state,
      action: PayloadAction<{ token: string; refreshToken: string }>
    ) => {
      console.log('changing tokens');
      state.user.refreshToken = action.payload.refreshToken;
      state.user.token = action.payload.token;

      localStorage.setItem(
        localStorageConstants.ETHORA_USER,
        JSON.stringify(state.user)
      );
    },
    logout: (state) => {
      state.user = unpackAndTransform();
      state.config = undefined;

      localStorage.removeItem(localStorageConstants.ETHORA_USER);
    },
  },
});

export const {
  setUser,
  setConfig,
  refreshTokens,
  logout,
  setActiveModal,
  setSelectedUser,
} = chatSlice.actions;

export default chatSlice.reducer;
