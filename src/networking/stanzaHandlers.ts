import { xml } from "@xmpp/client";
import { Element } from "ltx";
import { store } from "../roomStore";
import { addRoom, addRoomMessage } from "../roomStore/roomsSlice";
import { IRoom } from "../types/types";

// TO DO: we are thinking to refactor this code in the following way:
// each stanza will be parsed for 'type'
// then it will be handled based on the type
// XMPP parsing will be done universally as a pre-processing step
// then handlers for different types will work with a Javascript object
// types: standard, coin transfer, is composing, attachment (media), token (nft) or smart contract
// types can be added into our chat protocol (XMPP stanza add field type="") to make it easier to parse here

export const createMessage = (
  data: any,
  body: any,
  id: string,
  from: string
) => {
  //here add props changer, cause we get other stanza props

  //   {
  //     "xmlns": "wss://dev.dxmpp.com:5443/ws",
  //     "senderFirstName": "Raze",
  //     "senderLastName": "Yuki",
  //     "photoURL": "https://lh3.googleusercontent.com/a/ACg8ocLPzhjmRoDe9ZXawhnZN3nd0eEhrqoKwRicJyM6q2z_=s96-c",
  //     "senderJID": "0x6816810a7_fe04_f_c9b800f9_d11564_c0e4a_e_c25_d78@dev.dxmpp.com/117879936120407221356323",
  //     "senderWalletAddress": "0x6816810a7Fe04FC9b800f9D11564C0e4aEC25D78",
  //     "roomJid": "e8b1e5297ac89ceb78341dd870ab12150d9903f4e6e799a8176b13f47ff22553@conference.dev.dxmpp.com",
  //     "isSystemMessage": "false",
  //     "tokenAmount": "0",
  //     "quickReplies": "",
  //     "notDisplayedValue": ""
  // }

  const message = {
    id: id,
    body: body.getText(),
    roomJID: from,
    date: new Date(+id.slice(0, 13)).toISOString(),
    key: `${Date.now() + Number(id)}`,
    coinsInMessage: data?.coinsInMessage,
    numberOfReplies: data?.numberOfReplies,
    isSystemMessage: data?.isSystemMessage,
    isMediafile: data?.isMediafile,
    locationPreview: data?.locationPreview,
    mimetype: data?.mimetype,
    location: data?.location,
    user: {
      id: data?.senderWalletAddress,
      name: `${data?.senderFirstName} ${data?.senderLastName}`,
      avatar: data?.photoURL,
      jid: data?.senderJID,
      token: data.token,
      refreshToken: data.refreshToken,
    },
  };
  return message;
};

//core default
const onRealtimeMessage = async (stanza: Element) => {
  if (stanza.attrs.id === "sendMessage") {
    const body = stanza?.getChild("body");
    const data = stanza?.getChild("data");
    const replace = stanza?.getChild("replaced");
    const archived = stanza?.getChild("archived");
    const id = stanza.getChild("archived")?.attrs.id;

    console.log("new message->>", stanza);
    if (!data || !body || !id) {
      return;
    }

    if (
      !data.attrs.senderFirstName ||
      !data.attrs.senderLastName ||
      !data.attrs.senderJID
    ) {
      return;
    }

    const message = createMessage(data, body, id, stanza.attrs.from);

    store.dispatch(
      addRoomMessage({
        roomJID: store.getState().rooms.activeRoom?.jid || "test",
        message,
      })
    );

    return message;
  }
};

const onMessageHistory = async (stanza: any) => {
  // console.log("<===", stanza.toString());
  if (
    stanza.is("message") &&
    stanza.children[0].attrs.xmlns === "urn:xmpp:mam:2"
  ) {
    const body = stanza
      .getChild("result")
      ?.getChild("forwarded")
      ?.getChild("message")
      ?.getChild("body");
    const data = stanza
      .getChild("result")
      ?.getChild("forwarded")
      ?.getChild("message")
      ?.getChild("data");
    const delay = stanza
      .getChild("result")
      ?.getChild("forwarded")
      ?.getChild("delay");
    const replace = stanza
      .getChild("result")
      ?.getChild("forwarded")
      ?.getChild("message")
      ?.getChild("replaced");

    const id = stanza.getChild("result")?.attrs.id;
    if (!data || !body || !delay || !id) {
      return;
    }

    if (
      !data.attrs.senderFirstName ||
      !data.attrs.senderLastName ||
      !data.attrs.senderJID
    ) {
      return;
    }

    const message = createMessage(data.attrs, body, id, stanza.attrs.from);

    store.dispatch(
      addRoomMessage({
        roomJID: store.getState().rooms.activeRoom?.jid || "test",
        message,
      })
    );
  }
};

const getListOfRooms = (xmpp: any) => {
  console.log("xmpp", xmpp);
  xmpp.client.send(xml("presence"));
  // xmpp.getArchive(xmpp.client?.jid?.toString());
  xmpp.getArchive("0x6C394B10F5Da4141b99DB2Ad424C5688c3f202B3");
  xmpp.getRooms();
};

const onPresenceInRoom = (stanza: Element | any) => {
  if (stanza.attrs.id === "presenceInRoom") {
    const roomJID: string = stanza.attrs.from.split("/")[0];
    const role: string = stanza?.children[1]?.children[0]?.attrs.role;
    // console.log({ roomJID, role });
  }
};

const onGetLastMessageArchive = (stanza: Element, xmpp: any) => {
  if (stanza.attrs.id === "sendMessage") {
    const data = stanza.getChild("stanza-id");
    if (data) {
      xmpp.getLastMessageArchive(data.attrs.by);
      return;
    }
    return onMessageHistory(stanza);
  }
};

const onGetChatRooms = (stanza: Element, xmpp: any) => {
  console.log(stanza.attrs.id);
  if (
    stanza.attrs.id === "getUserRooms" &&
    stanza.getChild("query")?.children
  ) {
    let roomJID: string = "";
    stanza.getChild("query")?.children.forEach((result: any) => {
      const currentChatRooms = store.getState().rooms.rooms;

      if (result?.attrs.name) {
        const currentSavedChatRoom = Object.values(currentChatRooms).filter(
          (element) => element.jid === result?.attrs.jid
        );
        if (currentSavedChatRoom.length === 0 || currentSavedChatRoom[0]) {
          roomJID = result.attrs.jid;
          xmpp.presenceInRoom(roomJID);
          console.log("Room info", result?.attrs);
          const roomData: IRoom = {
            jid: roomJID,
            name: result?.attrs.name,
            id: "",
            title: result?.attrs.name,
            usersCnt: Number(result?.attrs.users_cnt),
            messages: [],
          };
          store.dispatch(addRoom({ roomData }));
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
      }
    });
  }
};

export {
  getListOfRooms,
  onRealtimeMessage,
  onMessageHistory,
  onPresenceInRoom,
  onGetLastMessageArchive,
  onGetChatRooms,
};
