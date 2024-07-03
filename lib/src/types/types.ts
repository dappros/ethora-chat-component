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
}

export interface IRoom {
  id: string;
  name: string;
  jid: string;
  title: string;
  usersCnt: number;
  // users: IUser[];
  messages: IMessage[];
  lastMessage?: string;
  icon?: string;
}

export interface UserType extends IMessage {
  id: any;
  user: any;
  timestamp: any;
  text: any;
}

export interface User {
  defaultWallet?: any;
  user?: any;
  _id: string;
  xmppPassword: string;
  walletAddress: string;
  firstName: string;
  lastName: string;

  description?: string;
  token: string;
  refreshToken: string;
  profileImage?: string;
}

export interface XmppState {
  client: any;
  loading: boolean;
}
