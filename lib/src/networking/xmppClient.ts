import xmpp, { Client, xml } from '@xmpp/client';
import { Element } from 'ltx';
import { sendMediaMessage } from './xmpp/sendMediaMessage.xmpp';
import { getChatsPrivateStoreRequest } from './xmpp/getChatsPrivateStoreRequest.xmpp';
import { actionSetTimestampToPrivateStore } from './xmpp/actionSetTimestampToPrivateStore.xmpp';
import { sendTypingRequest } from './xmpp/sendTypingRequest.xmpp';
import { sendTextMessage } from './xmpp/sendTextMessage.xmpp';
import { deleteMessage } from './xmpp/deleteMessage.xmpp';
import { presenceInRoom } from './xmpp/presenceInRoom.xmpp';
import { getLastMessage } from './xmpp/getLastMessageArchive.xmpp';
import { createRoom } from './xmpp/createRoom.xmpp';
import { setRoomImage } from './xmpp/setRoomImage.xmpp';
import { getRoomMembers } from './xmpp/getRoomMembers.xmpp';
import { getRoomInfo } from './xmpp/getRoomInfo.xmpp';
import { leaveTheRoom } from './xmpp/leaveTheRoom.xmpp';
import { editMessage } from './xmpp/editMessage.xmpp';
import { inviteRoomRequest } from './xmpp/inviteRoomRequest.xmpp';
import { getRooms } from './xmpp/getRooms.xmpp';
import { handleStanza } from './xmpp/handleStanzas.xmpp';
import { setVcard } from './xmpp/setVCard.xmpp';
import {
  Iso639_1Codes,
  XmppClientInterface,
  xmppSettingsInterface,
} from '../types/types';
import { createPrivateRoom } from './xmpp/createPrivateRoom.xmpp';
import { sendMessageReaction } from './xmpp/sendMessageReaction.xmpp';
import { sendTextMessageWithTranslateTag } from './xmpp/sendTextMessageWithTranslateTag.xmpp';
import { getRoomsPaged } from './xmpp/getRoomsPaged.xmpp';
import {
  allRoomPresences,
  type AllRoomPresenceSummary,
} from './xmpp/allRoomPresences.xmpp';
import { sendPing } from './xmpp/sendPing.xmpp';
import { isPong } from './xmpp/handlePong.xmpp';
import { store } from '../roomStore';
import { IMessage } from '../types/types';
import { formatError } from '../utils/formatError';
import { getDataFromXml } from '../helpers/getDataFromXml';
import { createMessageFromXml } from '../helpers/createMessageFromXml';
import { setRoomMessages } from '../roomStore/roomsSlice';
import { ethoraLogger } from '../helpers/ethoraLogger';
import { getRoomLastActivityScore } from '../helpers/roomActivityScore';

type HistoryPriority = 0 | 1 | 2;
type HistorySource = 'active' | 'send_ack' | 'background' | 'default';

interface MamRequestState {
  id: string;
  chatJID: string;
  messages: Element[];
  startedAt: number;
  timeout: NodeJS.Timeout;
  resolve: (messages: IMessage[] | undefined) => void;
}

interface HistoryQueueTask {
  id: string;
  chatJID: string;
  max: number;
  before?: number;
  source: HistorySource;
  priority: HistoryPriority;
  epoch: number;
  queuedAt: number;
  resolve: (messages: IMessage[] | undefined) => void;
}

export class XmppClient implements XmppClientInterface {
  private static activeByEndpoint = new Map<string, XmppClient>();
  client!: Client;
  devServer: string | undefined;
  host: string;
  service: string;
  conference: string;
  username: string;
  status: string = 'offline';
  resource: string;

  password = '';
  reconnectAttempts = 0;
  maxReconnectAttempts = 5;
  reconnectDelay = 2000;

  private reconnecting: boolean = false;
  private reconnectPromise: Promise<void> | null = null;
  presencesReady: boolean = false;

  private connectionSteps: Array<{ ts: number; step: string }> = [];

  private messageQueue: Array<{
    id?: string;
    roomJid?: string;
    createdAt: number;
    attempts: number;
    state: 'queued' | 'sending' | 'sent_echoed' | 'failed';
    task: () => Promise<boolean>;
  }> = [];
  private pendingSendById: Map<
    string,
    { state: 'queued' | 'sending' | 'sent_echoed' | 'failed'; roomJid?: string }
  > = new Map();
  private inFlightIds: Set<string> = new Set();
  private processingQueue: boolean = false;
  private currentlyProcessingQueueId: string | null = null;
  private isRecoveringRoomPresence: boolean = false;
  private recoveryRoomJid: string | null = null;
  private joinedRooms: Set<string> = new Set();
  private roomPresenceInFlight: Map<string, Promise<boolean>> = new Map();
  private historyPreloadInFlight: Map<string, Promise<IMessage[] | undefined>> =
    new Map();
  private mamRequestRegistry: Map<string, MamRequestState> = new Map();
  private historyQueue: HistoryQueueTask[] = [];
  private historyQueueInFlight = 0;
  private historyQueueInFlightHigh = 0;
  private historyQueueWorkerScheduled = false;
  private roomHistoryEpoch: Map<string, number> = new Map();
  private criticalSendUntil = 0;
  private activeRoomBoostUntil = 0;
  private sendStartedAtById: Map<string, number> = new Map();
  private pendingSendIdsByRoom: Map<string, Set<string>> = new Map();
  private maxInFlightHistory = 1;
  private softPauseAfterSendMs = 0;
  private activeRoomBoostTtlMs = 600;

  checkOnline() {
    return this.client && this.client.status === 'online';
  }

  pingInterval: any = null;
  pingTimeout: any = null;
  lastPingId: string | null = null;
  pingIntervalMs = 60000;
  pongTimeoutMs = 1000;
  pingOnSendEnabled: boolean = false;

  idleThresholdMs = 60000;
  lastActivityTs: number = Date.now();
  pingInFlight: boolean = false;

  private idlePingTimeout: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private offlineReconnectAttempts: number = 0;
  private maxOfflineReconnectAttempts: number = 10;
  private reconnectBaseDelayMs: number = 1000;
  private pausedDueToOfflineCap: boolean = false;
  private authFailureDetected: boolean = false;
  private reconnectSuppressed: boolean = false;
  private endpointKey: string | null = null;

