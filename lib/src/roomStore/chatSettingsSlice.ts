import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { IConfig, User } from '../types/types';
import { localStorageConstants } from '../helpers/constants/LOCAL_STORAGE';

interface ChatState {
  user: User;
  defaultChatRooms: any[];
  config?: IConfig;
}

const unpackAndTransform = (input: User): User => {
  console.log(input);
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
  defaultChatRooms: [],
  config: undefined,
};

export const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    setUser: (state, action: PayloadAction<User>) => {
      state.user = unpackAndTransform(action.payload);
    },
    setDefaultChatRooms: (state, action: PayloadAction<any[]>) => {
      state.defaultChatRooms = action.payload;
    },
    setConfig: (state, action: PayloadAction<IConfig | undefined>) => {
      state.config = action.payload;
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
  },
});

export const { setUser, setDefaultChatRooms, setConfig, refreshTokens } =
  chatSlice.actions;

export default chatSlice.reducer;
