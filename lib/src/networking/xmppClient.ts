import xmpp, { Client, xml } from '@xmpp/client';
import { sendMediaMessage } from './xmpp/sendMediaMessage.xmpp';
import { getChatsPrivateStoreRequest } from './xmpp/getChatsPrivateStoreRequest.xmpp';
import { actionSetTimestampToPrivateStore } from './xmpp/actionSetTimestampToPrivateStore.xmpp';
import { sendTypingRequest } from './xmpp/sendTypingRequest.xmpp';
import { getHistory } from './xmpp/getHistory.xmpp';
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
import { allRoomPresences } from './xmpp/allRoomPresences.xmpp';
import { sendPing } from './xmpp/sendPing.xmpp';
import { isPong } from './xmpp/handlePong.xmpp';
import { store } from '../roomStore';
import { IMessage } from '../types/types';

export class XmppClient implements XmppClientInterface {
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

  private messageQueue: Array<() => Promise<boolean>> = [];
  private inFlightIds: Set<string> = new Set();
  private processingQueue: boolean = false;

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
    this.initializeClient();
  }

  async initializeClient() {
    try {
      this.logStep('initializeClient:start');

      if (this.client) {
        this.logStep('initializeClient:disconnect-previous');
        await this.disconnect();
      }
      const url = this.devServer || `wss://xmpp.ethoradev.com:5443/ws`;

      this.host = url.match(/wss:\/\/([^:/]+)/)?.[1] || '';
      this.conference = `conference.${this.host}`;
      console.log('+-+-+-+-+-+-+-+-+ ', { username: this.username });
      this.devServer = url;

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

  async disconnect() {
    if (!this.client) return;
    try {
      if (this.pingInterval) clearInterval(this.pingInterval);
      if (this.pingTimeout) clearTimeout(this.pingTimeout);
      try {
        if (typeof window !== 'undefined') {
          window.removeEventListener('online', this.onBrowserOnline);
          window.removeEventListener('offline', this.onBrowserOffline);
        }
      } catch {}
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
        console.log('err', e);
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
      console.log('Client disconnected');
    } catch (error) {
      console.error('Error disconnecting client:', error);
    }
  }

  attachEventListeners() {
    this.client.on('disconnect', () => {
      console.log('Disconnected from server.');
      this.status = 'offline';
      this.presencesReady = false;
      this.logStep('event:disconnect');
      if (this.pingInterval) clearInterval(this.pingInterval);
    });

    this.client.on('online', async (jid) => {
      try {
        this.resource = jid.resource || 'default';
        console.log('Client is online.', new Date());
        this.status = 'online';
        this.reconnectAttempts = 0;
        this.client.send(xml('presence'));
        await this.sendAllPresencesAndMarkReady();
        this.logStep('event:online');
        this.processQueue().catch(() => {});

        await this.drainHeap();
      } catch (error) {
        console.log('Error', error);
      }
    });

    this.client.on('connecting', () => {
      console.log('Client is connecting...');
      this.status = 'connecting';
      this.logStep('event:connecting');
    });

    this.client.on('error', (error) => {
      console.error('XMPP client error:', error);
      this.status = 'error';
      this.logStep('event:error');
    });

    this.client.on('stanza', (stanza) => {
      this.lastActivityTs = Date.now();
      try {
        if (this.lastPingId && isPong(stanza, this.lastPingId)) {
          this.handlePong();
        }
      } catch {}
      handleStanza.bind(this, stanza, this)();
    });

    this.startAdaptivePing();

    try {
      if (typeof window !== 'undefined') {
        window.addEventListener('online', this.onBrowserOnline);
        window.addEventListener('offline', this.onBrowserOffline);
      }
    } catch {}
  }

  private scheduleAdaptivePing() {
    if (this.idlePingTimeout) clearTimeout(this.idlePingTimeout);

    const idleTime = 2000;
    const pongWait = 2000;

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
          console.warn('Ping timeout, reconnecting...');
          await this.reconnect();
          await this.drainHeap();
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
    await this.allRoomPresencesStanza();
    this.presencesReady = true;
  }

  async reconnect() {
    this.presencesReady = false;

    if (this.reconnecting) {
      return this.reconnectPromise;
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

  async allRoomPresencesStanza() {
    await allRoomPresences(this.client);
  }

  async ensureConnected(timeout: number = 10000): Promise<void> {
    if (this.status === 'online') {
      return;
    }

    if (this.status === 'offline' || this.status === 'error') {
      this.logStep(`ensureConnected:trigger-reconnect:${this.status}`);
      await this.reconnect();
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
          } else if (this.status === 'error' || this.status === 'offline') {
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
        console.log('Client connection closed.');
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
      console.error('Operation failed due to connection issues:', error);
      throw error;
    }
  }

  private enqueue(task: () => Promise<boolean>): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      this.messageQueue.push(async () => {
        try {
          const res = await task();
          resolve(res);
          return res;
        } catch (e) {
          resolve(false);
          return false;
        }
      });

      this.processQueue().catch(() => {});
    });
  }

  private async processQueue(): Promise<void> {
    if (this.processingQueue) return;
    this.processingQueue = true;
    try {
      while (this.messageQueue.length > 0) {
        try {
          await this.ensureConnected();
        } catch (e) {
          break;
        }
        const next = this.messageQueue[0];
        if (!next) break;
        const okRaw = await next();
        const ok = okRaw !== false;
        if (ok) {
          this.messageQueue.shift();
        } else {
          break;
        }
      }
    } finally {
      this.processingQueue = false;
    }

    if (this.messageQueue.length > 0) {
      setTimeout(() => this.processQueue().catch(() => {}), 1000);
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
    this.processQueue().catch(() => {});
    if (this.status !== 'online') {
      this.reconnect();
    }
  };

  private onBrowserOffline = () => {
    this.logStep('browser:offline');
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

  presenceInRoomStanza = async (roomJID: string, settleDelay = 0) => {
    return this.wrapWithConnectionCheck(async () => {
      await presenceInRoom(this.client, roomJID, settleDelay);
    });
  };

  getHistoryStanza = async (
    chatJID: string,
    max: number,
    before?: number,
    otherStanzaId?: string
  ) => {
    return this.wrapWithConnectionCheck(async () => {
      return await getHistory(this.client, chatJID, max, before, otherStanzaId);
    });
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
    sendFn: () => Promise<void>
  ): Promise<boolean> {
    this.markActivity();

    try {
      await sendFn();
      return true;
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
    return this.enqueue(async () => {
      return this.withIdLock(customId, async () => {
        return this.sendMessageWithPingCheck(async () => {
          return this.wrapWithConnectionCheck(async () => {
            sendTextMessage(
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
    });
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
    return this.enqueue(async () => {
      return this.withIdLock(customId, async () => {
        return this.sendMessageWithPingCheck(async () => {
          return this.wrapWithConnectionCheck(async () => {
            sendTextMessageWithTranslateTag(
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
    });
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
        console.log('error getChatsPrivateStoreRequest', error);
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
      } catch (error) {}
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
    this.enqueue(async () => {
      return this.withIdLock(id, async () => {
        return this.wrapWithConnectionCheck(async () => {
          sendMediaMessage(this.client, roomJID, data, id);
        }).then(() => true);
      });
    });
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
    this.reconnect();
  }

  private async drainHeap(): Promise<void> {
    try {
      const state = store.getState();
      const heap = (state as any)?.roomHeapSlice?.messageHeap as IMessage[];
      if (!heap || heap.length === 0) return;

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
    } catch {}
  }
}

export default XmppClient;
