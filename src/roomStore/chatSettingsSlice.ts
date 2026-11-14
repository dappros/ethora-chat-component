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
import {
  applyRemoteConfigRecord,
  RemoteConfigRecord,
} from '../helpers/liveConfig';
import type { AccountBlockedInfo } from '../helpers/accountBlocked';

/**
 * The account is suspended or archived (see helpers/accountBlocked.ts).
 * `userKey` is the XMPP username the block was learned for, or '' when it
 * arrived before any user was signed in (a refused login).
 */
export interface AccountStatusState extends AccountBlockedInfo {
  userKey: string;
}

const userKeyOf = (user?: Partial<User> | null): string =>
  user?.xmppUsername ||
  walletToUsername(user?.defaultWallet?.walletAddress) ||
  '';

interface ChatState {
  user: User;
  config?: IConfig;
  /**
   * The operator-saved look read for `config.remoteAppearance` (validated,
   * live keys only). Kept next to `config` so that whoever writes `config`
   * (the chat, the provider, the init hook) gets it laid over their value,
   * and one writer cannot undo what another applied. Not persisted.
   */
  remoteConfig?: RemoteConfigRecord | null;
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
  blockedUserIds: string[];
  /**
   * Set when the API answered USER_SUSPENDED / USER_ARCHIVED for this
   * session. The chat then shows the blocking notice and stops connecting.
   * Not persisted: a reload asks the server again.
   */
  accountStatus?: AccountStatusState | null;
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
  blockedUserIds: [],
  accountStatus: null,
};

const chatSlice = createSlice({
  name: 'chatSettingStore',
  initialState,
  reducers: {
    setUser: (state, action: PayloadAction<User>) => {
      const blocked = state.accountStatus;
      if (blocked) {
        const incomingKey = userKeyOf(action.payload);
        if (!blocked.userKey) {
          // Learned before anyone was signed in (a refused login, or a
          // host login whose follow-up call was refused): the user that
          // arrives now is the one the block belongs to.
          blocked.userKey = incomingKey;
        } else if (incomingKey && incomingKey !== blocked.userKey) {
          // A different account signed in: the block was not about it.
          state.accountStatus = null;
        }
      }
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
      state.config = state.remoteConfig
        ? applyRemoteConfigRecord(action.payload, state.remoteConfig)
        : action.payload;
      if (action.payload?.appId) {
        state.appId = action.payload.appId;
      }
    },
    setRemoteConfig: (
      state,
      action: PayloadAction<RemoteConfigRecord | null | undefined>
    ) => {
      state.remoteConfig = action.payload || null;
    },
    setActiveModal: (state, action: PayloadAction<ModalType | undefined>) => {
      state.activeModal = action.payload;
    },
    // Nullable on purpose: closing the file preview clears the active file
    // with `setActiveFile(undefined)`, which the old signature disallowed
    // while `state.activeFile` was already optional.
    setActiveFile: (state, action: PayloadAction<ModalFile | undefined>) => {
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
    // Just the XMPP credential, for POST /v1/users/xmpp-token. refreshTokens
    // above needs a whole token pair, and minting only an XMPP password must
    // not touch the REST session.
    setXmppPassword: (state, action: PayloadAction<string>) => {
      if (!action.payload) return;
      state.user.xmppPassword = action.payload;
      persistUserSession(state.user);
    },
    setBlockedUserIds: (state, action: PayloadAction<string[]>) => {
      state.blockedUserIds = action.payload;
    },
    addBlockedUserId: (state, action: PayloadAction<string>) => {
      if (!state.blockedUserIds.includes(action.payload)) {
        state.blockedUserIds.push(action.payload);
      }
    },
    removeBlockedUserId: (state, action: PayloadAction<string>) => {
      state.blockedUserIds = state.blockedUserIds.filter(
        (id) => id !== action.payload
      );
    },
    setAccountBlocked: (state, action: PayloadAction<AccountBlockedInfo>) => {
      state.accountStatus = {
        ...action.payload,
        // Keep the identity of the first report: a later report for the
        // same session must not move the block onto someone else.
        userKey: state.accountStatus?.userKey || userKeyOf(state.user),
      };
    },
    clearAccountBlocked: (state) => {
      state.accountStatus = null;
    },
    logout: (state) => {
      state.accountStatus = null;
      state.user = unpackAndTransform();
      state.config = undefined;
      state.blockedUserIds = [];
      clearStoredUser();
    },
  },
});

export const {
  setUser,
  setConfig,
  setRemoteConfig,
  refreshTokens,
  setXmppPassword,
  logout,
  setActiveModal,
  setDeleteModal,
  setSelectedUser,
  updateUser,
  setActiveFile,
  setLangSource,
  setTranslateSendEnabled,
  setTranslateMode,
  setBlockedUserIds,
  addBlockedUserId,
  removeBlockedUserId,
  setAccountBlocked,
  clearAccountBlocked,
} = chatSlice.actions;

export default chatSlice.reducer;