  private isTerminalAuthFailure(error: unknown): boolean {
    const candidate = error as any;
    const message = [
      candidate?.message,
      candidate?.condition,
      candidate?.name,
      candidate?.toString?.(),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    if (
      message.includes('not-authorized') ||
      message.includes('not authorized') ||
      message.includes('authentication') ||
      message.includes('invalid credentials') ||
      message.includes('forbidden') ||
      message.includes('sasl')
    ) {
      return true;
    }

    const stanza = candidate?.stanza || candidate?.element;
    try {
      if (!stanza?.getChild) return false;
      return Boolean(
        stanza.getChild('not-authorized') ||
          stanza.getChild('forbidden') ||
          stanza.getChild('policy-violation') ||
          stanza.getChild('authentication-failed')
      );
    } catch {
      return false;
    }
  }

  constructor(
    username: string,
    password: string,
    xmppSettings?: xmppSettingsInterface
  ) {
    this.devServer =
      xmppSettings?.devServer || `wss://dev.xmpp.ethoradev.com:5443/ws`;
    this.host = xmppSettings?.host || 'dev.xmpp.ethoradev.com';
    this.service =
      xmppSettings?.conference || 'conference.dev.xmpp.ethoradev.com';

    this.conference = `conference.${this.host}`;
    this.username = username;
    this.password = password;
    this.pingOnSendEnabled = xmppSettings?.xmppPingOnSendEnabled === true;
    this.maxInFlightHistory = Math.max(
      1,
      Number(xmppSettings?.historyQoS?.maxInFlightHistory || 1)
    );
    this.softPauseAfterSendMs = Math.max(
      0,
      Number(xmppSettings?.historyQoS?.softPauseAfterSendMs || 0)
    );
    this.activeRoomBoostTtlMs = Math.max(
      0,
      Number(xmppSettings?.historyQoS?.activeRoomBoostTtlMs || 600)
    );
    this.initializeClient();
  }

  async initializeClient() {
    try {
      this.reconnectSuppressed = false;
      this.logStep('initializeClient:start');

      if (this.client) {
        this.logStep('initializeClient:disconnect-previous');
        await this.disconnect();
      }
      const url = this.devServer || `wss://xmpp.ethoradev.com:5443/ws`;
      const endpointKey = `${url.trim().toLowerCase()}|${(this.username || '')
        .trim()
        .toLowerCase()}`;
      this.endpointKey = endpointKey;

      this.host = url.match(/wss:\/\/([^:/]+)/)?.[1] || '';
      this.conference = `conference.${this.host}`;
      ethoraLogger.log('+-+-+-+-+-+-+-+-+ ', { username: this.username });
      this.devServer = url;

      const existing = XmppClient.activeByEndpoint.get(endpointKey);
      if (existing && existing !== this) {
        if (existing.status === 'online' || existing.status === 'connecting') {
          ethoraLogger.log(
            '[InitPolicy] Duplicate init skipped: active XMPP endpoint session already exists',
            { endpointKey }
          );
          this.client = existing.client;
          this.status = existing.status;
          this.resource = existing.resource;
          this.reconnectSuppressed = true;
          return;
        }
        ethoraLogger.log('[InitPolicy] Replacing stale XMPP endpoint session', {
          endpointKey,
        });
        try {
          await existing.disconnect({ suppressReconnect: true });
        } catch (error) {
          console.warn(
            '[InitPolicy] Failed to disconnect stale endpoint session',
            error
          );
        }
      }
      XmppClient.activeByEndpoint.set(endpointKey, this);

      this.client = xmpp.client({
        service: url,
        username: this.username,
        password: this.password,
      });

      if (this.client.setMaxListeners) {
        this.client.setMaxListeners(50);
      }

      this.attachEventListeners();
      this.client.start().catch((error) => {
        console.error('Error starting client:', error);
      });
      this.logStep('initializeClient:started');
    } catch (error) {
      console.error('Error initializing client:', error);
    }
  }

  async disconnect(options?: { suppressReconnect?: boolean }) {
    if (!this.client) return;
    try {
      if (options?.suppressReconnect) {
        this.reconnectSuppressed = true;
      }
      if (this.pingInterval) clearInterval(this.pingInterval);
      if (this.pingTimeout) clearTimeout(this.pingTimeout);
      if (this.idlePingTimeout) clearTimeout(this.idlePingTimeout as any);
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      try {
        if (typeof window !== 'undefined') {
          window.removeEventListener('online', this.onBrowserOnline);
          window.removeEventListener('offline', this.onBrowserOffline);
        }
      } catch {
        // Ignore browser listener cleanup failures during disconnect.
      }
      if (this.client.removeAllListeners) {
        this.client.removeAllListeners();
        ['stanza', 'online', 'disconnect', 'error', 'connecting'].forEach(
          (event) => this.client.removeAllListeners(event)
        );
      }

      try {
        // @ts-ignore: underlying transport/socket is not typed in xmpp.js
        this.client?.transport?.socket?.close?.();
      } catch (e) {
        ethoraLogger.log('err', e);
      }

      await new Promise<void>((resolve) => {
        let resolved = false;
        const cleanup = () => {
          if (!resolved) {
            resolved = true;
            resolve();
          }
        };
        this.client.once && this.client.once('disconnect', cleanup);
        this.client.once && this.client.once('offline', cleanup);
        setTimeout(cleanup, 2000);
      });

      await this.client.stop();
      this.client = null;
      if (
        this.endpointKey &&
        XmppClient.activeByEndpoint.get(this.endpointKey) === this
      ) {
        XmppClient.activeByEndpoint.delete(this.endpointKey);
      }
      this.historyPreloadInFlight.clear();
      this.clearMamRegistry();
      this.clearHistoryQueue();
      ethoraLogger.log('Client disconnected');
    } catch (error) {
      console.error('Error disconnecting client:', error);
    }
  }

  attachEventListeners() {
    this.client.on('disconnect', () => {
      ethoraLogger.log('Disconnected from server.');
      this.status = this.authFailureDetected ? 'auth_failed' : 'offline';
      this.presencesReady = false;
      this.joinedRooms.clear();
      this.roomPresenceInFlight.clear();
      this.historyPreloadInFlight.clear();
      this.clearMamRegistry();
      this.clearHistoryQueue();
      this.pendingSendById.clear();
      this.isRecoveringRoomPresence = false;
      this.recoveryRoomJid = null;
      this.logStep('event:disconnect');
      if (this.pingInterval) clearInterval(this.pingInterval);
      if (this.authFailureDetected) {
        this.logStep('event:disconnect:auth-failed-no-reconnect');
        return;
      }
      if (this.reconnectSuppressed) {
        this.logStep('event:disconnect:reconnect-suppressed');
        return;
      }
      this.scheduleReconnect('event:disconnect');
    });

    this.client.on('online', async (jid) => {
      try {
        this.resource = jid.resource || 'default';
        ethoraLogger.log('Client is online.', new Date());
        this.status = 'online';
        this.authFailureDetected = false;
        this.reconnectAttempts = 0;
        this.offlineReconnectAttempts = 0;
        this.pausedDueToOfflineCap = false;
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
        try {
          const sendPresenceStart = Date.now();
          ethoraLogger.log('[XMPP] online: sendPresence:start');
          this.client.send(xml('presence'));
          ethoraLogger.log('[XMPP] online: sendPresence:done');
          ethoraLogger.log(
            `[InitTiming] online:send_presence ${Date.now() - sendPresenceStart}ms`
          );
        } catch (error) {
          console.error('[XMPP] online: sendPresence:error', formatError(error));
        }

        const allPresenceStart = Date.now();
        ethoraLogger.log('[XMPP] online: sendAllPresences:start');
        this.sendAllPresencesAndMarkReady()
          .then(() => {
            ethoraLogger.log('[XMPP] online: sendAllPresences:done');
            ethoraLogger.log(
              `[InitTiming] online:all_room_presences ${Date.now() - allPresenceStart}ms`
            );
          })
          .catch((error) => {
            console.error(
              '[XMPP] online: sendAllPresences:error',
              formatError(error)
            );
          });

        this.logStep('event:online');

        try {
          ethoraLogger.log('[XMPP] online: processQueue:start');
          await this.processQueue();
          ethoraLogger.log('[XMPP] online: processQueue:done');
        } catch (error) {
          console.error('[XMPP] online: processQueue:error', formatError(error));
        }

        try {
          ethoraLogger.log('[XMPP] online: drainHeap:start');
          await this.drainHeap();
          ethoraLogger.log('[XMPP] online: drainHeap:done');
        } catch (error) {
          console.error('[XMPP] online: drainHeap:error', formatError(error));
        }

        this.scheduleHistoryQueue();
      } catch (error) {
        console.error('XMPP client online handler error:', formatError(error));
      }
    });

    this.client.on('connecting', () => {
      ethoraLogger.log('Client is connecting...');
      this.status = 'connecting';
      this.logStep('event:connecting');
    });

    this.client.on('error', (error) => {
      const terminalAuthFailure = this.isTerminalAuthFailure(error);
      console.error('XMPP client error:', error);
      this.status = terminalAuthFailure ? 'auth_failed' : 'error';
      if (terminalAuthFailure) {
        this.authFailureDetected = true;
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
      }
      this.logStep('event:error');
      if (terminalAuthFailure) {
        this.logStep('event:error:auth-failed-no-reconnect');
        return;
      }
      if (this.reconnectSuppressed) {
        this.logStep('event:error:reconnect-suppressed');
        return;
      }
      this.scheduleReconnect('event:error');
    });

    this.client.on('stanza', (stanza) => {
      this.lastActivityTs = Date.now();
      try {
        if (this.lastPingId && isPong(stanza, this.lastPingId)) {
          this.handlePong();
        }
      } catch {
        // Ignore malformed pong checks and continue stanza handling.
      }
      const handledByMamRouter = this.routeMamStanza(stanza as Element);
      if (handledByMamRouter) {
        return;
      }
      handleStanza.bind(this, stanza, this)();
    });

    this.startAdaptivePing();

    try {
      if (typeof window !== 'undefined') {
        window.addEventListener('online', this.onBrowserOnline);
        window.addEventListener('offline', this.onBrowserOffline);
      }
    } catch {
      // Ignore browser event binding failures in non-browser runtimes.
    }
  }

  private scheduleAdaptivePing() {
    if (this.idlePingTimeout) clearTimeout(this.idlePingTimeout);

    const idleTime = this.idleThresholdMs;
    const pongWait = Math.max(this.pongTimeoutMs, 4000);

    this.idlePingTimeout = setTimeout(() => {
      if (this.status !== 'online' || this.pingInFlight) return;

      this.pingInFlight = true;
      const pingId = sendPing(this.client, this.host);
      this.lastPingId = pingId;

      let pongReceived = false;

      const pongListener = (stanza: any) => {
        if (isPong(stanza, pingId)) {
          pongReceived = true;
          if (this.pingTimeout) clearTimeout(this.pingTimeout);
          this.client.removeListener('stanza', pongListener);
          this.lastPingId = null;
          this.pingInFlight = false;
          this.markActivity();
        }
      };

      this.client.on('stanza', pongListener);

      this.pingTimeout = setTimeout(async () => {
        if (!pongReceived) {
          this.client.removeListener('stanza', pongListener);
          this.lastPingId = null;
          this.pingInFlight = false;
          console.warn('Ping timeout, scheduling reconnect...');
          this.scheduleReconnect('ping-timeout');
        }
      }, pongWait);
    }, idleTime);
  }

  private startAdaptivePing() {
    if (this.idlePingTimeout) {
      clearTimeout(this.idlePingTimeout);
    }

    this.idlePingTimeout = setTimeout(() => {
      if (this.status === 'online') {
        this.pingInFlight = true;
        const pingId = sendPing(this.client, this.host);
        this.lastPingId = pingId;

        this.pingTimeout = setTimeout(() => {
          this.handlePingTimeout();
          this.pingInFlight = false;
        }, this.pongTimeoutMs);

        const pongListener = (stanza: any) => {
          if (isPong(stanza, pingId)) {
            if (this.pingTimeout) clearTimeout(this.pingTimeout);
            this.lastPingId = null;
            this.pingInFlight = false;
            this.client.removeListener('stanza', pongListener);
            this.markActivity();
          }
        };
        this.client.on('stanza', pongListener);
      }
    }, this.idleThresholdMs);
  }

  private markActivity() {
    this.lastActivityTs = Date.now();
    this.scheduleAdaptivePing();
  }

  async sendAllPresencesAndMarkReady() {
    this.presencesReady = false;
    const start = Date.now();
    let summary: AllRoomPresenceSummary = {
      total: 0,
      success: 0,
      failed: 0,
      failedRooms: [] as string[],
      failures: [],
    };
    try {
      summary = await this.allRoomPresencesStanza();
    } catch (error) {
      console.warn(
        `[XMPP] allRoomPresences fallback reason=${formatError(error)}`
      );
    }
    if (summary.total > 0) {
      const allRooms = Object.keys(store.getState().rooms.rooms || {});
      allRooms.forEach((jid) => {
        if (!summary.failedRooms.includes(jid)) {
          this.joinedRooms.add(jid);
        }
      });
    }
    ethoraLogger.log(`[InitTiming] xmpp:allRoomPresences ${Date.now() - start}ms`);
    ethoraLogger.log(
      `[XMPP] allRoomPresences summary total=${summary.total} success=${summary.success} failed=${summary.failed}`
    );
    if (summary.failed > 0 && summary.failures?.length) {
      const topFailures = summary.failures.slice(0, 3);
      const text = topFailures
        .map((item) => `${item.roomJid}:${item.reason}`)
        .join(' | ');
      console.warn(`[XMPP] allRoomPresences failures_top3=${text}`);
    }
    this.presencesReady = true;
  }

  async reconnect() {
    this.presencesReady = false;

    if (this.reconnecting) {
      return this.reconnectPromise;
    }
    if (this.authFailureDetected || this.status === 'auth_failed') {
      this.logStep('reconnect:skip-auth-failed');
      return Promise.resolve();
    }
    if (this.reconnectSuppressed) {
      this.logStep('reconnect:skip-suppressed');
      return Promise.resolve();
    }
    if (!this.isBrowserOnline()) {
      this.logStep('reconnect:skipped-offline');
      return Promise.resolve();
    }
    if (this.pausedDueToOfflineCap) {
      this.logStep('reconnect:paused-due-to-cap');
      return Promise.resolve();
    }
    this.reconnecting = true;
    this.reconnectPromise = (async () => {
      try {
        this.logStep('reconnect:start');
        await this.disconnect();
        await this.initializeClient();
      } finally {
        this.reconnecting = false;
        this.reconnectPromise = null;
        this.logStep('reconnect:end');
      }
    })();
    return this.reconnectPromise;
  }

  async allRoomPresencesStanza(): Promise<AllRoomPresenceSummary> {
    const start = Date.now();
    try {
      const summary = await allRoomPresences(this.client);
      ethoraLogger.log(
        `[InitTiming] xmpp:allRoomPresencesStanza ${Date.now() - start}ms`
      );
      return summary;
    } catch (error) {
      console.warn(
        `[XMPP] allRoomPresencesStanza:error ${formatError(error)}`
      );
      return {
        total: 0,
        success: 0,
        failed: 0,
        failedRooms: [],
        failures: [],
      };
    }
  }

  async ensureConnected(timeout: number = 10000): Promise<void> {
    if (this.status === 'online') {
      return;
    }

    if (this.status === 'auth_failed') {
      throw new Error('XMPP authentication failed');
    }

    if (this.status === 'offline' || this.status === 'error') {
      this.logStep(`ensureConnected:trigger-reconnect:${this.status}`);
      this.scheduleReconnect('ensure-connected');
      throw new Error('Not connected');
    }

    if (this.status === 'connecting') {
      await new Promise<void>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(
            new Error('Connection timeout while waiting for XMPP connection')
          );
        }, timeout);

        const checkStatus = () => {
          if (this.status === 'online') {
            clearTimeout(timeoutId);
            resolve();
          } else if (
            this.status === 'error' ||
            this.status === 'offline' ||
            this.status === 'auth_failed'
          ) {
            clearTimeout(timeoutId);
            reject(new Error('Connection error while waiting'));
          } else {
            setTimeout(checkStatus, 500);
          }
        };

        checkStatus();
      });
    }
  }

  async close() {
    if (this.client) {
      this.status = 'offline';
      try {
        await this.client.stop();
        if (
          this.endpointKey &&
          XmppClient.activeByEndpoint.get(this.endpointKey) === this
        ) {
          XmppClient.activeByEndpoint.delete(this.endpointKey);
        }
        this.client = null;
        ethoraLogger.log('Client connection closed.');
      } catch (error) {
        console.error('Error closing the client:', error);
      }
    }
  }

  async wrapWithConnectionCheck<T>(operation: () => Promise<T>): Promise<T> {
    try {
      await this.ensureConnected();
      return await operation();
    } catch (error) {
      if (error) {
        ethoraLogger.error('Operation failed due to connection issues:', error);
      }
      throw error;
    }
  }

  private clearMamRegistry() {
    this.mamRequestRegistry.forEach((entry) => {
      clearTimeout(entry.timeout);
      entry.resolve(undefined);
    });
    this.mamRequestRegistry.clear();
  }

  private clearHistoryQueue() {
    this.historyQueue.forEach((task) => task.resolve(undefined));
    this.historyQueue = [];
    this.historyQueueInFlight = 0;
    this.historyQueueInFlightHigh = 0;
    this.historyQueueWorkerScheduled = false;
  }

  private getRoomEpoch(roomJID: string): number {
    return this.roomHistoryEpoch.get(roomJID) || 0;
  }

  private getHistoryPriority(source: HistorySource): HistoryPriority {
    if (source === 'active') return 0;
    if (source === 'send_ack') return 1;
    if (source === 'background') return 2;
    return 1;
  }

  private nextHistoryTaskId() {
    return `get-history:${Date.now().toString()}:${Math.random().toString(16).slice(2, 8)}`;
  }

  private scheduleHistoryQueue() {
    if (this.historyQueueWorkerScheduled) return;
    this.historyQueueWorkerScheduled = true;
    setTimeout(() => {
      this.historyQueueWorkerScheduled = false;
      this.processHistoryQueue().catch(() => {});
    }, 0);
  }

  private pickNextHistoryTask(): HistoryQueueTask | null {
    if (this.historyQueue.length === 0) return null;
    const now = Date.now();
    const backgroundPausedUntil = Math.max(
      this.criticalSendUntil,
      this.activeRoomBoostUntil
    );
    const runnable = this.historyQueue
      .filter((task) => !(task.priority === 2 && now < backgroundPausedUntil))
      .sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        if (a.priority === 2 && b.priority === 2) {
          const scoreA = getRoomLastActivityScore(
            store.getState().rooms.rooms?.[a.chatJID]
          );
          const scoreB = getRoomLastActivityScore(
            store.getState().rooms.rooms?.[b.chatJID]
          );
          if (scoreA !== scoreB) return scoreB - scoreA;
        }
        return a.queuedAt - b.queuedAt;
      });

    if (runnable.length === 0) return null;
    const task = runnable[0];
    this.historyQueue = this.historyQueue.filter((q) => q.id !== task.id);
    return task;
  }

  private async processHistoryQueue(): Promise<void> {
    if (this.status !== 'online') return;

    while (true) {
      const hasHighPending = this.historyQueue.some((task) => task.priority <= 1);
      const canRunRegular = this.historyQueueInFlight < this.maxInFlightHistory;
      const canRunHighBypass = hasHighPending && this.historyQueueInFlightHigh < 1;
      if (!canRunRegular && !canRunHighBypass) break;

      const task = this.pickNextHistoryTask();
      if (!task) break;
      if (!canRunRegular && task.priority === 2) break;

      this.historyQueueInFlight += 1;
      if (task.priority <= 1) {
        this.historyQueueInFlightHigh += 1;
      }
      const queueWaitMs = Date.now() - task.queuedAt;
      ethoraLogger.log(
        `[XMPP] queue_wait_ms_by_priority priority=${task.priority} room=${task.chatJID} wait=${queueWaitMs}`
      );
      ethoraLogger.log(
        `[XMPP] history_inflight_count count=${this.historyQueueInFlight}`
      );

      this.executeHistoryTask(task)
        .catch(() => {})
        .finally(() => {
          this.historyQueueInFlight = Math.max(0, this.historyQueueInFlight - 1);
          if (task.priority <= 1) {
            this.historyQueueInFlightHigh = Math.max(
              0,
              this.historyQueueInFlightHigh - 1
            );
          }
          ethoraLogger.log(
            `[XMPP] history_inflight_count count=${this.historyQueueInFlight}`
          );
          this.scheduleHistoryQueue();
        });
    }
  }

  private async executeHistoryTask(
    task: HistoryQueueTask
  ): Promise<void> {
    try {
      if (this.status !== 'online') {
        task.resolve(undefined);
        return;
      }

      if (task.priority <= 1) {
        const isActiveRoomTask = task.priority === 0;
        await this.ensureRoomPresence(task.chatJID, {
          settleDelay: 0,
          timeoutMs: isActiveRoomTask ? 5000 : 1200,
          waitForJoin: isActiveRoomTask,
          source: isActiveRoomTask ? 'active_room' : 'send',
        }).catch(() => {});
      }

      const messages = await this.requestMamHistory(
        task.chatJID,
        task.max,
        task.before,
        task.id
      );

      const currentEpoch = this.getRoomEpoch(task.chatJID);
      if (task.source === 'background' && task.epoch !== currentEpoch) {
        const currentMessages =
          store.getState().rooms.rooms?.[task.chatJID]?.messages || [];
        task.resolve(currentMessages);
        return;
      }

      if (messages && messages.length > 0) {
        store.dispatch(
          setRoomMessages({
            roomJID: task.chatJID,
            messages,
          })
        );
      }

      task.resolve(messages);
    } catch {
      task.resolve(undefined);
    }
  }

  private async parseMamMessages(messages: Element[]): Promise<IMessage[]> {
    const parsed: IMessage[] = [];
    for (const msg of messages) {
      const reactions = msg?.getChild('reactions');
      const text = msg.getChild('body')?.getText();
      if (!text && !reactions) continue;

      const { data, id, body, ...rest } = await getDataFromXml(msg as any);
      if (!data) continue;
      const message = await createMessageFromXml({
        data,
        id,
        body,
        ...rest,
      });
      parsed.push(message);
    }
    return parsed;
  }

  private routeMamStanza(stanza: Element): boolean {
    if (stanza?.is?.('message')) {
      const result = stanza.getChild('result');
      const queryId = result?.attrs?.queryid;
      if (!queryId) return false;

      const request = this.mamRequestRegistry.get(queryId);
      if (!request) return false;

      const messageEl = result?.getChild('forwarded')?.getChild('message');
      if (messageEl) {
        request.messages.push(messageEl as Element);
      }
      return true;
    }

    if (stanza?.is?.('iq')) {
      const requestId = stanza?.attrs?.id;
      if (!requestId) return false;
      const request = this.mamRequestRegistry.get(requestId);
      if (!request) return false;

      if (stanza.attrs.type === 'result') {
        clearTimeout(request.timeout);
        this.mamRequestRegistry.delete(requestId);
        this.parseMamMessages(request.messages)
          .then((messages) => {
            request.resolve(messages);
          })
          .catch(() => {
            request.resolve(undefined);
          });
        return true;
      }

      if (stanza.attrs.type === 'error') {
        clearTimeout(request.timeout);
        this.mamRequestRegistry.delete(requestId);
        request.resolve(undefined);
        return true;
      }
    }

    return false;
  }

  private requestMamHistory(
    chatJID: string,
    max: number,
    before: number | undefined,
    requestId: string
  ): Promise<IMessage[] | undefined> {
    if (!chatJID) return Promise.resolve(undefined);
    const fixedChatJid = chatJID.includes('@')
      ? chatJID
      : `${chatJID}@conference.dev.xmpp.ethoradev.com`;

    return new Promise<IMessage[] | undefined>((resolve) => {
      const timeout = setTimeout(() => {
        this.mamRequestRegistry.delete(requestId);
        resolve(undefined);
      }, 10000);

      this.mamRequestRegistry.set(requestId, {
        id: requestId,
        chatJID: fixedChatJid,
        messages: [],
        startedAt: Date.now(),
        timeout,
        resolve,
      });

      const message = xml(
        'iq',
        {
          type: 'set',
          to: fixedChatJid,
          id: requestId,
        },
        xml(
          'query',
          { xmlns: 'urn:xmpp:mam:2', queryid: requestId },
          xml(
            'set',
            { xmlns: 'http://jabber.org/protocol/rsm' },
            xml('max', {}, max.toString()),
            before ? xml('before', {}, before.toString()) : xml('before')
          )
        )
      );

      this.client.send(message).catch(() => {
        clearTimeout(timeout);
        this.mamRequestRegistry.delete(requestId);
        resolve(undefined);
      });
    });
  }

  promoteRoomHistory(roomJID: string): void {
    if (!roomJID) return;
    const currentEpoch = this.getRoomEpoch(roomJID);
    this.roomHistoryEpoch.set(roomJID, currentEpoch + 1);
    this.activeRoomBoostUntil = Date.now() + this.activeRoomBoostTtlMs;
    this.historyQueue = this.historyQueue.map((task) =>
      task.chatJID === roomJID
        ? {
            ...task,
            priority: 0,
            source: task.source === 'background' ? 'active' : task.source,
          }
        : task
    );
    this.scheduleHistoryQueue();
  }

  onCriticalSend(roomJID: string, messageId?: string): void {
    this.criticalSendUntil = Date.now() + this.softPauseAfterSendMs;
    this.promoteRoomHistory(roomJID);
    if (messageId) {
      this.sendStartedAtById.set(messageId, Date.now());
      const pending = this.pendingSendIdsByRoom.get(roomJID) || new Set<string>();
      pending.add(messageId);
      this.pendingSendIdsByRoom.set(roomJID, pending);
    }
    this.scheduleHistoryQueue();
  }

  acknowledgeSentMessage(roomJID: string, messageId?: string): void {
    if (!roomJID || !messageId) return;
    const startedAt = this.sendStartedAtById.get(messageId);
    if (startedAt) {
      const elapsed = Date.now() - startedAt;
      ethoraLogger.log(
        `[XMPP] send_click_to_echo_ms id=${messageId} room=${roomJID} ms=${elapsed}`
      );
      this.sendStartedAtById.delete(messageId);
    }

    const pending = this.pendingSendIdsByRoom.get(roomJID);
    if (!pending) return;
    pending.delete(messageId);
    if (pending.size === 0) {
      this.pendingSendIdsByRoom.delete(roomJID);
      if (this.pendingSendIdsByRoom.size === 0) {
        this.criticalSendUntil = Date.now();
        this.scheduleHistoryQueue();
      }
    } else {
      this.pendingSendIdsByRoom.set(roomJID, pending);
    }
  }

  enqueueHistoryTask(params: {
    chatJID: string;
    max: number;
    before?: number;
    id?: string;
    source?: HistorySource;
  }): Promise<IMessage[] | undefined> {
    const source = params.source || 'default';
    const taskId = params.id || this.nextHistoryTaskId();
    const priority = this.getHistoryPriority(source);
    const epoch = this.getRoomEpoch(params.chatJID);

    return new Promise<IMessage[] | undefined>((resolve) => {
      this.historyQueue.push({
        id: taskId,
        chatJID: params.chatJID,
        max: params.max,
        before: params.before,
        source,
        priority,
        epoch,
        queuedAt: Date.now(),
        resolve,
      });
      if (source === 'background') {
        const orderPreview = this.historyQueue
          .filter((task) => task.source === 'background')
          .map((task) => ({
            jid: task.chatJID,
            activityScore: getRoomLastActivityScore(
              store.getState().rooms.rooms?.[task.chatJID]
            ),
          }))
          .sort((a, b) => b.activityScore - a.activityScore);
        ethoraLogger.log('[XMPP] history_queue_order', orderPreview);
      }
      this.scheduleHistoryQueue();
    });
  }

  private enqueue(
    task: () => Promise<boolean>,
    id?: string,
    roomJid?: string
  ): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      if (id) {
        const existing = this.pendingSendById.get(id);
        if (existing && (existing.state === 'queued' || existing.state === 'sending')) {
          resolve(true);
          return;
        }
        this.pendingSendById.set(id, { state: 'queued', roomJid });
      }

      this.messageQueue.push({
        id,
        roomJid,
        createdAt: Date.now(),
        attempts: 0,
        state: 'queued',
        task: async () => {
          try {
            const res = await task();
            if (id && res) {
              this.pendingSendById.set(id, { state: 'sent_echoed', roomJid });
            }
            if (id && !res) {
              this.pendingSendById.set(id, { state: 'failed', roomJid });
            }
            resolve(res);
            return res;
          } catch (e) {
            if (id) {
              this.pendingSendById.set(id, { state: 'failed', roomJid });
            }
            resolve(false);
            return false;
          }
        },
      });

      this.processQueue().catch(() => {});
    });
  }

  private async processQueue(): Promise<void> {
    if (this.processingQueue) return;
    this.processingQueue = true;
    try {
      while (this.messageQueue.length > 0) {
        if (this.status !== 'online') {
          if (!this.reconnectTimer) {
            this.scheduleReconnect('queue-not-online');
          }
          break;
        }
        const nextEntry = this.messageQueue[0];
        if (!nextEntry) break;
        nextEntry.state = 'sending';
        nextEntry.attempts += 1;
        this.currentlyProcessingQueueId = nextEntry.id || null;
        if (nextEntry.id) {
          this.pendingSendById.set(nextEntry.id, {
            state: 'sending',
            roomJid: nextEntry.roomJid,
          });
        }
        const okRaw = await nextEntry.task();
        this.currentlyProcessingQueueId = null;
        const ok = okRaw !== false;
        if (ok) {
          if (nextEntry.id) {
            this.pendingSendById.delete(nextEntry.id);
          }
          if (nextEntry.createdAt) {
            const waitMs = Date.now() - nextEntry.createdAt;
            ethoraLogger.log(
              `[XMPP] send_wait_ms id=${nextEntry.id || 'unknown'} room=${nextEntry.roomJid || 'unknown'} wait=${waitMs}`
            );
          }
          this.messageQueue.shift();
        } else {
          nextEntry.state = 'failed';
          if (nextEntry.id) {
            this.pendingSendById.set(nextEntry.id, {
              state: 'failed',
              roomJid: nextEntry.roomJid,
            });
          }
          break;
        }
      }
    } finally {
      this.currentlyProcessingQueueId = null;
      this.processingQueue = false;
    }

    if (this.messageQueue.length > 0) {
      setTimeout(() => this.processQueue().catch(() => {}), 60);
    }
  }

  private async withIdLock<T>(
    id: string | undefined,
    fn: () => Promise<T>
  ): Promise<any> {
    if (!id) return fn();
    if (this.inFlightIds.has(id)) {
      return Promise.resolve(true);
    }
    this.inFlightIds.add(id);
    try {
      const res = await fn();
      return res;
    } finally {
      this.inFlightIds.delete(id);
    }
  }

  private onBrowserOnline = () => {
    this.logStep('browser:online');
    this.offlineReconnectAttempts = 0;
    this.pausedDueToOfflineCap = false;
    this.processQueue().catch(() => {});
    this.scheduleHistoryQueue();
    if (this.reconnectSuppressed) {
      return;
    }
    if (this.status !== 'online') {
      this.scheduleReconnect('browser:online');
    }
  };

  private onBrowserOffline = () => {
    this.logStep('browser:offline');
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  };

  getConnectionSteps(): Array<{ ts: number; step: string }> {
    return [...this.connectionSteps];
  }

  private logStep(step: string) {
    this.connectionSteps.push({ ts: Date.now(), step });
    if (this.connectionSteps.length > 200) {
      this.connectionSteps.shift();
    }
  }

  getRoomsStanza = async (disableGetRooms?: boolean) => {
    return this.wrapWithConnectionCheck(async () => {
      !disableGetRooms && (await getRooms(this.client));
    });
  };

  async getRoomsPagedStanza(
    maxResults?: number,
    after?: string | null
  ): Promise<void> {
    return this.wrapWithConnectionCheck(async () => {
      await getRoomsPaged(this.client);
    });
  }

  //room functions

  async createRoomStanza(title: string, description: string) {
    return this.wrapWithConnectionCheck(async () => {
      return await createRoom(title, description, this.client);
    });
  }

  async inviteRoomRequestStanza(to: string, roomJid: string) {
    return this.wrapWithConnectionCheck(async () => {
      await inviteRoomRequest(this.client, to, roomJid);
    });
  }

  leaveTheRoomStanza = (roomJID: string) => {
    this.wrapWithConnectionCheck(async () => {
      leaveTheRoom(roomJID, this.client);
    });
  };

  private ensureRoomPresence = async (
    roomJID: string,
    options?: {
      settleDelay?: number;
      timeoutMs?: number;
      waitForJoin?: boolean;
      source?: 'active_room' | 'send' | 'background' | 'other';
    }
  ): Promise<boolean> => {
    if (!roomJID) return true;
    if (this.joinedRooms.has(roomJID)) return true;

    const settleDelay = options?.settleDelay ?? 0;
    const timeoutMs = options?.timeoutMs ?? 2000;
    const waitForJoin = options?.waitForJoin ?? true;
    const source = options?.source || 'other';

    const existing = this.roomPresenceInFlight.get(roomJID);
    if (existing) {
      if (waitForJoin) {
        return existing;
      }
      return true;
    }

    const promise = this.wrapWithConnectionCheck(async () => {
      await presenceInRoom(this.client, roomJID, settleDelay, timeoutMs);
      this.joinedRooms.add(roomJID);
      return true;
    })
      .catch(async (error) => {
        console.warn(
          `[XMPP] room_presence_failed room=${roomJID} source=${source} error=${formatError(error)}`
        );
        return false;
      })
      .finally(() => {
        this.roomPresenceInFlight.delete(roomJID);
      });

    this.roomPresenceInFlight.set(roomJID, promise);
    if (waitForJoin) {
      return promise;
    }
    return true;
  };

  presenceInRoomStanza = async (
    roomJID: string,
    settleDelay = 0,
    timeoutMs = 2000,
    waitForJoin = true
  ): Promise<boolean> => {
    return this.ensureRoomPresence(roomJID, {
      settleDelay,
      timeoutMs,
      waitForJoin,
      source: 'other',
    });
  };

  prioritizeRoomPresence = async (roomJID: string): Promise<boolean> => {
    return this.ensureRoomPresence(roomJID, {
      settleDelay: 0,
      timeoutMs: 900,
      waitForJoin: false,
      source: 'active_room',
    });
  };

  getHistoryStanza = async (
    chatJID: string,
    max: number,
    before?: number,
    otherStanzaId?: string,
    options?: {
      coalesceRoom?: boolean;
      skipIfPreloaded?: boolean;
      source?: HistorySource;
    }
  ) => {
    if (options?.skipIfPreloaded) {
      const currentRoom = store.getState().rooms.rooms?.[chatJID];
      if (currentRoom?.historyPreloadState === 'done' && currentRoom?.messages?.length) {
        return currentRoom.messages;
      }
    }

    if (options?.coalesceRoom) {
      const inFlight = this.historyPreloadInFlight.get(chatJID);
      if (inFlight) {
        return inFlight;
      }
    }

    const requestPromise = this.enqueueHistoryTask({
      chatJID,
      max,
      before,
      id: otherStanzaId,
      source: options?.source || 'default',
    });

    if (options?.coalesceRoom) {
      this.historyPreloadInFlight.set(chatJID, requestPromise);
      return requestPromise.finally(() => {
        this.historyPreloadInFlight.delete(chatJID);
      });
    }

    return await requestPromise;
  };

  getLastMessageArchiveStanza(roomJID: string) {
    this.wrapWithConnectionCheck(async () => {
      getLastMessage(this.client, roomJID);
    });
  }

  setRoomImageStanza = (
    roomJid: string,
    roomThumbnail: string,
    type: string,
    roomBackground?: string
  ) => {
    this.wrapWithConnectionCheck(async () => {
      setRoomImage(roomJid, roomThumbnail, type, this.client, roomBackground);
    });
  };

  getRoomInfoStanza = (roomJID: string) => {
    this.wrapWithConnectionCheck(async () => {
      getRoomInfo(roomJID, this.client);
    });
  };

  getRoomMembersStanza = (roomJID: string) => {
    this.wrapWithConnectionCheck(async () => {
      getRoomMembers(roomJID, this.client);
    });
  };

  setVCardStanza(xmppUsername: string) {
    this.wrapWithConnectionCheck(async () => {
      setVcard(xmppUsername, this.client);
    });
  }

  //messages
  async sendMessageWithPingCheck(
    sendFn: () => Promise<boolean>
  ): Promise<boolean> {
    this.markActivity();

    try {
      return await sendFn();
    } catch {
      return false;
    }
  }

  sendMessage = (
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
  ): Promise<boolean> => {
    this.onCriticalSend(roomJID, customId);
    return this.enqueue(async () => {
      return this.withIdLock(customId, async () => {
        return this.sendMessageWithPingCheck(async () => {
          if (this.status !== 'online') {
            throw new Error('not_online');
          }
          // Short join attempt; if it times out, continue with optimistic send and keep joining in background.
          const joined = await this.ensureRoomPresence(roomJID, {
            settleDelay: 0,
            timeoutMs: 900,
            waitForJoin: true,
            source: 'send',
          });
          if (!joined) {
            this.prioritizeRoomPresence(roomJID).catch(() => {});
          }
          return this.wrapWithConnectionCheck(async () => {
            return sendTextMessage(
              this.client,
              roomJID,
              firstName,
              lastName,
              photo,
              walletAddress,
              userMessage,
              notDisplayedValue,
              isReply,
              showInChannel,
              mainMessage,
              this.devServer || `wss://'xmpp.ethoradev.com:5443'/ws`,
              customId
            );
          });
        });
      });
    }, customId, roomJID);
  };

  sendTextMessageWithTranslateTagStanza = (
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
    langSource?: Iso639_1Codes,
    customId?: string
  ): Promise<boolean> => {
    this.onCriticalSend(roomJID, customId);
    return this.enqueue(async () => {
      return this.withIdLock(customId, async () => {
        return this.sendMessageWithPingCheck(async () => {
          if (this.status !== 'online') {
            throw new Error('not_online');
          }
          const joined = await this.ensureRoomPresence(roomJID, {
            settleDelay: 0,
            timeoutMs: 900,
            waitForJoin: true,
            source: 'send',
          });
          if (!joined) {
            this.prioritizeRoomPresence(roomJID).catch(() => {});
          }
          return this.wrapWithConnectionCheck(async () => {
            return sendTextMessageWithTranslateTag(
              this.client,
              {
                roomJID,
                firstName,
                lastName,
                photo,
                walletAddress,
                userMessage,
                notDisplayedValue,
                isReply,
                showInChannel,
                mainMessage,
                devServer: this.devServer || 'xmpp.ethoradev.com:5443',
              },
              langSource,
              customId
            );
          });
        });
      });
    }, customId, roomJID);
  };

  deleteMessageStanza(room: string, msgId: string) {
    this.wrapWithConnectionCheck(async () => {
      deleteMessage(this.client, room, msgId);
    });
  }

  editMessageStanza(room: string, msgId: string, text: string) {
    this.wrapWithConnectionCheck(async () => {
      editMessage(this.client, room, msgId, text);
    });
  }

  sendMessageReactionStanza(
    messageId: string,
    roomJid: string,
    reactionsList: string[],
    reactionSymbol?: any
  ) {
    this.wrapWithConnectionCheck(async () => {
      sendMessageReaction(
        this.client,
        messageId,
        roomJid,
        reactionsList,
        reactionSymbol
      );
    });
  }

  sendTypingRequestStanza(chatId: string, fullName: string, start: boolean) {
    this.wrapWithConnectionCheck(async () => {
      sendTypingRequest(this.client, chatId, fullName, start);
    });
  }

  getChatsPrivateStoreRequestStanza = async () => {
    return this.wrapWithConnectionCheck(async () => {
      try {
        return await getChatsPrivateStoreRequest(this.client);
      } catch (error) {
        ethoraLogger.log('error getChatsPrivateStoreRequest', error);
        return null;
      }
    });
  };

  async actionSetTimestampToPrivateStoreStanza(
    chatId: string,
    timestamp: number,
    chats?: string[]
  ) {
    return this.wrapWithConnectionCheck(async () => {
      try {
        await actionSetTimestampToPrivateStore(
          this.client,
          chatId,
          timestamp,
          chats
        );
      } catch (error) {
        // Best-effort private store sync should not break the caller.
      }
    });
  }

  async createPrivateRoomStanza(
    title: string,
    description: string,
    to: string
  ) {
    return this.wrapWithConnectionCheck(async () => {
      return await createPrivateRoom(title, description, to, this.client);
    });
  }

  sendMediaMessageStanza(roomJID: string, data: any, id: string) {
    this.onCriticalSend(roomJID, id);
    this.enqueue(async () => {
      return this.withIdLock(id, async () => {
        if (this.status !== 'online') {
          return true;
        }
        return this.wrapWithConnectionCheck(async () => {
          sendMediaMessage(this.client, roomJID, data, id);
        }).then(() => true);
      });
    }, id, roomJID);
  }

  async recoverRoomPresenceOnly(roomJID: string): Promise<boolean> {
    if (!roomJID) return false;
    if (this.isRecoveringRoomPresence && this.recoveryRoomJid === roomJID) {
      return false;
    }

    this.isRecoveringRoomPresence = true;
    this.recoveryRoomJid = roomJID;
    ethoraLogger.log(
      `[XMPP] recover:start room=${roomJID}`
    );

    try {
      const joined = await this.ensureRoomPresence(roomJID, {
        settleDelay: 0,
        timeoutMs: 1200,
        waitForJoin: true,
        source: 'send',
      });
      if (joined) {
        ethoraLogger.log(`[XMPP] recover:presence_ok room=${roomJID}`);
      } else {
        console.warn(`[XMPP] recover:presence_failed room=${roomJID}`);
      }
      return joined;
    } catch (error) {
      console.warn(
        `[XMPP] recover:error room=${roomJID} error=${formatError(error)}`
      );
      return false;
    } finally {
      this.isRecoveringRoomPresence = false;
      this.recoveryRoomJid = null;
      this.processQueue().catch(() => {});
      ethoraLogger.log('[XMPP] recover:queue_resume');
    }
  }

  sendPingStanza() {
    if (!this.client || this.status !== 'online') return;
    const pingId = sendPing(this.client, this.host);
    this.lastPingId = pingId;
    if (this.pingTimeout) clearTimeout(this.pingTimeout);
    this.pingTimeout = setTimeout(() => {}, this.pongTimeoutMs);
  }

  handlePong() {
    if (this.pingTimeout) {
      clearTimeout(this.pingTimeout);
      this.pingTimeout = null;
    }
    this.lastPingId = null;
  }

  handlePingTimeout() {
    console.warn('No pong received, forcing reconnect...');
    this.scheduleReconnect('ping-timeout');
  }

  private async drainHeap(): Promise<void> {
    try {
      const state = store.getState();
      const heap = (state as any)?.roomHeapSlice?.messageHeap as IMessage[];
      if (!heap || heap.length === 0) return;

      const start = Date.now();
      for (const msg of heap) {
        const isTranslate = !!msg.langSource;
        const firstName = (msg.user as any)?.firstName || '';
        const lastName = (msg.user as any)?.lastName || '';
        const wallet = (msg.user as any)?.walletAddress || '';

        if (isTranslate) {
          const ok = await this.sendTextMessageWithTranslateTagStanza(
            msg.roomJid,
            firstName,
            lastName,
            '',
            wallet,
            msg.body,
            '',
            !!msg.isReply,
            (msg.showInChannel as any) === 'true',
            msg.mainMessage,
            (msg as any).langSource as any,
            msg.id
          );
          if (ok === false) break;
        } else {
          const ok = await this.sendMessage(
            msg.roomJid,
            firstName,
            lastName,
            '',
            wallet,
            msg.body,
            '',
            !!msg.isReply,
            (msg.showInChannel as any) === 'true',
            msg.mainMessage,
            msg.id
          );
          if (ok === false) break;
        }
      }
      store.dispatch({ type: 'roomHeapStore/clearHeap' });
      ethoraLogger.log(`[InitTiming] xmpp:drainHeap ${Date.now() - start}ms`);
    } catch {
      // Ignore heap drain failures; pending messages stay queued for retry.
    }
  }

  private isBrowserOnline(): boolean {
    try {
      if (typeof navigator !== 'undefined' && 'onLine' in navigator) {
        return (navigator as any).onLine !== false;
      }
    } catch {
      // Fall back to optimistic online mode if navigator is unavailable.
    }
    return true;
  }

  private scheduleReconnect(reason: string) {
    if (this.status === 'online') return;
    if (this.reconnectSuppressed) {
      this.logStep(`scheduleReconnect:skip-suppressed:${reason}`);
      return;
    }
    if (this.authFailureDetected || this.status === 'auth_failed') {
      this.logStep(`scheduleReconnect:skip-auth-failed:${reason}`);
      return;
    }
    if (this.reconnectTimer) return;
    if (!this.isBrowserOnline()) {
      this.logStep(`scheduleReconnect:skip-offline:${reason}`);
      return;
    }
    if (this.pausedDueToOfflineCap) {
      this.logStep(`scheduleReconnect:paused-cap:${reason}`);
      return;
    }

    if (this.offlineReconnectAttempts >= this.maxOfflineReconnectAttempts) {
      this.pausedDueToOfflineCap = true;
      this.logStep(`scheduleReconnect:cap-reached:${reason}`);
      return;
    }

    const attempt = this.offlineReconnectAttempts + 1;
    const delay = Math.min(this.reconnectBaseDelayMs * attempt, 10000);
    this.logStep(`scheduleReconnect:${reason}:in:${delay}`);
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      if (!this.isBrowserOnline() || this.pausedDueToOfflineCap) {
        return;
      }
      this.offlineReconnectAttempts += 1;
      await this.reconnect();
    }, delay);
  }
}

export default XmppClient;
