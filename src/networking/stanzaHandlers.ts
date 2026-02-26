import { Element } from 'ltx';
import { store } from '../roomStore';
import {
  addRoom,
  addRoomMessage,
  addRoomViaApi,
  deleteRoomMessage,
  editRoomMessage,
  setComposing,
  setCurrentRoom,
  setReactions,
  setRoomRole,
  updateRoom,
  updateUsersSet,
  deleteRoom,
  insertUsers,
} from '../roomStore/roomsSlice';
import { IMessage, IRoom, RoomMember, User } from '../types/types';
import { createMessageFromXml } from '../helpers/createMessageFromXml';
import { setDeleteModal, updateUser } from '../roomStore/chatSettingsSlice';
import { getDataFromXml } from '../helpers/getDataFromXml';
import { getBooleanFromString } from '../helpers/getBooleanFromString';
import { getNumberFromString } from '../helpers/getNumberFromString';
import { getRooms } from '../networking/api-requests/rooms.api';
import { createRoomFromApi } from '../helpers/createRoomFromApi';
import XmppClient from './xmppClient';
import { checkSingleUser } from '../helpers/checkUniqueUsers';
import { presenceInRoom } from './xmpp/presenceInRoom.xmpp';
import { removeMessageFromHeapById } from '../roomStore/roomHeapSlice';
import { xml } from '@xmpp/client';
import { messageNotificationManager } from '../utils/messageNotificationManager';
import { createUserNameFromSetUser } from '../helpers/createUserNameFromSetUser';
import {
  isActiveRoom,
} from '../utils/notificationPolicy';
// TO DO: we are thinking to refactor this code in the following way:
// each stanza will be parsed for 'type'
// then it will be handled based on the type
// XMPP parsing will be done universally as a pre-processing step
// then handlers for different types will work with a Javascript object
// types: standard, coin transfer, is composing, attachment (media), token (nft) or smart contract
// types can be added into our chat protocol (XMPP stanza add field type="") to make it easier to parse here

//core default
const onRealtimeMessage = async (stanza: Element, xmppClient?: XmppClient) => {
  const mucX = stanza
    ?.getChildren('x')
    ?.find(
      (x) =>
        x.attrs['xmlns'] === 'http://jabber.org/protocol/muc#user' &&
        x.getChild('invite')
    );
  if (mucX) {
    return;
  }
  if (
    !stanza?.getChild('result') &&
    !stanza.getChild('composing') &&
    !stanza.getChild('paused') &&
    !stanza.getChild('subject') &&
    !stanza.is('iq') &&
    stanza?.attrs?.id !== 'deleteMessageStanza' &&
    !stanza?.attrs?.id?.includes('message-reaction')
  ) {
    try {
      const { data } = await getDataFromXml(stanza);
    } catch (error) {
      handleErrorMessageStanza(stanza);
      return;
    }
    const { data, id, body, ...rest } = await getDataFromXml(stanza);

    if (!data) {
      console.log('No data in stanza');
      return;
    }

    const message = await createMessageFromXml({
      data,
      id,
      body,
      ...rest,
    });

    const fixedUser = await checkSingleUser(
      store.getState().rooms.usersSet,
      message.user.id
    );
    if (fixedUser) {
      store.dispatch(insertUsers({ newUsers: [fixedUser] }));
    }
    store.dispatch(
      addRoomMessage({
        roomJID: stanza.attrs.from.split('/')[0],
        message,
      })
    );
    const removeId = message?.xmppId || message?.id;
    if (removeId) {
      store.dispatch(removeMessageFromHeapById(removeId));
    }

    // Show notification if user is online and message is not from current user
    const state = store.getState();
    const roomJID = stanza.attrs.from.split('/')[0];
    const room = state.rooms.rooms[roomJID];
    // XMPP in-app notification policy is intentionally simple here:
    // enabled + non-system + (active room allowed by showInContext)
    const activeRoomJID = state.rooms.activeRoomJID;
    const isActiveChatMessage = isActiveRoom(activeRoomJID, roomJID);
    const inAppEnabled =
      state.chatSettingStore.config?.messageNotifications?.enabled !== false;
    const showInContext =
      state.chatSettingStore.config?.messageNotifications?.showInContext ?? true;
    const isSystemMessage = message.isSystemMessage === 'true';

    const decision = {
      show:
        inAppEnabled &&
        !isSystemMessage &&
        (!isActiveChatMessage || showInContext),
      reason: !inAppEnabled
        ? 'in_app_disabled'
        : isSystemMessage
          ? 'system_message'
          : isActiveChatMessage && !showInContext
            ? 'active_room_hidden'
            : 'ok',
    };

    if (decision.show) {
      const roomName = room?.name || room?.title || roomJID.split('@')[0];
      
      // Get sender name from usersSet using createUserNameFromSetUser helper
      const senderName = createUserNameFromSetUser(
        state.rooms.usersSet,
        message.user.id
      );

      // Trigger notification via global manager
      messageNotificationManager.showNotification(
        message,
        roomName,
        senderName,
        roomJID
      );
      if (state.chatSettingStore.config?.useStoreConsoleEnabled) {
        console.log(`[NotifyPolicy] source=xmpp action=show reason=${decision.reason} msgId=${message.id}`);
      }
    } else if (state.chatSettingStore.config?.useStoreConsoleEnabled) {
      console.log(`[NotifyPolicy] source=xmpp action=skip reason=${decision.reason} msgId=${message.id}`);
    }

    return message;
  }
};

