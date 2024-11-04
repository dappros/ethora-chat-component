import { Element } from 'ltx';
import { store } from '../roomStore';
import {
  addRoom,
  addRoomMessage,
  setComposing,
  setCurrentRoom,
  setRoomRole,
} from '../roomStore/roomsSlice';
import { IRoom } from '../types/types';

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
    roomJid?: any;
    tokenAmount?: any;
    quickReplie?: any;
    notDisplayedValue?: any;
    showInChannel?: any;
  },
  body: Element | undefined,
  id: string,
  from: any
): Promise<any> => {
  // change to iMESSAGES
  if (!body || typeof body.getText !== 'function') {
    throw new Error("Invalid body: 'getText' method is missing.");
  }

  if (!data || !id || !from) {
    console.log('Invalid arguments: data, id, and from are required.');
  }

  const message = {
    id: id,
    body: body.getText(),
    roomJID: from,
    date: new Date(+id.slice(0, 13)).toISOString(),
    key: `${Date.now() + Number(id)}`,
    numberOfReplies: data?.numberOfReplies,
    isSystemMessage: data?.isSystemMessage,
    isMediafile: data?.isMediafile,
    locationPreview: data?.locationPreview,
    mimetype: data?.mimetype,
    location: data?.location,
    user: {
      id: data.senderWalletAddress,
      name: `${data.senderFirstName} ${data.senderLastName}`,
      avatar: data.photoURL,
      jid: data.senderJID,
      token: data.token,
      refreshToken: data.refreshToken,
    },
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
    !stanza.is('iq')
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

    // console.log(stanza.attrs.from);

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
    if (
      composingUser &&
      currentUser.toLowerCase() !== composingUser?.replace(/_/g, '')
    ) {
      const chatJID = stanza.attrs?.from.split('/')[0];

      store.dispatch(
        setComposing({
          chatJID: chatJID,
          composing: !!stanza?.getChild('composing'),
        })
      );
    }
  }
};

const onPresenceInRoom = (stanza: Element | any) => {
  if (stanza.attrs.id === 'joinByPresence' && !stanza.getChild('error')) {
    console.log(stanza.toString());

    const roomJID: string = stanza.attrs.from.split('/')[0];
    const role: string = stanza?.children[1]?.children[0]?.attrs.role;
    store.dispatch(setRoomRole({ chatJID: roomJID, role: role }));
  }
};

const onGetLastMessageArchive = (stanza: Element, xmpp: any) => {
  if (stanza.attrs.id === 'sendMessage') {
    const data = stanza.getChild('stanza-id');
    if (data) {
      xmpp.getLastMessageArchiveStanza(data.attrs.by);
      return;
    }
    return onMessageHistory(stanza);
  }
};

const onGetChatRooms = (stanza: Element, xmpp: any) => {
  if (
    stanza.attrs.id === 'getUserRooms' &&
    stanza.getChild('query')?.children
  ) {
    console.log(stanza.toString());

    stanza.getChild('query')?.children.forEach((result: any) => {
      const currentChatRooms = store.getState().rooms.rooms;

      const currentSavedChatRoom = Object.values(currentChatRooms).filter(
        (element) => element.jid === result?.attrs.jid
      );
      if (currentSavedChatRoom.length === 0 || currentSavedChatRoom[0]) {
        const roomData: IRoom = {
          jid: result?.attrs?.jid,
          name: result?.attrs?.name || '',
          id: '',
          title: result?.attrs.name,
          usersCnt: Number(result?.attrs.users_cnt),
          messages: [],
          isLoading: false,
          roomBg:
            result?.attrs.room_background !== 'none'
              ? result?.attrs.room_background
              : null,
          icon:
            result?.attrs.room_thumbnail !== 'none'
              ? result?.attrs.room_thumbnail
              : null,
        };
        store.dispatch(addRoom({ roomData }));
        if (!store.getState().rooms.activeRoomJID) {
          store.dispatch(setCurrentRoom({ roomJID: roomData?.jid }));
        }
        xmpp.presenceInRoomStanza(result.attrs.jid);
        // if (
        //   currentSavedChatRoom.length > 0 &&
        // ) {
        //   useStoreState.getState().updateUserChatRoom(roomData)
        // } else {
        //   useStoreState.getState().setNewUserChatRoom(roomData)
        // }
        // //get message history in the room
        // xmpp.getRoomArchiveStanza(roomJID, 1)
        // this.lastRomJIDLoading = roomJID
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
};
