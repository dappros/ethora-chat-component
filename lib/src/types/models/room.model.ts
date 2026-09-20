import { IMessage, LastMessage } from './message.model';

export interface RoomMember {
  _id: string;
  firstName: string;
  lastName: string;
  xmppUsername: string;
  profileImage?: string;
  description?: string;
  email?: string;

  ban_status?: string;
  jid?: string;
  name?: string;
  role?: string;
  last_active?: number;
}

export interface RoomLastMessage {
  name: string;
  body: string;
}

export interface IRoom {
  name: string;
  jid: string;
  title: string;
  usersCnt: number;
  messages: IMessage[];
  isLoading: boolean;
  roomBg: string;

  members?: RoomMember[];
  type?: 'public' | 'group' | 'private';
  /**
   * End-to-end encrypted room (OMEMO 2), as the backend reports it on
   * `GET /v1/chats/my`. Set once when the room is created and never changed:
   * flipping it would either leak plaintext into a room the other side reads
   * as encrypted, or drop encryption the other side relies on. The SDK only
   * runs its OMEMO path for rooms carrying this flag.
   */
  e2ee?: boolean;
  creteadAt?: string; // Typo? Should it be createdAt?

  appId?: string;
  createdAt?: string;
  createdBy?: string;
  description?: string;
  isAppChat?: boolean;
  picture?: string;
  updatedAt?: string;
  __v?: number | string;
  _id?: string;

  id?: string;
  /**
   * Written from two places: reactionsMiddleware keeps it current for a
   * room that already has loaded messages, and createRoomFromApi seeds it
   * from the API's `lastMessage` (see ApiRoomLastMessage) for a room that
   * doesn't yet. ChatRoomItem only reads this while `messages` is empty -
   * once real history loads, `messages` is what renders the preview, so a
   * seed left sitting here afterward is inert rather than stale-looking.
   */
  lastMessage?: LastMessage;
  lastMessageTimestamp?: number;
  lastRoomMessage?: RoomLastMessage;
  icon?: string;
  composing?: boolean;
  composingList?: string[];
  lastViewedTimestamp?: number;
  unreadBaselineTimestamp?: number;
  unreadMessages?: number;
  noMessages?: boolean;
  role?: string;

  messageStats?: {
    lastMessageTimestamp?: number;
    firstMessageTimestamp?: number;
  };
  historyComplete?: boolean;
  // 'partial' = a staged first pass fetched a teaser page (e.g. 1 message
  // for the sidebar preview); a follow-up pass with a bigger page size still
  // has work to do. Only 'done' short-circuits preloading.
  historyPreloadState?: 'idle' | 'loading' | 'partial' | 'done' | 'error';
  unreadCapped?: boolean;

  /**
   * The caller's own mute preference for this room, as reported by the
   * backend (`GET /v1/chats/my` / `/v1/chats/my/{chatName}`). Only a real
   * backend that supports mute ever sends this field - prod doesn't yet, so
   * this stays `undefined` (not `false`) there. Treat `undefined` as "not
   * muted" for behaviour, but as "unsupported" for whether to show a mute
   * toggle at all (see useRoomMute's `isSupported`).
   */
  muted?: boolean;
}

/**
 * The flattened `lastMessage` object `GET /v1/chats/my` embeds per room
 * (QA verified 2026-09-16: all 16 rooms returned it). Prod's `chats/my`
 * has previously lacked fields other endpoints send (see IRoom.muted) -
 * treat every field here as optional and never assume it is present.
 */
export interface ApiRoomLastMessage {
  body?: string;
  truncated?: boolean;
  from?: string;
  fromUserId?: string;
  messageId?: string;
  stanzaId?: string;
  createdAt?: string;
  isOwn?: boolean;
  senderFirstName?: string;
  senderLastName?: string;
}

export interface ApiRoom {
  name: string;
  type: 'public' | 'group' | 'private';

  /** See IRoom.e2ee. Passed straight through by createRoomFromApi. */
  e2ee?: boolean;
  title?: string;
  description?: string;
  picture?: string;
  members?: RoomMember[];
  createdBy?: string;
  appId?: any;

  _id?: string;
  isAppChat?: boolean;
  createdAt?: string;
  updatedAt?: string;
  __v?: string;

  /** See IRoom.muted - only present when the backend supports per-chat mute. */
  muted?: boolean;

  /** See ApiRoomLastMessage - only present when the backend supports it. */
  lastMessage?: ApiRoomLastMessage;
}

export interface PostRoom {
  title: string;
  uuid?: string;
  type: 'public' | 'group';

  description?: string;
  picture?: string;
  members?: string[];
}

export interface PostReportRoom {
  chatName: string;
  category: string;
  text?: string;
}

export interface PostAddRoomMember {
  chatName: string;
  members: string[];
}

export interface DeleteRoomMember {
  roomId: string;
  members: string[];
}

export interface IRoomCompressed extends Pick<IRoom, 'jid'> {}

export interface ConfigRoom {
  jid: string;
  pinned: boolean;
  _id?: string;
}

export type ChatAccessOption =
  | { name: 'Public'; id: 'public' }
  | { name: 'Members-only'; id: 'group' };
