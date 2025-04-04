import { Client } from '@xmpp/client';
import { MODAL_TYPES } from '../helpers/constants/MODAL_TYPES';
import { TranslationObject } from '../helpers/transformTranslatations';

export interface IUser extends Partial<User> {
  id: string;
  name: string | null;
  userJID?: string | null;
  token?: string;
  refreshToken?: string;
}

export interface IMessage {
  id: string; // message ID (aka timestamp in microseconds)
  user: IUser;
  date: Date | string; // date converted from id / timestamp (e.g. "2024-02-18T03:24:33.102Z")
  body: string; // message body
  roomJid: string; // room id
  key?: string; // workaround to solve a problem of messages uniqueness - additional, local timestamp to solve when XMPP server sends duplicate timestamps (TO DO: depricate / review)
  coinsInMessage?: string | number; // store only - message coins counter
  numberOfReplies?: number[] | number; // store only - array of replies in a thread (if applicable) - includes messages IDs so that client app can display relevant message previews for the thread
  isSystemMessage?: string;
  isMediafile?: string;
  locationPreview?: string;
  mimetype?: string;
  location?: string;
  pending?: boolean;
  timestamp?: number;
  showInChannel?: string;
  activeMessage?: boolean;
  isReply?: boolean | string;
  isDeleted?: boolean;
  mainMessage?: string;
  reply?: IReply[];
  reaction?: Record<string, ReactionMessage>;
  fileName?: string;
  translations?: TranslationObject;
  langSource?: string;
  originalName?: string;
  size?: string;
  xmppId?: string;
  xmppFrom?: string;
}

export interface ReactionMessage {
  emoji: string[];
  data: Record<string, string>;
}

export interface IReply extends IMessage {}

export interface IRoom {
  name: string;
  jid: string;
  title: string;
  usersCnt: number;
  messages: IMessage[];
  isLoading: boolean;
  roomBg: string;

  id?: string;
  lastMessage?: LastMessage;
  lastMessageTimestamp?: number;
  lastRoomMessage?: RoomLastMessage;
  icon?: string;
  composing?: boolean;
  composingList?: string[];
  lastViewedTimestamp?: number;
  unreadMessages?: number;
  noMessages?: boolean;
  role?: string;

  roomMembers?: RoomMember[];

  messageStats?: {
    lastMessageTimestamp?: number;
    firstMessageTimestamp?: number;
  };
  historyComplete?: boolean;
}

export interface IRoomCompressed extends Pick<IRoom, 'jid'> {}

export interface RoomMember {
  ban_status: string;
  jid: string;
  last_active: number;
  name: string;
  role: string;
}

export interface RoomLastMessage {
  name: string;
  body: string;
}

export interface UserType extends IMessage {
  id: any;
  user: any;
  timestamp: any;
  text: any;
}

export interface ConfigUser {
  email: string;
  password: string;
}

export interface User {
  walletAddress: string;

  description?: string;
  token: string;
  refreshToken: string;

  defaultWallet: {
    walletAddress: string;
  };
  _id: string;
  firstName: string;
  lastName: string;
  email?: string;
  username?: string;
  profileImage?: string;
  emails?: [
    {
      loginType: string;
      email: string;
      verified: boolean;
      _id: string;
    },
  ];
  appId: string;
  xmppPassword: string;

  langSource?: Iso639_1Codes;

  homeScreen?: string;
  registrationChannelType?: string;
  updatedAt?: string;
  authMethod?: string;
  resetPasswordExpires?: string;
  resetPasswordToken?: string;
  xmppUsername?: string;
  roles?: string[];
  tags?: string[];
  __v?: number;

  isProfileOpen?: boolean;
  isAssetsOpen?: boolean;
  isAgreeWithTerms?: boolean;
  isSuperAdmin?: any;
}

export interface XmppState {
  client: any;
  loading: boolean;
}

export interface IConfig {
  disableHeader?: boolean;
  disableMedia?: boolean;
  colors?: { primary: string; secondary: string };
  googleLogin?: {
    enabled: boolean;
    firebaseConfig: {
      apiKey: string;
      authDomain: string;
      projectId: string;
      storageBucket: string;
      messagingSenderId: string;
      appId: string;
    };
  };
  jwtLogin?: {
    token: string;
    enabled: boolean;
    handleBadlogin?: React.ReactElement;
  };
  userLogin?: {
    enabled: boolean;
    user: User | null;
  };
  customLogin?: {
    enabled: boolean;
    loginFunction: any; //() => Promise<User>
  };
  baseUrl?: string;
  xmppSettings?: xmppSettingsInterface;
  disableRooms?: boolean;
  defaultLogin?: boolean;
  disableInteractions?: boolean;
  chatHeaderBurgerMenu?: boolean;
  forceSetRoom?: boolean;
  roomListStyles?: React.CSSProperties;
  chatRoomStyles?: React.CSSProperties;
  setRoomJidInPath?: boolean;
  disableRoomMenu?: boolean;
  defaultRooms?: ConfigRoom[];
  refreshTokens?: { enabled: boolean; refreshFunction?: any };
  backgroundChat?: {
    color?: string;
    image?: any;
  };
  bubleMessage?: {
    backgroundMessageUser?: string;
    backgroundMessage?: string;
    colorUser?: string;
    color?: string;
    borderRadius?: number;
  };
  headerLogo?: any;
  headerMenu?: () => void;
  headerChatMenu?: () => void;
  customRooms?: {
    rooms: PartialRoomWithMandatoryKeys[];
    disableGetRooms?: boolean;
    singleRoom: boolean;
  };
  enableTranslates?: boolean;
  disableRoomConfig?: boolean;
  disableProfilesInteractions?: boolean;
  disableUserCount?: boolean;
  clearStoreBeforeInit?: boolean;
  disableSentLogic?: boolean;
}

