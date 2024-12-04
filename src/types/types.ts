import { MODAL_TYPES } from '../helpers/constants/MODAL_TYPES';

export interface IUser extends Partial<User> {
  id: string;
  name: string | null;
  userJID?: string | null;
  token: string;
  refreshToken: string;
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
}

export interface IReply extends IMessage {}

export interface IRoom {
  id: string;
  name: string;
  jid: string;
  title: string;
  usersCnt: number;
  messages: IMessage[];
  isLoading: boolean;
  roomBg: string;

  lastMessage?: string;
  lastRoomMessage?: RoomLastMessage;
  icon?: string;
  composing?: boolean;
  composingList?: string[];
  lastViewedTimestamp?: number;
  unreadMessages?: number;
  noMessages?: boolean;
  role?: string;

  roomMembers?: RoomMember[];
}

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
  disableRooms?: boolean;
  defaultLogin?: boolean;
  disableInteractions?: boolean;
  chatHeaderBurgerMenu?: boolean;
  forceSetRoom?: boolean;
  roomListStyles?: React.CSSProperties;
  chatRoomStyles?: React.CSSProperties;
  setRoomJidInPath?: boolean;
  disableRoomMenu?: boolean;
  defaultRooms?: string[] | ConfigRoom[];
  refreshTokens?: { enabled: boolean; refreshFunction?: any };
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

export type ModalType = (typeof MODAL_TYPES)[keyof typeof MODAL_TYPES];
