import xmpp, { Client, xml } from '@xmpp/client';
import { walletToUsername } from '../helpers/walletUsername';

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
import { XmppClientInterface } from '../types/types';
import { sendMessageReaction } from './xmpp/sendMessageReaction.xmpp';

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

  constructor(username: string, password: string, devServer?: string) {
    this.devServer = devServer;
    const url = `wss://${this.devServer || 'xmpp.ethoradev.com:5443'}/ws`;
    // if (url.startsWith("wss")) {
    //   this.host = url.match(/wss:\/\/([^:/]+)/)[1];
    // } else {
    //   this.host = url.match(/ws:\/\/([^:/]+)/)[1];
    // }
    this.conference = `conference.${this.host}`;
    this.username = username;
    this.password = password;
    this.initializeClient();
  }

  initializeClient() {
    try {
      const url = `wss://${this.devServer || 'xmpp.ethoradev.com:5443'}/ws`;
      this.service = url;
      this.host = url.match(/wss:\/\/([^:/]+)/)?.[1] || '';
      this.conference = `conference.${this.host}`;
      console.log('+-+-+-+-+-+-+-+-+ ', { username: this.username });
      this.service = url;

      this.client = xmpp.client({
        service: url,
        username: walletToUsername(this.username),
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

  attachEventListeners() {
    this.client.on('disconnect', () => {
      console.log('Disconnected from server.');
      this.status = 'offline';
    });

    this.client.on('online', () => {
      console.log('Client is online.', new Date());
      this.status = 'online';
      this.reconnectAttempts = 0;
    });

    this.client.on('error', (error) => {
      console.error('XMPP client error:', error);
      // if (this.status !== 'online') {
      //   this.scheduleReconnect();
      // }
    });

    this.client.on('stanza', (stanza) => {
      handleStanza.bind(this, stanza, this)();
    });
  }

  scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnect attempts reached. Giving up.');
      return;
    }

    this.reconnectAttempts++;
    console.log(`Reconnecting attempt ${this.reconnectAttempts}...`);
    setTimeout(() => this.reconnect(), this.reconnectDelay);
  }

  reconnect() {
    console.log('Attempting to reconnect...');
    if (this.client) {
      this.client.stop().finally(() => {
        this.initializeClient();
      });
    } else {
      this.initializeClient();
    }
  }

  async close() {
    if (this.client) {
      await this.client
        .stop()
        .then(() => {
          console.log('Client connection closed.');
        })
        .catch((error) => {
          console.error('Error closing the client:', error);
        });
    } else {
      console.log('No client to close.');
    }
  }

  getRoomsStanza = async () => {
    await getRooms(this.client);
  };

  //room functions

  async createRoomStanza(title: string, description: string, to?: string) {
    return await createRoom(title, description, this.client, to);
  }

  async inviteRoomRequestStanza(to: string, roomJid: string) {
    await inviteRoomRequest(this.client, to, roomJid);
  }

  leaveTheRoomStanza = (roomJID: string) => {
    leaveTheRoom(roomJID, this.client);
  };

  presenceInRoomStanza = (roomJID: string) => {
    presenceInRoom(this.client, roomJID);
  };

  getHistoryStanza = async (
    chatJID: string,
    max: number,
    before?: number,
    id?: string
  ) => {
    return await getHistory(this.client, chatJID, max, before, id);
  };

  getLastMessageArchiveStanza(roomJID: string) {
    getLastMessage(this.client, roomJID);
  }

  setRoomImageStanza = (
    roomJid: string,
    roomThumbnail: string,
    type: string,
    roomBackground?: string
  ) => {
    setRoomImage(roomJid, roomThumbnail, type, this.client, roomBackground);
  };

  getRoomInfoStanza = (roomJID: string) => {
    getRoomInfo(roomJID, this.client);
  };

  getRoomMembersStanza = (roomJID: string) => {
    getRoomMembers(roomJID, this.client);
  };

  setVCardStanza(xmppUsername: string) {
    setVcard(xmppUsername, this.client);
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
    mainMessage?: string
  ) => {
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
      this.devServer || 'xmpp.ethoradev.com:5443'
    );
  };

  sendMessageReactionStanza(
    messageId: string,
    roomJid: string,
    reactionSymbol?: any
  ) {
    sendMessageReaction(this.client, messageId, roomJid, reactionSymbol);
  }

  deleteMessageStanza(room: string, msgId: string) {
    deleteMessage(this.client, room, msgId);
  }

  editMessageStanza(room: string, msgId: string, text: string) {
    editMessage(this.client, room, msgId, text);
  }

  sendTypingRequestStanza(chatId: string, fullName: string, start: boolean) {
    sendTypingRequest(this.client, chatId, fullName, start);
  }

  getChatsPrivateStoreRequestStanza = async () => {
    try {
      return await getChatsPrivateStoreRequest(this.client);
    } catch (error) {
      console.log(error);
      return null;
    }
  };

  async actionSetTimestampToPrivateStoreStanza(
    chatId: string,
    timestamp: number,
    chats?: string[]
  ) {
    try {
      await actionSetTimestampToPrivateStore(
        this.client,
        chatId,
        timestamp,
        chats
      );
    } catch (error) {}
  }

  sendMediaMessageStanza(roomJID: string, data: any) {
    sendMediaMessage(this.client, roomJID, data);
  }
}

export default XmppClient;