const onReactionMessage = async (stanza: Element) => {
  if (stanza?.attrs?.id?.includes('message-reaction')) {
    const reactions = stanza.getChild('reactions');
    const stanzaId = stanza.getChild('stanza-id');
    const roomJid = stanzaId.attrs.by;
    const timestamp = stanzaId.attrs.id;

    const data = stanza.getChild('data');

    const emojiList: string[] = reactions
      .getChildren('reaction')
      .map((reaction) => reaction.text());
    const from: string = reactions.attrs.from;

    store.dispatch(
      setReactions({
        roomJID: roomJid,
        messageId: reactions.attrs.id,
        latestReactionTimestamp: timestamp,
        reactions: emojiList,
        from,
        data: data.attrs,
      })
    );
  }
};

const onDeleteMessage = async (stanza: Element) => {
  if (stanza.attrs.id === 'deleteMessageStanza') {
    const deleted = stanza.getChild('delete');
    const stanzaId = stanza.getChild('stanza-id');

    if (!deleted) {
      return;
    }

    store.dispatch(
      deleteRoomMessage({
        roomJID: stanzaId.attrs.by,
        messageId: deleted.attrs.id,
      })
    );
    store.dispatch(setDeleteModal({ isDeleteModal: false }));
  }
};

const onEditMessage = async (stanza: Element) => {
  if (stanza?.attrs?.id?.includes('edit-message')) {
    const stanzaId = stanza.getChild('stanza-id');
    const replace = stanza.getChild('replace');

    if (!stanzaId && !replace) {
      return;
    }

    store.dispatch(
      editRoomMessage({
        roomJID: stanzaId.attrs.by,
        messageId: replace.attrs.id,
        text: replace.attrs.text,
      })
    );
  }
};

const onReactionHistory = async (stanza: any) => {
  try {
    const reactions = stanza
      .getChild('result')
      ?.getChild('forwarded')
      ?.getChild('message')
      ?.getChild('reactions');
    const data = stanza
      .getChild('result')
      ?.getChild('forwarded')
      ?.getChild('message')
      ?.getChild('data');
    const stanzaId = stanza
      .getChild('result')
      ?.getChild('forwarded')
      ?.getChild('message')
      ?.getChild('stanza-id');

    if (!reactions && !data && !stanzaId && !reactions?.attrs) {
      return;
    }

    const messageId = reactions.attrs.id;

    const reactionList: string[] = reactions.children.map(
      (emoji) => emoji.children[0]
    );
    const from: string = reactions.attrs.from;
    const dataReaction = {
      senderFirstName: data.attrs.senderFirstName,
      senderLastName: data.attrs.senderLastName,
    };

    const roomJid = stanzaId.attrs.by;
    const timestamp = stanzaId.attrs.id;

    store.dispatch(
      setReactions({
        roomJID: roomJid,
        messageId,
        latestReactionTimestamp: timestamp,
        reactions: reactionList,
        from,
        data: dataReaction,
      })
    );
  } catch (error) {
    return;
  }
};

const onMessageHistory = async (stanza: any) => {
  if (
    stanza.is('message') &&
    stanza.children[0].attrs.xmlns === 'urn:xmpp:mam:2'
  ) {
    const { data, id, body, ...rest } = await getDataFromXml(stanza);

    if (!data) {
      console.log('No data in stanza');
      return;
    }

    const message = await createMessageFromXml({
      data,
      id,
      body,
      ...rest,
    });

    const fixedUser = await checkSingleUser(
      store.getState().rooms.usersSet,
      message.user.id
    );

    if (fixedUser) {
      store.dispatch(insertUsers({ newUsers: [fixedUser] }));
    }

    store.dispatch(
      addRoomMessage({
        roomJID: stanza.attrs.from,
        message,
      })
    );
  }
};

