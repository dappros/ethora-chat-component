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

export class XmppClient implements XmppClientInterface {
  client!: Client;
  devServer: string | undefined;
  host: string;
  service: string;
  conference: string;
  username: string;
  status: string = 'offline';

  password = '';
  reconnectAttempts = 0;
  maxReconnectAttempts = 5;
  reconnectDelay = 2000;

  checkOnline() {
    return this.client && this.client.status === 'online';
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
    this.initializeClient();
  }

  async initializeClient() {
    try {
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
    } catch (error) {
      console.error('Error initializing client:', error);
    }
  }

  async disconnect() {
    if (!this.client) return;

    try {
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

    this.client.on('online', () => {
      console.log('Client is online.', new Date());
      this.status = 'online';
      this.reconnectAttempts = 0;
      this.client.send(xml('presence'));
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
      handleStanza.bind(this, stanza, this)();
    });
  }

  async reconnect() {
    const now = Date.now();
    if (this.status === 'connecting') {
      console.log(
        'Already attempting to connect or too soon after last attempt, skipping reconnect'
      );
      return;
    }

    console.log('Attempting to reconnect...');
    try {
      if (this.client) {
        await this.client.stop();
      }
      this.initializeClient();

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, 10000);

        const checkStatus = () => {
          if (this.status === 'online') {
            clearTimeout(timeout);
            resolve();
          } else if (this.status === 'error') {
            clearTimeout(timeout);
            reject(new Error('Connection error'));
          } else {
            setTimeout(checkStatus, 500);
          }
        };
        checkStatus();
      });

      console.log('Reconnection successful');
    } catch (error) {
      console.error('Reconnection failed:', error);

      const backoffDelay =
        this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
      console.log(`Will try again in ${backoffDelay / 1000} seconds`);

      throw error;
    }
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

  presenceInRoomStanza = (roomJID: string) => {
    this.wrapWithConnectionCheck(async () => {
      presenceInRoom(this.client, roomJID);
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
  ) => {
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
}

export default XmppClient;
