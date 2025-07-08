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

  checkOnline() {
    return this.client && this.client.status === 'online';
  }

  pingInterval: any = null;
  pingTimeout: any = null;
  lastPingId: string | null = null;
  pingIntervalMs = 15000;
  pongTimeoutMs = 1000;
  pingOnSendEnabled: boolean = false;

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
      // --- Always disconnect previous client before creating new one ---
      if (this.client) {
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

      this.attachEventListeners();
      this.client.start().catch((error) => {
        console.error('Error starting client:', error);
      });

      this.client.send(xml('presence'));
      this.allRoomPresencesStanza();
    } catch (error) {
      console.error('Error initializing client:', error);
    }
  }

  async disconnect() {
    if (!this.client) return;
    try {
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
    });

    this.client.on('online', (jid) => {
      this.resource = jid.resource || 'default';
      console.log('Client is online.', new Date());
      this.status = 'online';
      this.reconnectAttempts = 0;
      this.client.send(xml('presence'));
      this.allRoomPresencesStanza();
    });

    this.client.on('connecting', () => {
      console.log('Client is connecting...');
      this.status = 'connecting';
    });

    this.client.on('error', (error) => {
      console.error('XMPP client error:', error);
      this.status = 'error';
    });

    this.client.on('stanza', (stanza) => {
      if (
        this.pingOnSendEnabled &&
        this.lastPingId &&
        isPong(stanza, this.lastPingId)
      ) {
        this.handlePong();
      }
      handleStanza.bind(this, stanza, this)();
    });
  }

  async reconnect() {
    if (this.reconnecting) {
      return this.reconnectPromise;
    }
    this.reconnecting = true;
    this.reconnectPromise = (async () => {
      try {
        await this.disconnect();
        await this.initializeClient();
      } finally {
        this.reconnecting = false;
        this.reconnectPromise = null;
      }
    })();
    return this.reconnectPromise;
  }

  allRoomPresencesStanza() {
    allRoomPresences(this.client);
  }

  async ensureConnected(timeout: number = 10000): Promise<void> {
    if (this.status === 'online') {
      return;
    }

    if (this.status === 'offline' || this.status === 'error') {
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
    sendFn: () => Promise<void>,
    retry = false
  ): Promise<boolean> {
    if (!this.pingOnSendEnabled) {
      try {
        await sendFn();
        return true;
      } catch (e) {
        return false;
      }
    }
    const pingId = sendPing(this.client, this.host);
    this.lastPingId = pingId;
    let pongReceived = false;
    let sendSuccess = false;
    // Listen for pong
    const pongListener = async (stanza: any) => {
      if (isPong(stanza, pingId)) {
        pongReceived = true;
        if (this.pingTimeout) clearTimeout(this.pingTimeout);
        this.client.removeListener('stanza', pongListener);
        this.lastPingId = null;
        try {
          await sendFn();
          sendSuccess = true;
        } catch (e) {
          sendSuccess = false;
        }
        resolvePromise(sendSuccess);
      }
    };
    this.client.on('stanza', pongListener);
    let resolvePromise: (value: boolean) => void;
    // Set timeout for pong
    const resultPromise = new Promise<boolean>((resolve) => {
      resolvePromise = resolve;
      this.pingTimeout = setTimeout(async () => {
        if (!pongReceived) {
          this.client.removeListener('stanza', pongListener);
          this.lastPingId = null;
          if (!retry) {
            await this.reconnect();
            await new Promise<void>((resolveWait, reject) => {
              const timeoutId = setTimeout(
                () => reject(new Error('Reconnect timeout')),
                10000
              );
              const check = () => {
                if (this.status === 'online') {
                  clearTimeout(timeoutId);
                  resolveWait();
                } else {
                  setTimeout(check, 200);
                }
              };
              check();
            });
            const retryResult = await this.sendMessageWithPingCheck(
              sendFn,
              true
            );
            resolve(retryResult);
            return;
          }
          resolve(false);
        }
      }, this.pongTimeoutMs);
    });
    return resultPromise;
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
    return this.sendMessageWithPingCheck(async () => {
      this.wrapWithConnectionCheck(async () => {
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
    langSource?: Iso639_1Codes
  ) => {
    this.wrapWithConnectionCheck(async () => {
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
        langSource
      );
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

  sendMediaMessageStanza(roomJID: string, data: any) {
    this.wrapWithConnectionCheck(async () => {
      sendMediaMessage(this.client, roomJID, data);
    });
  }

  sendPing() {
    if (!this.client || this.status !== 'online') return;
    const pingId = sendPing(this.client, this.host);
    this.lastPingId = pingId;
    if (this.pingTimeout) clearTimeout(this.pingTimeout);
    this.pingTimeout = setTimeout(() => {
      this.handlePingTimeout();
    }, this.pongTimeoutMs);
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
}

export default XmppClient;