const handleComposing = async (stanza: Element, currentUser: string) => {
  if (stanza.getChild('paused') || stanza.getChild('composing')) {
    const composingUser = stanza.attrs?.from?.split('/')?.[1];

    if (
      composingUser &&
      currentUser?.toLowerCase()?.replace(/_/g, '') !==
        composingUser?.replace(/_/g, '')
    ) {
      const chatJID = stanza.attrs?.from.split('/')[0];

      let composingList = [];

      !!stanza?.getChild('composing')
        ? composingList.push(stanza.getChild('data').attrs?.fullName || 'User')
        : composingList.pop();

      store.dispatch(
        setComposing({
          chatJID: chatJID,
          composing: !!stanza?.getChild('composing'),
          composingList,
        })
      );
    }
  }
};

const onPresenceInRoom = (stanza: Element | any) => {
  if (stanza.attrs.id === 'presenceInRoom' && !stanza.getChild('error')) {
    const roomJID: string = stanza.attrs.from.split('/')[0];
    const role: string = stanza?.children[1]?.children[0]?.attrs.role;
    store.dispatch(setRoomRole({ chatJID: roomJID, role: role }));
  }
};

const onChatInvite = async (stanza: Element, client: XmppClient) => {
  if (stanza.is('message')) {
    const chatId = stanza.attrs.from;
    const xEls = stanza.getChildren('x');

    try {
      for (const el of xEls) {
        const child = el.getChild('invite');

        if (child) {
          const chat = store.getState().rooms.rooms[chatId];
          if (chat) {
            return;
          }

          client.presenceInRoomStanza(chatId);

          const rooms = await getRooms();
          rooms.items.map((room) => {
            store.dispatch(
              addRoomViaApi({
                room: createRoomFromApi(room, client.conference),
                xmpp: client,
              })
            );
          });
          store.dispatch(updateUsersSet({ rooms: rooms.items }));
        }
      }
    } catch (error) {
      console.log('err', error);
    }
  }
};

const onGetMembers = (stanza: Element) => {
  const jid = store.getState().rooms.activeRoomJID;
  if (stanza.attrs.id.toString() === 'roomMemberInfo') {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(stanza.toString(), 'text/xml');

    const roomMembers = Array.from(xmlDoc.getElementsByTagName('activity')).map(
      (activity) => ({
        name: activity.getAttribute('name'),
        role: activity.getAttribute('role'),
        ban_status: activity.getAttribute('ban_status'),
        last_active: Number(activity.getAttribute('last_active')),
        jid: activity.getAttribute('jid'),
      })
    );
  }
};

const onGetRoomInfo = (stanza: Element) => {
  if (stanza.attrs.id === 'roomInfo' && !stanza.getChild('error')) {
  }
};

const onGetLastMessageArchive = (stanza: Element) => {
  if (stanza.attrs?.id && stanza.attrs?.id.toString().includes('get-history')) {
    const set = stanza?.getChild('fin')?.getChild('set');
    if (set) {
      const roomJid = stanza?.attrs?.from;

      if (roomJid) {
        const fin = stanza?.getChild('fin');

        if (fin?.attrs?.complete) {
          const first = set?.getChildText('first');
          const last = set?.getChildText('last');
          const historyComplete = getBooleanFromString(fin.attrs.complete);
          const lastMessageTimestamp = getNumberFromString(last);
          const firstMessageTimestamp = getNumberFromString(first);

          store.dispatch(
            store.dispatch(
              updateRoom({
                jid: roomJid,
                updates: {
                  messageStats: {
                    lastMessageTimestamp: lastMessageTimestamp,
                    firstMessageTimestamp: firstMessageTimestamp,
                  },
                  historyComplete: historyComplete,
                },
              })
            )
          );
        }
      }
    }
  }
};

const onNewRoomCreated = (stanza: Element, xmpp: any) => {
  store.dispatch(setCurrentRoom({ roomJID: stanza.attrs.from }));
  xmpp.getRoomsStanza();
};

