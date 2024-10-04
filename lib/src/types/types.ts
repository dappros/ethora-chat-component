export interface IUser {
  id: string;
  name: string | null;
  avatar?: string | null;
  xmmpPass?: string | null;
  userJID?: string | null;
  token: string;
  refreshToken: string;
}

export interface IMessage {
  id: string; // message ID (aka timestamp in microseconds)
  user: IUser;
  date: Date | string; // date converted from id / timestamp (e.g. "2024-02-18T03:24:33.102Z")
  body: string; // message body
  roomJID: string; // room id
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
}

export interface IRoom {
  id: string;
  name: string;
  jid: string;
  title: string;
  usersCnt: number;
  // users: IUser[];
  messages: IMessage[];
  isLoading: boolean;
  lastMessage?: string;
  icon?: string;
  composing?: boolean;
  composingList?: string[];
  lastViewedTimestamp?: number;
  unreadMessages?: number;
}

export interface UserType extends IMessage {
  id: any;
  user: any;
  timestamp: any;
  text: any;
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
  email: string;
  username: string;
  profileImage: string;
  emails?: [
    {
      loginType: string;
      email: string;
      verified: boolean;
      _id: string;
    }
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
}

export interface XmppState {
  client: any;
  loading: boolean;
}

export interface IConfig {
  disableHeader?: boolean;
  disableMedia?: boolean;
  colors?: { primary: string; secondary: string };
  googleLogin?: boolean;
  firebaseConfig?: {
    apiKey: string;
    authDomain: string;
    projectId: string;
    storageBucket: string;
    messagingSenderId: string;
    appId: string;
  };
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
