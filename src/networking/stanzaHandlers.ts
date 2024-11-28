import { Element } from 'ltx';
import { store } from '../roomStore';
import {
  addRoom,
  addRoomMessage,
  deleteRoomMessage,
  setComposing,
  setCurrentRoom,
  setIsLoading,
  setLastViewedTimestamp,
  setRoomRole,
  updateRoom,
} from '../roomStore/roomsSlice';
import { IMessage, IRoom } from '../types/types';
import { setDeleteModal } from '../roomStore/chatSettingsSlice';

// TO DO: we are thinking to refactor this code in the following way:
// each stanza will be parsed for 'type'
// then it will be handled based on the type
// XMPP parsing will be done universally as a pre-processing step
// then handlers for different types will work with a Javascript object
// types: standard, coin transfer, is composing, attachment (media), token (nft) or smart contract
// types can be added into our chat protocol (XMPP stanza add field type="") to make it easier to parse here

export const createMessage = async (
  data: {
    [x: string]: any;
    coinsInMessage?: any;
    numberOfReplies?: any;
    isSystemMessage?: any;
    isMediafile?: any;
    locationPreview?: any;
    mimetype?: any;
    location?: any;
    senderWalletAddress?: any;
    senderFirstName?: any;
    senderLastName?: any;
    photoURL?: any;
    senderJID?: any;
    token?: any;
    refreshToken?: any;
    roomJid?: string;
    tokenAmount?: any;
    quickReplie?: any;
    notDisplayedValue?: any;
    showInChannel?: any;

    //attachment
    attachmentId?: any;
    createdAt?: any;
    expiresAt?: any;
    fileName?: any;
    originalName?: any;
    ownerKey?: any;
    receiverMessageId?: any;
    size?: any;
    updatedAt?: any;
    userId?: any;
  },
  body: Element | undefined,
  id: string,
  from: string,
): Promise<any> => {
  // change to iMESSAGES
  if (!body || typeof body.getText !== 'function') {
    throw new Error("Invalid body: 'getText' method is missing.");
  }

  if (!data || !id || !from) {
    console.log('Invalid arguments: data, id, and from are required.');
  }

  const message: IMessage = {
    id: id,
    body: body.getText(),
    roomJID: from,
    date: new Date(+id?.slice(0, 13)).toISOString(),
    key: `${Date.now() + Number(id)}`,
    numberOfReplies: data?.numberOfReplies,
    isSystemMessage: data?.isSystemMessage,
    isMediafile: data?.isMediafile,
    locationPreview: data?.locationPreview,
    mimetype: data?.mimetype,
    location: data?.location,
    isReply: false,
    isDeleted: body.children[0] === 'deleted',
    mainMessage: '',
    user: {
      id: data.senderWalletAddress,
      name: `${data.senderFirstName} ${data.senderLastName}`,
      profileImage: data.photoURL,
      token: data.token,
      refreshToken: data.refreshToken,
    },
    ...data,
  };

  return message;
};

//core default
const onRealtimeMessage = async (stanza: Element) => {
  if (
    !stanza?.getChild('result') &&
    !stanza.getChild('composing') &&
    !stanza.getChild('paused') &&
    !stanza.getChild('subject') &&
    !stanza.is('iq') &&
    stanza.attrs.id !== 'deleteMessageStanza'
  ) {
    const body = stanza?.getChild('body');
    const archived = stanza?.getChild('archived');
    const data = stanza?.getChild('data');
    const id = archived?.attrs.id;

    if (!data) {
      console.log(stanza.toString());
      console.log('Missing data elements in real-time message.');
      return;
    }

    if (!data.attrs.senderJID) {
      console.log(stanza.toString());
      console.log(data.attrs.senderJID);

      console.log('Missing sender information in real-time message.');
      return;
    }

    const message = await createMessage(
      data.attrs,
      body,
      id,
      stanza.attrs.from
    );

    store.dispatch(
      addRoomMessage({
        roomJID: stanza.attrs.from.split('/')[0],
        message,
      })
    );
    return message;
  }
};

const onDeleteMessage = async (stanza: Element) => {
  if (stanza.attrs.id === 'deleteMessageStanza') {
    const deleted = stanza.getChild('delete');
    const stanzaId = stanza.getChild('stanza-id');

    if (!deleted) {
      return;
    }

    store.dispatch(deleteRoomMessage({
      roomJID: stanzaId.attrs.by,
      messageId: deleted.attrs.id,
    }));
    store.dispatch(setDeleteModal({isDeleteModal: false}))
  };
};

const onMessageHistory = async (stanza: any) => {
  if (
    stanza.is('message') &&
    stanza.children[0].attrs.xmlns === 'urn:xmpp:mam:2'
  ) {
    // console.log("stanza -->", stanza.toString());
    const body = stanza
      .getChild('result')
      ?.getChild('forwarded')
      ?.getChild('message')
      ?.getChild('body');
    const data = stanza
      .getChild('result')
      ?.getChild('forwarded')
      ?.getChild('message')
      ?.getChild('data');
    const delay = stanza
      .getChild('result')
      ?.getChild('forwarded')
      ?.getChild('delay');

    const id = stanza.getChild('result')?.attrs.id;

    if (!delay) {
      if (stanza.getChild('subject')) {
        console.log('Subject.');
        return;
      }
      if (!data || !body || !id) {
        console.log('Missing required elements in message history.');
        return;
      }
    }

    if (
      !data?.attrs ||
      !data.attrs.senderFirstName ||
      !data.attrs.senderLastName ||
      !data.attrs.senderJID
    ) {
      // console.log(
      //   "Missing sender information in message history.",
      //   stanza.toString()
      // );
      return;
    }
   
    const message = await createMessage(
      data.attrs,
      body,
      id,
      stanza.attrs.from
    );

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
    console.log(
      stanza.getChild('data').attrs?.fullName,
      stanza.attrs?.from.split('/')[0]
    );

    if (
      composingUser &&
      currentUser.toLowerCase() !== composingUser?.replace(/_/g, '')
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
        await client.getRooms();
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
  console.log(stanza.attrs.from);
  store.dispatch(setCurrentRoom({ roomJID: stanza.attrs.from }));
  xmpp.getRooms();
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
          };

          store.dispatch(addRoom({ roomData: { ...roomData } }));

          let lastViewedTimestamp = '0';
          if (result?.attrs?.jid) {
            lastViewedTimestamp =
              await xmpp.getChatsPrivateStoreRequestStanza();
          }

          store.dispatch(
            setLastViewedTimestamp({
              chatJID: roomData.jid,
              timestamp: Number(
                lastViewedTimestamp?.split(':')?.[1]?.split('}')?.[0] || 0
              ),
            })
          );

          if (!store.getState().rooms.activeRoomJID) {
            store.dispatch(setCurrentRoom({ roomJID: roomData.jid }));
          }

          if (roomData.jid) {
            xmpp.presenceInRoomStanza(roomData.jid);
          }
        } catch (error) {
          console.log(error);
        }
      }
    });
  }
};

export {
  onRealtimeMessage,
  onMessageHistory,
  onPresenceInRoom,
  onGetLastMessageArchive,
  handleComposing,
  onGetChatRooms,
  onNewRoomCreated,
  onGetMembers,
  onGetRoomInfo,
  onDeleteMessage,
  onChatInvite,
};