const onGetChatRooms = (stanza: Element, xmpp: any) => {
  if (
    stanza.attrs.id === 'getUserRooms' &&
    Array.isArray(stanza.getChild('query')?.children)
  ) {
    stanza.getChild('query')?.children.forEach(async (result: any) => {
      const currentChatRooms = store.getState().rooms.rooms;

      const isRoomAlreadyAdded = (
        Object.values(currentChatRooms) as IRoom[]
      ).some((element: IRoom) => element.jid === result?.attrs?.jid);

      if (!isRoomAlreadyAdded) {
        try {
          const roomData: IRoom = {
            jid: result?.attrs?.jid || '',
            name: result?.attrs?.name || '',
            title: result?.attrs?.name || '',
            usersCnt: Number(result?.attrs?.users_cnt || 0),
            messages: [],
            isLoading: false,
            roomBg:
              result?.attrs?.room_background !== 'none'
                ? result?.attrs?.room_background
                : null,
            icon:
              result?.attrs?.room_thumbnail !== 'none'
                ? result?.attrs?.room_thumbnail
                : null,
            unreadMessages: 0,
            lastViewedTimestamp: 0,
          };

          store.dispatch(addRoom({ roomData: { ...roomData } }));

          if (!store.getState().rooms.activeRoomJID) {
            store.dispatch(setCurrentRoom({ roomJID: roomData.jid }));
          }

          if (roomData.jid) {
            xmpp.presenceInRoomStanza(roomData.jid);
          }
        } catch (error) {}
      }
    });
  }
};

const onRoomKicked = async (stanza: Element) => {
  if (stanza.is('presence') && stanza.attrs.type === 'unavailable') {
    const xElement = stanza.getChild('x');
    if (!xElement) return;

    const statusElements = xElement.getChildren('status');

    if (!statusElements || statusElements.length === 0) return;

    const statusCodes = statusElements.map((s) => s.attrs.code);

    if (statusCodes.includes('110') && statusCodes.includes('321')) {
      const roomJid = stanza.attrs.from.split('/')[0];

      store.dispatch(deleteRoom({ jid: roomJid }));
      await getRooms();
    }
  }
};

const onMessageError = async (stanza: Element, client: XmppClient) => {
  if (stanza.name === 'message' && stanza.attrs.type === 'error') {
    const roomJID = stanza.attrs.from?.split('/')[0];
    if (roomJID && client) {
      try {
        client?.client?.send(xml('presence'));
        await presenceInRoom(client.client, roomJID);
        console.log(
          `Sent presence to room ${roomJID} due to error: Only occupants are allowed to send messages to the conference.`
        );
        const queue = store.getState().roomHeapSlice.messageHeap as IMessage[];
        await Promise.all(
          queue.map((msg: IMessage) =>
            client.sendMessage(
              msg.roomJid,
              msg.user.firstName,
              msg.user.lastName,
              '',
              msg.user.walletAddress,
              msg.body,
              '',
              !!msg.isReply,
              !!msg.showInChannel,
              msg.mainMessage,
              msg.id
            )
          )
        );
      } catch (e) {
        console.warn('Failed to send presence in response to error:', e);
      }
    }
  }
};

export type XMPPErrorInfo = {
  type: string;
  id: string;
  from: string;
  to: string;
  body: string | null;
  condition: string;
  message: string;
};

export const handleErrorMessageStanza = (
  stanza: Element
): XMPPErrorInfo | null => {
  if (stanza.is('message') && stanza.attrs.type === 'error') {
    const errorEl = stanza.getChild('error');
    if (!errorEl) return null;

    const children = errorEl.children as Element[];

    const conditionEl = children.find(
      (el) =>
        el instanceof Element &&
        el.name !== 'text' &&
        el.attrs.xmlns === 'urn:ietf:params:xml:ns:xmpp-stanzas'
    );

    const textEl = errorEl.getChild(
      'text',
      'urn:ietf:params:xml:ns:xmpp-stanzas'
    );

    const errorInfo: XMPPErrorInfo = {
      type: stanza.attrs.type,
      id: stanza.attrs.id,
      from: stanza.attrs.from,
      to: stanza.attrs.to,
      body: stanza.getChildText('body') ?? null,
      condition: conditionEl?.name ?? 'unknown',
      message: textEl?.text() ?? '',
    };

    console.log('Received XMPP error message:', {
      message: errorInfo?.message,
      errorInfo,
    });
    return errorInfo;
  }

  return null;
};

