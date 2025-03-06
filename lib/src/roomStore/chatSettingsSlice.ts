import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import {
  DeleteModal,
  IConfig,
  Iso639_1Codes,
  IUser,
  ModalFile,
  ModalType,
  User,
} from '../types/types';
import { localStorageConstants } from '../helpers/constants/LOCAL_STORAGE';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { walletToUsername } from '../helpers/walletUsername';
import XmppClient from '../networking/xmppClient';

interface ChatState {
  user: User;
  config?: IConfig;
  activeModal?: ModalType;
  deleteModal?: DeleteModal;
  selectedUser?: IUser;
  activeFile?: ModalFile;
  client?: XmppClient;
  langSource?: Iso639_1Codes;
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
    xmppUsername:
      input?.xmppUsername ||
      walletToUsername(input?.defaultWallet?.walletAddress) ||
      '',
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
  deleteModal: {
    isDeleteModal: false,
    roomJid: '',
    messageId: '',
  },
  config: { colors: { primary: '#0052CD', secondary: '#F3F6FC' } },
};

export const chatSlice = createSlice({
  name: 'chatSettingStore',
  initialState,
  reducers: {
    setUser: (state, action: PayloadAction<User>) => {
      state.user = unpackAndTransform(action.payload);
      useLocalStorage(localStorageConstants.ETHORA_USER).set(
        unpackAndTransform(action.payload)
      );
    },
    updateUser(state, action: PayloadAction<{ updates: Partial<User> }>) {
      const { updates } = action.payload;
      const user = state.user;
      if (user) {
        state.user = {
          ...user,
          ...updates,
        };
      }
    },
    setConfig: (state, action: PayloadAction<IConfig | undefined>) => {
      console.log('setting ', action.payload);
      state.config = action.payload;
    },
    setActiveModal: (state, action: PayloadAction<ModalType | undefined>) => {
      state.activeModal = action.payload;
    },
    setActiveFile: (state, action: PayloadAction<ModalFile>) => {
      state.activeFile = action.payload;
    },
    setDeleteModal: (state, action: PayloadAction<DeleteModal | undefined>) => {
      state.deleteModal = action.payload;
    },
    setStoreClient: (state, action: PayloadAction<XmppClient>) => {
      state.client = action.payload;
    },
    setSelectedUser: (state, action: PayloadAction<IUser | undefined>) => {
      state.selectedUser = action.payload;
    },
    setLangSource: (
      state,
      action: PayloadAction<Iso639_1Codes | undefined>
    ) => {
      state.langSource = action.payload;
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
      state.client = undefined;

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
  setDeleteModal,
  setSelectedUser,
  updateUser,
  setActiveFile,
  setStoreClient,
  setLangSource,
} = chatSlice.actions;

export default chatSlice.reducer;
