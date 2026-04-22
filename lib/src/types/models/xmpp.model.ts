import { Client } from '@xmpp/client';
import { Iso639_1Codes } from './language.model';
import XmppClient from '../../networking/xmppClient';
import { IMessage } from './message.model';

export interface XmppState {
  client: XmppClient | null;
  loading: boolean;
}

export interface xmppSettingsInterface {
  devServer?: string;
  host?: string;
  conference?: string;
  disableLastRead?: boolean;
  xmppPingOnSendEnabled?: boolean;
  historyQoS?: {
    maxInFlightHistory?: number;
    softPauseAfterSendMs?: number;
    activeRoomBoostTtlMs?: number;
    activeSendBoostMs?: number;
    alwaysPrioritizeActiveRoom?: boolean;
    backgroundWhileCriticalSend?: boolean;
    preloadTopKRooms?: number;
    presenceFailureBackoffMs?: number;
    startupPrivateStoreTimeoutMs?: number;
    startupPrivateStoreTtlMs?: number;
    stagedPreloadEnabled?: boolean;
    stagedPreloadFirstPassSize?: number;
    stagedPreloadSecondPassSize?: number;
    stagedPreloadConcurrency?: number;
  };
}

export interface MediaUploadData {
  file: File;
  type: string;
  name?: string;
}

export interface XmppClientInterface {
  client: Client;
  devServer?: string;
  host: string;
  service: string;
  conference: string;
  username: string;
  status: string;
  resource: string;

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
  ): Promise<string | object>;
  inviteRoomRequestStanza(to: string, roomJid: string): Promise<void>;
  leaveTheRoomStanza(roomJID: string): void;
  presenceInRoomStanza(
    roomJID: string,
    settleDelay?: number,
    timeoutMs?: number,
    waitForJoin?: boolean
  ): Promise<boolean>;
  prioritizeRoomPresence(roomJID: string): Promise<boolean>;
  recoverRoomPresenceOnly(roomJID: string): Promise<boolean>;
  getHistoryStanza(
    chatJID: string,
    max: number,
    before?: number,
    otherStanzaId?: string,
    options?: {
      coalesceRoom?: boolean;
      skipIfPreloaded?: boolean;
      source?: 'active' | 'send_ack' | 'background' | 'default';
    }
  ): Promise<IMessage[] | undefined>;
  promoteRoomHistory(roomJID: string): void;
  setActiveRoomJid(roomJID: string | null): void;
  isActiveRoomGateOpen(): boolean;
  onCriticalSend(roomJID: string, messageId?: string): void;
  enqueueHistoryTask(params: {
    chatJID: string;
    max: number;
    before?: number;
    id?: string;
    source?: 'active' | 'send_ack' | 'background' | 'default';
  }): Promise<IMessage[] | undefined>;
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
  getChatsPrivateStoreRequestStanza(): Promise<any>;
  actionSetTimestampToPrivateStoreStanza(
    chatId: string,
    timestamp: number,
    chats?: string[]
  ): Promise<void>;
  sendMediaMessageStanza(
    roomJID: string,
    data: MediaUploadData,
    id: string
  ): Promise<boolean>;
  createPrivateRoomStanza(
    title: string,
    description: string,
    to: string
  ): Promise<string>;
  sendMessageReactionStanza(
    messageId: string,
    roomJid: string,
    reactionsList: string[],
    reactionSymbol?: string
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