const onUserUpdate = async (stanza: Element) => {
  if (stanza.attrs?.type !== 'headline') {
    return;
  }

  const userUpdateElement = stanza.getChild('user-update');
  if (!userUpdateElement || userUpdateElement.attrs?.xmlns !== 'your:custom:ns') {
    return;
  }

  try {
    const attrs = userUpdateElement.attrs;
    const state = store.getState();
    
    // Extract user identifier from multiple possible sources:
    let xmppUsername = attrs.xmppUsername || attrs.userId || attrs._id || attrs.id;
    
    // Try to extract from stanza 'from' attribute if available
    if (!xmppUsername && stanza.attrs?.from) {
      const fromParts = stanza.attrs.from.split('/');
      if (fromParts.length > 1) {
        xmppUsername = fromParts[1]; // User identifier after the room JID
      }
    }
    
    if (!xmppUsername) {
      console.warn('User update received but no user identifier found in attributes or from stanza');
      return;
    }

    // Build user update object with available attributes
    const userUpdates: Partial<RoomMember> = {};
    if (attrs.firstName !== undefined) userUpdates.firstName = attrs.firstName;
    if (attrs.lastName !== undefined) userUpdates.lastName = attrs.lastName;
    if (attrs.email !== undefined) userUpdates.name = attrs.email; // Note: RoomMember doesn't have email, using name
    if (attrs.profileImage !== undefined) {
      // RoomMember doesn't have profileImage directly, but we can store it
      // For now, we'll update what we can
    }

    // Update user in usersSet if they exist
    const existingUser = state.rooms.usersSet[xmppUsername];
    if (existingUser) {
      const updatedUser: RoomMember = {
        ...existingUser,
        ...userUpdates,
        xmppUsername, // Ensure xmppUsername is set
      };
      store.dispatch(insertUsers({ newUsers: [updatedUser] }));
    } else {
      // Create new user entry if it doesn't exist
      const newUser: RoomMember = {
        firstName: attrs.firstName || '',
        lastName: attrs.lastName || '',
        xmppUsername,
        _id: attrs._id || xmppUsername,
        ...userUpdates,
      };
      store.dispatch(insertUsers({ newUsers: [newUser] }));
    }

    // If this is the current logged-in user, also update the user state
    const currentUser = state.chatSettingStore.user;
    if (currentUser && currentUser.xmppUsername === xmppUsername) {
      const userStateUpdates: Partial<User> = {};
      if (attrs.firstName !== undefined) userStateUpdates.firstName = attrs.firstName;
      if (attrs.lastName !== undefined) userStateUpdates.lastName = attrs.lastName;
      if (attrs.email !== undefined) userStateUpdates.email = attrs.email;
      if (attrs.profileImage !== undefined) userStateUpdates.profileImage = attrs.profileImage;
      if (attrs.description !== undefined) userStateUpdates.description = attrs.description;

      if (Object.keys(userStateUpdates).length > 0) {
        store.dispatch(updateUser({ updates: userStateUpdates }));
      }
    }
  } catch (error) {
    console.error('Error processing user update:', error);
  }
};

const onChatUpdate = async (stanza: Element) => {
  if (stanza.attrs?.type !== 'headline') {
    return;
  }

  const chatUpdateElement = stanza.getChild('chat-update');
  if (!chatUpdateElement || chatUpdateElement.attrs?.xmlns !== 'your:custom:ns') {
    return;
  }

  try {
    const attrs = chatUpdateElement.attrs;
    const state = store.getState();
    
    // Extract room JID from 'to' attribute
    const roomJID = stanza.attrs.to;
    
    if (!roomJID) {
      console.warn('Chat update received but no room JID found');
      return;
    }

    // Check if room exists
    const existingRoom = state.rooms.rooms[roomJID];
    if (!existingRoom) {
      console.warn(`Chat update received for non-existent room: ${roomJID}`);
      return;
    }

    // Build room update object with available attributes
    const roomUpdates: Partial<IRoom> = {};
    
    if (attrs.title !== undefined) {
      roomUpdates.title = attrs.title;
      roomUpdates.name = attrs.title; // Also update name field
    }
    if (attrs.description !== undefined) {
      roomUpdates.description = attrs.description;
    }
    if (attrs.picture !== undefined) {
      roomUpdates.icon = attrs.picture;
      roomUpdates.picture = attrs.picture;
    }
    if (attrs.usersCnt !== undefined) {
      roomUpdates.usersCnt = getNumberFromString(attrs.usersCnt);
    }
    if (attrs.chatName !== undefined) {
    }

    // Update room if we have any updates
    if (Object.keys(roomUpdates).length > 0) {
      store.dispatch(updateRoom({ jid: roomJID, updates: roomUpdates }));
    }
  } catch (error) {
    console.error('Error processing chat update:', error);
  }
};

export {
  onRealtimeMessage,
  onMessageHistory,
  onPresenceInRoom,
  onReactionHistory,
  onGetLastMessageArchive,
  handleComposing,
  onGetChatRooms,
  onNewRoomCreated,
  onGetMembers,
  onGetRoomInfo,
  onDeleteMessage,
  onEditMessage,
  onReactionMessage,
  onChatInvite,
  onRoomKicked,
  onMessageError,
  onUserUpdate,
  onChatUpdate,
};
