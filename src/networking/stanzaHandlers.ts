import { Element } from 'ltx';
import { store } from '../roomStore';
import {
  addRoom,
  addRoomMessage,
  deleteRoomMessage,
  editRoomMessage,
  setComposing,
  setCurrentRoom,
  setLastViewedTimestamp,
  setReactions,
  setRoomRole,
  updateRoom,
} from '../roomStore/roomsSlice';
import { IRoom } from '../types/types';
import { createMessageFromXml } from '../helpers/createMessageFromXml';
import { setDeleteModal } from '../roomStore/chatSettingsSlice';
import { getDataFromXml } from '../helpers/getDataFromXml';

// TO DO: we are thinking to refactor this code in the following way:
// each stanza will be parsed for 'type'
// then it will be handled based on the type
// XMPP parsing will be done universally as a pre-processing step
// then handlers for different types will work with a Javascript object
// types: standard, coin transfer, is composing, attachment (media), token (nft) or smart contract
// types can be added into our chat protocol (XMPP stanza add field type="") to make it easier to parse here

//core default
const onRealtimeMessage = async (stanza: Element) => {
  if (
    !stanza?.getChild('result') &&
    !stanza.getChild('composing') &&
    !stanza.getChild('paused') &&
    !stanza.getChild('subject') &&
    !stanza.is('iq') &&
    stanza?.attrs?.id !== 'deleteMessageStanza' &&
    !stanza?.attrs?.id?.includes('message-reaction')
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
      ...data.data,
      ...rest,
    });

    store.dispatch(
      addRoomMessage({
        roomJID: stanza.attrs.from.split('/')[0],
        message,
      })
    );
    return message;
  }
};

const onReactionMessage = async (stanza: Element) => {
  if (stanza?.attrs?.id?.includes('message-reaction')) {
    const reaction = stanza.getChild('reactions');
    console.log('stanza', stanza);
    console.log('reaction', reaction);
    console.log('reactionBody', reaction.children[0]);
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
  const reactions = stanza
    .getChild('result')
    ?.getChild('forwarded')
    ?.getChild('message')
    ?.getChild('reactions');

  if (!reactions) {
    return;
  }

  const stanzaId = stanza
    .getChild('result')
    ?.getChild('forwarded')
    ?.getChild('message')
    ?.getChild('stanza-id');

  const messageId = reactions.attrs.id;

  const reactionList: string[] = reactions.children.map(
    (emoji: { children: any[] }) => emoji.children[0]
  );

  store.dispatch(
    setReactions({
      roomJID: stanzaId.attrs.by,
      messageId,
      reactions: reactionList,
    })
  );
};

const onMessageHistory = async (stanza: any) => {
  //here logic to add interactions and here too

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
      ...data.data,
      ...rest,
    });

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
      currentUser?.toLowerCase() !== composingUser?.replace(/_/g, '')
    ) {
      const chatJID = stanza.attrs?.from.split('/')[0];

      let composingList = [];

      !!stanza?.getChild('composing')
        ? composingList.push(
            stanza.getChild('data').attrs?.fullName?.split(' ')?.[0] || 'User'
          )
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

const onChatInvite = async (stanza: Element, client: any) => {
  if (stanza.is('message') && stanza.attrs['type'] !== 'groupchat') {
    // check if it is invite
    const chatId = stanza.attrs.from;
    const xEls = stanza.getChildren('x');

    for (const el of xEls) {
      const child = el.getChild('invite');

      if (child) {
        const chat = store.getState().rooms.rooms[chatId];
        if (chat) {
          return;
        }

        await client.presenceInRoomStanza(chatId);
        await client.getRoomsStanza();
      }
    }
  }
};

const onGetMembers = (stanza: Element) => {
  const jid = store.getState().rooms.activeRoomJID;
  if (stanza.attrs.id.toString() === 'roomMemberInfo') {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(stanza.toString(), 'text/xml');

    // Extract activities
    const roomMembers = Array.from(xmlDoc.getElementsByTagName('activity')).map(
      (activity) => ({
        name: activity.getAttribute('name'),
        role: activity.getAttribute('role'),
        ban_status: activity.getAttribute('ban_status'),
        last_active: Number(activity.getAttribute('last_active')),
        jid: activity.getAttribute('jid'),
      })
    );

    store.dispatch(updateRoom({ jid, updates: { roomMembers } }));
  }
};

const onGetRoomInfo = (stanza: Element) => {
  if (stanza.attrs.id === 'roomInfo' && !stanza.getChild('error')) {
  }
};

const onGetLastMessageArchive = (stanza: Element, xmpp: any) => {
  if (stanza.attrs.id === 'GetLastArchive') {
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

      const isRoomAlreadyAdded = Object.values(currentChatRooms).some(
        (element) => element.jid === result?.attrs?.jid
      );

      if (!isRoomAlreadyAdded) {
        try {
          const roomData: IRoom = {
            jid: result?.attrs?.jid || '',
            name: result?.attrs?.name || '',
            id: '',
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
          xmpp.getChatsPrivateStoreRequestStanza();
        } catch (error) {}
      }
    });
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
  onReactionMessage,
  onDeleteMessage,
  onEditMessage,
  onChatInvite,
};
