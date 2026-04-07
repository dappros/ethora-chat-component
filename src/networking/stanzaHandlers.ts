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
import { removeMessageFromHeapById } from '../roomStore/roomHeapSlice';
import { messageNotificationManager } from '../utils/messageNotificationManager';
import { createUserNameFromSetUser } from '../helpers/createUserNameFromSetUser';
import {
  isActiveRoom,
  isCurrentUserMessage,
  shouldShowXmppToast,
} from '../utils/notificationPolicy';
import { formatError } from '../utils/formatError';
import { ethoraLogger } from '../helpers/ethoraLogger';
// TO DO: we are thinking to refactor this code in the following way:
// each stanza will be parsed for 'type'
// then it will be handled based on the type
// XMPP parsing will be done universally as a pre-processing step
// then handlers for different types will work with a Javascript object
// types: standard, coin transfer, is composing, attachment (media), token (nft) or smart contract
// types can be added into our chat protocol (XMPP stanza add field type="") to make it easier to parse here

//core default
const onRealtimeMessage = async (stanza: Element, xmppClient?: XmppClient) => {
  const hasChatState = stanza?.children?.some(
      (child: any) =>
        (child?.name === 'composing' || child?.name === 'paused') &&
        child?.attrs?.xmlns === 'http://jabber.org/protocol/chatstates'
    );
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
    !hasChatState &&
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
      ethoraLogger.log('No data in stanza');
      return;
    }

    const message = await createMessageFromXml({
      data,
      id,
      body,
      ...rest,
    });

    // Ignore non-message stanzas (e.g. typing/chatstate with only <data .../>)
    if (!message?.body || !String(message.body).trim()) {
      return;
    }

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
    const roomJID = stanza.attrs.from.split('/')[0];
    const heapBeforeRemove = store.getState().roomHeapSlice.messageHeap as IMessage[];
    const matchedPendingMessage = !!(
      removeId &&
      heapBeforeRemove?.some((m) => (m.xmppId || m.id) === removeId)
    );
    if (removeId) {
      store.dispatch(removeMessageFromHeapById(removeId));
      xmppClient?.acknowledgeSentMessage(roomJID, removeId);
    }

    const state = store.getState();
    const room = state.rooms.rooms[roomJID];
    const activeRoomJID = state.rooms.activeRoomJID;
    const isActiveChatMessage = isActiveRoom(activeRoomJID, roomJID);
    const currentXmppUsername = state.chatSettingStore.user?.xmppUsername;
    const senderFromStanza = stanza.attrs.from?.split('/')[1] || '';
    const senderIsExactCurrentUser =
      !!currentXmppUsername && senderFromStanza === currentXmppUsername;
    const senderLooksLikeCurrentUser = isCurrentUserMessage(
      message.user?.id,
      currentXmppUsername
    );
    // Suppress only exact sender match from stanza resource.
    const currentUserMessage = senderIsExactCurrentUser;
    const isSystemMessage = message.isSystemMessage === 'true';

    const isHistory = (message as any).isHistory;
    // Suppress notifications for some time after app load to avoid login flood
    const appLoadTime = (window as any)._ethoraAppLoadTime || Date.now();
    const isWithinCatchupPeriod = Date.now() - appLoadTime < 2000;

    const decision = shouldShowXmppToast({
      config: state.chatSettingStore.config,
      tabVisible: document.visibilityState === 'visible',
      activeRoom: isActiveChatMessage,
      currentUserMessage,
      isSystem: isSystemMessage,
      isHistory: isHistory,
      isCatchup: isWithinCatchupPeriod,
    });

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
        ethoraLogger.log(
          `[NotifyPolicy] source=xmpp action=show reason=${decision.reason} msgId=${message.id} room=${roomJID} sender=${message.user?.id} activeRoom=${isActiveChatMessage} history=${isHistory} catchup=${isWithinCatchupPeriod}`
        );
      }
    } else if (state.chatSettingStore.config?.useStoreConsoleEnabled) {
      ethoraLogger.log(
        `[NotifyPolicy] source=xmpp action=skip reason=${decision.reason} msgId=${message.id} room=${roomJID} sender=${message.user?.id} activeRoom=${isActiveChatMessage} currentUser=${currentUserMessage} system=${isSystemMessage} pendingEcho=${matchedPendingMessage} looksLikeCurrent=${senderLooksLikeCurrentUser} history=${isHistory} catchup=${isWithinCatchupPeriod}`
      );
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
      ethoraLogger.log('No data in stanza');
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

      if (stanza?.getChild('composing')) {
        composingList.push(stanza.getChild('data').attrs?.fullName || 'User');
      } else {
        composingList.pop();
      }

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
      ethoraLogger.log('err', error);
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
    // Room info stanza is consumed by feature-specific flows.
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
            unreadCapped: false,
            lastViewedTimestamp: 0,
            historyPreloadState: 'idle',
          };

          store.dispatch(addRoom({ roomData: { ...roomData } }));

          if (!store.getState().rooms.activeRoomJID) {
            store.dispatch(setCurrentRoom({ roomJID: roomData.jid }));
          }

          if (roomData.jid) {
            xmpp.presenceInRoomStanza(roomData.jid);
          }
        } catch (error) {
          // Ignore malformed room payloads and continue processing remaining rooms.
        }
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
    const errorInfo = handleErrorMessageStanza(stanza);
    const from = stanza.attrs.from || '';
    const roomJID = from.split('/')[0];
    const isMucRoom = roomJID.includes('@conference.');
    const condition = errorInfo?.condition?.toLowerCase() || '';
    const messageText = errorInfo?.message?.toLowerCase() || '';
    const shouldRecoverPresence =
      isMucRoom &&
      (condition === 'forbidden' ||
        condition === 'not-authorized' ||
        messageText.includes('only occupants are allowed'));

    ethoraLogger.log(
      `[XMPP] message_error condition=${errorInfo?.condition || 'unknown'} text="${errorInfo?.message || ''}" id=${stanza.attrs.id || ''} from=${from} to=${stanza.attrs.to || ''}`
    );

    if (!isMucRoom) {
      ethoraLogger.log(
        `[XMPP] message_error skip_presence reason=non_muc from=${from}`
      );
      return;
    }

    if (!shouldRecoverPresence) {
      ethoraLogger.log(
        `[XMPP] message_error skip_presence reason=unsupported_condition condition=${errorInfo?.condition || 'unknown'} from=${from}`
      );
      return;
    }

    if (roomJID && client) {
      try {
        await client.recoverRoomPresenceOnly(roomJID);
      } catch (e) {
        console.warn(
          `[XMPP] message_error presence_recovery_failed room=${roomJID || 'unknown'} error=${formatError(e)}`
        );
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

    ethoraLogger.log('Received XMPP error message:', {
      message: errorInfo?.message,
      errorInfo,
    });
    return errorInfo;
  }

  return null;
};

