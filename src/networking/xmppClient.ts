import xmpp, { Client, xml } from '@xmpp/client';
import { walletToUsername } from '../helpers/walletUsername';
import {
  handleComposing,
  onGetChatRooms,
  onGetLastMessageArchive,
  onGetMembers,
  onGetRoomInfo,
  onMessageHistory,
  onNewRoomCreated,
  onPresenceInRoom,
  onRealtimeMessage,
} from './stanzaHandlers';

import { sendMediaMessage } from './xmpp/sendMediaMessage.xmpp';
import { setChatsPrivateStoreRequest } from './xmpp/setChatsPrivateStoreRequest.xmpp';
import { getChatsPrivateStoreRequest } from './xmpp/getChatsPrivateStoreRequest.xmpp';
import { actionSetTimestampToPrivateStore } from './xmpp/actionSetTimestampToPrivateStore.xmpp';
import { sendTypingRequest } from './xmpp/sendTypingRequest.xmpp';
import { getHistory } from './xmpp/getHistory.xmpp';
import { sendTextMessage } from './xmpp/sendTextMessage.xmpp';
import { deleteMessage } from './xmpp/deleteMessage.xmpp';
import { presenceInRoom } from './xmpp/presenceInRoom.xmpp';
import { getLastMessageArchive } from './xmpp/getLastMessageArchive.xmpp';
import { createRoom } from './xmpp/createRoom.xmpp';
import { setRoomImage } from './xmpp/setRoomImage.xmpp';
import { getRoomMembers } from './xmpp/getRoomMembers.xmpp';
import { getRoomInfo } from './xmpp/getRoomInfo.xmpp';
import { leaveTheRoom } from './xmpp/leaveTheRoom.xmpp';

export class XmppClient {
  client!: Client;
  devServer: string | undefined;
  host: string;
  service: string;
  conference: string;
  username: string;
  onclose: () => void;
  onmessage: (data: any) => void;
  status: string = 'offline';
  activeChat: string;

  password = '';
  resource = '';
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
      this.onclose?.();
    });

    this.client.on('online', () => {
      console.log('Client is online.', new Date());
      this.status = 'online';
      this.reconnectAttempts = 0;
    });

    this.client.on('error', (error) => {
      console.error('XMPP client error:', error);
      if (this.status !== 'online') {
        this.scheduleReconnect();
      }
    });

    this.client.on('stanza', (stanza) => this.handleStanza(stanza));
  }

  handleStanza(stanza: any) {
    switch (stanza.name) {
      case 'message':
        onRealtimeMessage(stanza);
        onMessageHistory(stanza);
        onGetLastMessageArchive(stanza, this);
        handleComposing(stanza, this.username);
        break;
      case 'presence':
        onPresenceInRoom(stanza);
        break;
      case 'iq':
        onGetChatRooms(stanza, this);
        onRealtimeMessage(stanza);
        onPresenceInRoom(stanza);
        onGetMembers(stanza);
        onGetRoomInfo(stanza);
        break;
      case 'room-config':
        onNewRoomCreated(stanza, this);
        break;
      default:
        console.log('Unhandled stanza type:', stanza.name);
    }
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

  close() {
    if (this.client) {
      this.client
        .stop()
        .then(() => {
          console.log('Client connection closed.');
          this.onclose();
        })
        .catch((error) => {
          console.error('Error closing the client:', error);
        });
    } else {
      console.log('No client to close.');
    }
  }

  unsubscribe(address: string) {
    try {
      const message = xml(
        'iq',
        {
          from: this.client?.jid?.toString(),
          to: address,
          type: 'set',
          id: 'unsubscribe',
        },
        xml('unsubscribe', { xmlns: 'urn:xmpp:mucsub:0' })
      );
      this.client.send(message);
    } catch (error) {
      console.error('Error while unsubscribing:', error);
    }
  }

  getRooms = () => {
    return new Promise((resolve, reject) => {
      try {
        const message = xml(
          'iq',
          {
            type: 'get',
            from: this.client.jid?.toString(),
            id: 'getUserRooms',
          },
          xml('query', { xmlns: 'ns:getrooms' })
        );

        this.client
          .send(message)
          .then(() => {
            console.log('getRooms successfully sent');
            resolve('Request to get rooms sent successfully');
          })
          .catch((error: any) => {
            console.error('Failed to send getRooms request:', error);
            reject(error);
          });
      } catch (error) {
        console.error('An error occurred while getting rooms:', error);
        reject(error);
      }
    });
  };

  //room functions

  async createRoomStanza(title: string, description: string) {
    return await createRoom(title, description, this.client);
  }

  leaveTheRoomStanza = (roomJID: string) => {
    leaveTheRoom(roomJID, this.client);
  };

  presenceInRoomStanza = (roomJID: string) => {
    presenceInRoom(this.client, roomJID);
  };

  getHistoryStanza = async (chatJID: string, max: number, before?: number) => {
    await getHistory(this.client, chatJID, max, before);
  };

  getLastMessageArchiveStanza(roomJID: string) {
    getLastMessageArchive(this.client, roomJID);
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

  //messages
  sendMessage = (
    roomJID: string,
    firstName: string,
    lastName: string,
    photo: string,
    walletAddress: string,
    userMessage: string,
    notDisplayedValue?: string
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
      this.devServer || 'xmpp.ethoradev.com:5443'
    );
  };

  deleteMessageStanza(room: string, msgId: string) {
    deleteMessage(this.client, room, msgId);
  }

  sendTypingRequestStanza(chatId: string, fullName: string, start: boolean) {
    sendTypingRequest(this.client, chatId, fullName, start);
  }

  getChatsPrivateStoreRequestStanza = () =>
    getChatsPrivateStoreRequest(this.client);

  async setChatsPrivateStoreRequestStanza(jsonObj: string) {
    await setChatsPrivateStoreRequest(this.client, jsonObj);
  }

  async actionSetTimestampToPrivateStoreStanza(
    chatId: string,
    timestamp: number
  ) {
    await actionSetTimestampToPrivateStore(this.client, chatId, timestamp);
  }

  sendMediaMessageStanza(roomJID: string, data: any) {
    sendMediaMessage(this.client, roomJID, data);
  }
}

export default XmppClient;
