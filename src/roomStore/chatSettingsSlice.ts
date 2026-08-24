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
import {
  clearStoredUser,
  persistUserSession,
} from '../helpers/authStorage';
import { walletToUsername } from '../helpers/walletUsername';
import XmppClient from '../networking/xmppClient';

interface ChatState {
  user: User;
  config?: IConfig;
  appId?: string;
  activeModal?: ModalType;
  deleteModal?: DeleteModal;
  selectedUser?: IUser;
  activeFile?: ModalFile;
  langSource?: Iso639_1Codes;
  /**
   * Whether THIS reader's own outgoing messages get tagged with
   * `<translate source="xx"/>` (see sendTextMessageWithTranslateTag) so
   * translations can be generated for them. Defaults to true so existing
   * hosts that already set `config.translates.enabled` see no change
   * until a reader explicitly opts out via the language-selector toggle.
   *
   * Turning this off does NOT untag anything already sent - a message
   * ships with whatever tag was active at send time, permanently. Turning
   * it back on only affects messages sent from that point forward. Same
   * asymmetry the other direction: turning it on doesn't retroactively
   * tag old messages either - see the disclaimer surfaced next to the
   * toggle in LanguageSelectorModal.
   */
  translateSendEnabled?: boolean;
  /**
   * Reader's own auto/manual pick from the language-selector modal's
   * switcher. Undefined means "never touched it" - falls back to
   * `config.translates.mode` (see resolveTranslateMode). Ignored entirely
   * when the host sets `config.translates.forceType: true`, which is also
   * why the switcher itself doesn't render in that case - nothing should
   * ever write here that a host has pinned.
   */
  translateMode?: 'auto' | 'manual';
}

const unpackAndTransform = (input?: User): User => {
  return {
    description: '',
    token: input?.token || '',
    profileImage: input?.profileImage || '',
    _id: input?._id || '',
    walletAddress: input?.defaultWallet?.walletAddress || '',
    xmppPassword: input?.xmppPassword || '',
    xmppUsername:
      input?.xmppUsername ||
      walletToUsername(input?.defaultWallet?.walletAddress) ||
      '',
    refreshToken: input?.refreshToken || '',
    fileToken: input?.fileToken || '',
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
    fileToken: '',
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
  appId: '',
};

const chatSlice = createSlice({
  name: 'chatSettingStore',
  initialState,
  reducers: {
    setUser: (state, action: PayloadAction<User>) => {
      state.user = unpackAndTransform(action.payload);
      state.appId = action.payload.appId || state.appId;
      persistUserSession(state.user);
    },
    updateUser(state, action: PayloadAction<{ updates: Partial<User> }>) {
      const { updates } = action.payload;
      const user = state.user;
      if (user) {
        state.user = {
          ...user,
          ...updates,
        };
        persistUserSession(state.user);
      }
    },
    setConfig: (state, action: PayloadAction<IConfig | undefined>) => {
      state.config = action.payload;
      if (action.payload?.appId) {
        state.appId = action.payload.appId;
      }
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
    setSelectedUser: (state, action: PayloadAction<IUser | undefined>) => {
      state.selectedUser = action.payload;
    },
    setLangSource: (
      state,
      action: PayloadAction<Iso639_1Codes | undefined>
    ) => {
      state.langSource = action.payload;
    },
    setTranslateSendEnabled: (state, action: PayloadAction<boolean>) => {
      state.translateSendEnabled = action.payload;
    },
    setTranslateMode: (
      state,
      action: PayloadAction<'auto' | 'manual'>
    ) => {
      state.translateMode = action.payload;
    },
    refreshTokens: (
      state,
      action: PayloadAction<{
        token: string;
        refreshToken: string;
        fileToken?: string;
        xmppPassword?: string;
      }>
    ) => {
      state.user.refreshToken = action.payload.refreshToken;
      state.user.token = action.payload.token;
      if (action.payload.fileToken) {
        state.user.fileToken = action.payload.fileToken;
      }
      
      if (action.payload.xmppPassword) {
        state.user.xmppPassword = action.payload.xmppPassword;
      }
      persistUserSession(state.user);
    },
    logout: (state) => {
      state.user = unpackAndTransform();
      state.config = undefined;
      clearStoredUser();
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
  setLangSource,
  setTranslateSendEnabled,
  setTranslateMode,
} = chatSlice.actions;

export default chatSlice.reducer;