const onUserUpdate = async (stanza: Element) => {
  if (stanza.attrs?.type !== 'headline') return;

  const userUpdateElement = stanza.getChild('user-update');
  if (!userUpdateElement || userUpdateElement.attrs?.xmlns !== 'your:custom:ns') return;

  try {
    const attrs = userUpdateElement.attrs;
    const toLocalPart = (value?: string) => (value ? value.split('@')[0] : '');
    const xmppUsername =
      attrs.xmppUsername ||
      attrs.userId ||
      attrs._id ||
      attrs.id ||
      toLocalPart(stanza.attrs?.from);

    if (!xmppUsername) {
      console.warn('[UserUpdate] No xmppUsername found in stanza attributes');
      return;
    }

    // Build the partial update from all fields present in the stanza.
    const userUpdates: Partial<RoomMember> = {};
    if (attrs.firstName !== undefined) userUpdates.firstName = attrs.firstName;
    if (attrs.lastName !== undefined) userUpdates.lastName = attrs.lastName;
    if (attrs.photoURL !== undefined) userUpdates.profileImage = attrs.photoURL;
    if (attrs.description !== undefined) userUpdates.description = attrs.description;

    const state = store.getState();
    const usersSet = state.rooms.usersSet;

    // Patch every entry in usersSet whose key matches this xmppUsername.
    // Keys may be stored as a full bare JID or just the local part.
    const matchedUsers: RoomMember[] = Object.entries(usersSet)
      .filter(([key]) => key === xmppUsername || key.split('@')[0] === xmppUsername)
      .map(([, user]) => ({ ...(user as RoomMember), ...userUpdates }));

    if (matchedUsers.length > 0) {
      store.dispatch(insertUsers({ newUsers: matchedUsers }));
    } else {
      // User not yet in the set — create a minimal entry so future renders pick up the name.
      const newUser: RoomMember = {
        firstName: attrs.firstName || '',
        lastName: attrs.lastName || '',
        xmppUsername,
        _id: xmppUsername,
        ...userUpdates,
      };
      store.dispatch(insertUsers({ newUsers: [newUser] }));
    }

    (Object.values(state.rooms.rooms) as IRoom[]).forEach((room) => {
      if (!room.members?.length) return;

      const updatedMembers = room.members.map((member) => {
        const memberLocal = member?.xmppUsername?.split('@')[0] ?? '';
        if (memberLocal !== xmppUsername) return member;

        return {
          ...member,
          ...userUpdates,
          xmppUsername: member.xmppUsername || xmppUsername,
        };
      });

      const hasChanges = updatedMembers.some(
        (member, index) => member !== room.members?.[index]
      );

      if (hasChanges) {
        store.dispatch(updateRoom({ jid: room.jid, updates: { members: updatedMembers } }));
      }
    });

    ethoraLogger.log(
      `[UserUpdate] xmppUsername=${xmppUsername} firstName=${attrs.firstName ?? '-'} lastName=${attrs.lastName ?? '-'} matched=${matchedUsers.length}`
    );

    // Also update the current logged-in user's own state if it's them.
    const currentUser = state.chatSettingStore.user;
    const currentLocal = currentUser?.xmppUsername?.split('@')[0] ?? '';
    if (currentLocal && currentLocal === xmppUsername) {
      const userStateUpdates: Partial<User> = {};
      if (attrs.firstName !== undefined) userStateUpdates.firstName = attrs.firstName;
      if (attrs.lastName !== undefined) userStateUpdates.lastName = attrs.lastName;
      if (attrs.photoURL !== undefined) userStateUpdates.profileImage = attrs.photoURL;
      if (attrs.description !== undefined) userStateUpdates.description = attrs.description;
      if (Object.keys(userStateUpdates).length > 0) {
        store.dispatch(updateUser({ updates: userStateUpdates }));
      }
    }
  } catch (error) {
    console.error('[UserUpdate] Error processing stanza:', error);
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

    const roomCandidates = [
      attrs.chatName,
      stanza.attrs?.to,
      stanza.attrs?.from,
    ].filter(Boolean) as string[];

    const existingRoom = (Object.values(state.rooms.rooms) as IRoom[]).find((room) => {
      const roomLocal = room.jid?.split('@')[0];
      return roomCandidates.some(
        (candidate) => candidate === room.jid || candidate.split('@')[0] === roomLocal
      );
    });

    if (!existingRoom?.jid) {
      console.warn('[ChatUpdate] Chat update received but no matching room was found', {
        roomCandidates,
      });
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

    // Update room if we have any updates
    if (Object.keys(roomUpdates).length > 0) {
      store.dispatch(updateRoom({ jid: existingRoom.jid, updates: roomUpdates }));
      ethoraLogger.log(
        `[ChatUpdate] room=${existingRoom.jid} title=${attrs.title ?? '-'} description=${attrs.description ?? '-'}`
      );
    }
  } catch (error) {
    console.error('[ChatUpdate] Error processing stanza:', error);
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