type PartialRoomWithMandatoryKeys = Partial<IRoom> &
  Pick<IRoom, 'jid' | 'title'>;

export interface xmppSettingsInterface {
  devServer: string;
  host: string;
  conference?: string;
}

interface ConfigRoom {
  jid: string;
  pinned: boolean;
  _id?: string;
}

export interface StorageUser {
  appId: string;
  company: any[];
  firstName: string;
  homeScreen: string;

  lastName: string;
  referrerId: string;
  refreshToken: string;
  token: string;
  walletAddress: string;
  xmppPassword: string;
  _id: string;

  isAgreeWithTerms?: boolean;
  isAllowedNewAppCreate?: boolean;
  isAssetsOpen?: boolean;
  isProfileOpen?: boolean;
}

export interface xmppSettingsInterface {
  devServer: string;
  host: string;
  conference?: string;
}

export interface MessageProps {
  message: IMessage;
  isUser: boolean;
  isReply: boolean;
}

export interface MediaMessageType {}

export interface DeleteModal {
  isDeleteModal: boolean;
  roomJid?: string;
  messageId?: string;
}

export interface EditAction {
  isEdit: boolean;
  roomJid?: string;
  messageId?: string;
  text?: string;
}

export interface ReactionAction {
  roomJID: string;
  messageId: string;
  from: string;
  reactions: string[];
  latestReactionTimestamp?: string;
  data?: Record<string, string>;
}

export type ModalType = (typeof MODAL_TYPES)[keyof typeof MODAL_TYPES];

export interface ModalFile {
  fileName: string;
  fileURL: string;
  mimetype: string;
}

export interface ReactionAction {
  roomJID: string;
  messageId: string;
  reactions: string[];
}

export interface AddRoomMessageAction {
  roomJID: string;
  message: IMessage;
  start?: boolean;
}

//xmppClientWs

export interface XmppClientInterface {
  client: Client;
  devServer?: string;
  host: string;
  service: string;
  conference: string;
  username: string;
  status: string;

  password: string;
  reconnectAttempts: number;
  maxReconnectAttempts: number;
  reconnectDelay: number;

  checkOnline(): boolean;
  initializeClient(): void;
  attachEventListeners(): void;
  reconnect(): void;
  close(): Promise<void>;

  getRoomsStanza(): Promise<void>;
  createRoomStanza(
    title: string,
    description: string,
    to?: string
  ): Promise<any>;
  inviteRoomRequestStanza(to: string, roomJid: string): Promise<void>;
  leaveTheRoomStanza(roomJID: string): void;
  presenceInRoomStanza(roomJID: string): void;
  getHistoryStanza(
    chatJID: string,
    max: number,
    before?: number,
    otherStanzaId?: string
  ): Promise<any>;
  getLastMessageArchiveStanza(roomJID: string): void;
  setRoomImageStanza(
    roomJid: string,
    roomThumbnail: string,
    type: string,
    roomBackground?: string
  ): void;
  getRoomInfoStanza(roomJID: string): void;
  getRoomMembersStanza(roomJID: string): void;
  setVCardStanza(xmppUsername: string): void;

  sendMessage(
    roomJID: string,
    firstName: string,
    lastName: string,
    photo: string,
    walletAddress: string,
    userMessage: string,
    notDisplayedValue?: string,
    isReply?: boolean,
    showInChannel?: boolean,
    mainMessage?: string
  ): void;
  sendMessageReactionStanza(
    messageId: string,
    roomJid: string,
    reactionsList: string[],
    data: any,
    reactionSymbol?: any
  ): void;
  deleteMessageStanza(room: string, msgId: string): void;
  editMessageStanza(room: string, msgId: string, text: string): void;
  sendTypingRequestStanza(
    chatId: string,
    fullName: string,
    start: boolean
  ): void;
  getChatsPrivateStoreRequestStanza(): Promise<any>;
  actionSetTimestampToPrivateStoreStanza(
    chatId: string,
    timestamp: number,
    chats?: string[]
  ): Promise<void>;
  sendMediaMessageStanza(roomJID: string, data: any): void;
  createPrivateRoomStanza(
    title: string,
    description: string,
    to: string
  ): Promise<string>;
  sendMessageReactionStanza(
    messageId: string,
    roomJid: string,
    reactionsList: string[],
    reactionSymbol?: any
  ): void;
  getRoomsPagedStanza(maxResults: number, after: string | null): void;
}

export type Iso639_1Codes = 'en' | 'es' | 'pt' | 'ht' | 'zh';

export interface Language {
  iso639_1: Iso639_1Codes;
  name: string;
}

export type LanguageOptions = {
  languages: Array<Language>;
  language?: Iso639_1Codes;
};

export type MediaFile = {
  uri: string;
  type: string;
  name: string;
};

export interface LastMessage extends Omit<Partial<IMessage>, 'date'> {
  body: string;
  date?: string | Date;
  emoji?: string;
  locationPreview?: string;
  filename?: string;
  mimetype?: string;
  originalName?: string;
}
