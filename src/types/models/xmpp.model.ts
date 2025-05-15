import { Client } from '@xmpp/client';
import { Iso639_1Codes } from './language.model';
import XmppClient from '../../networking/xmppClient';

export interface XmppState {
  client: XmppClient | null;
  loading: boolean;
}

export interface xmppSettingsInterface {
  devServer: string;
  host: string;
  conference?: string;
}

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
  reconnect(): Promise<void>;
  close(): Promise<void>;
  ensureConnected(timeout?: number): Promise<void>;

  getRoomsStanza(disableGetRooms?: boolean): Promise<void>;
  createRoomStanza(
    title: string,
    description: string,
    to?: string
  ): Promise<any>; // Consider replacing 'any' with a more specific type
  inviteRoomRequestStanza(to: string, roomJid: string): Promise<void>;
  leaveTheRoomStanza(roomJID: string): void;
  presenceInRoomStanza(roomJID: string): void;
  getHistoryStanza(
    chatJID: string,
    max: number,
    before?: number,
    otherStanzaId?: string
  ): Promise<any>; // Consider replacing 'any' with a more specific type
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
    mainMessage?: string,
    customId?: string
  ): void;
  deleteMessageStanza(room: string, msgId: string): void;
  editMessageStanza(room: string, msgId: string, text: string): void;
  sendTypingRequestStanza(
    chatId: string,
    fullName: string,
    start: boolean
  ): void;
  getChatsPrivateStoreRequestStanza(): Promise<any>; // Consider replacing 'any' with a more specific type
  actionSetTimestampToPrivateStoreStanza(
    chatId: string,
    timestamp: number,
    chats?: string[]
  ): Promise<void>;
  sendMediaMessageStanza(roomJID: string, data: any): void; // Consider replacing 'any' with a more specific type
  createPrivateRoomStanza(
    title: string,
    description: string,
    to: string
  ): Promise<string>;
  sendMessageReactionStanza(
    messageId: string,
    roomJid: string,
    reactionsList: string[],
    reactionSymbol?: any // Consider replacing 'any' with a more specific type
  ): void;
  sendTextMessageWithTranslateTagStanza(
    roomJID: string,
    firstName: string,
    lastName: string,
    photo: string,
    walletAddress: string,
    userMessage: string,
    notDisplayedValue?: string,
    isReply?: boolean,
    showInChannel?: boolean,
    mainMessage?: string,
    langSource?: Iso639_1Codes
  ): void;
  disconnect?(): Promise<void>;
}
