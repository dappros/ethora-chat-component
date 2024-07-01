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

export const createMessage = async (
  data: any,
  body: any,
  id: string,
  from: string
) => {
  if (!body || typeof body.getText !== "function") {
    throw new Error("Invalid body: 'getText' method is missing.");
  }

  if (!data || !id || !from) {
    console.log("Invalid arguments: data, id, and from are required.");
  }

  //here add props changer, cause we get other stanza props

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
  if (stanza.attrs.id === "sendMessage") {
    const body = stanza?.getChild("body");
    const data = stanza?.getChild("data");
    const replace = stanza?.getChild("replaced");
    const archived = stanza?.getChild("archived");
    const id = stanza.getChild("archived")?.attrs.id;

    if (!data) {
      console.log("Missing required elements in real-time message.");
      console.log({ data, replace, archived, body });
      return;
    }

    if (
      !data.attrs.senderFirstName ||
      !data.attrs.senderLastName ||
      !data.attrs.senderJID
    ) {
      console.log("Missing sender information in real-time message.");
      return;
    }

    const message = await createMessage(
      data.attrs,
      body,
      id,
      stanza.attrs.from
    );

    console.log("Processed real-time message:", message);
    return message;
  }
};

const onMessageHistory = async (stanza: any) => {
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
      console.log("Missing required elements in message history.");
      return;
    }

    if (
      !data.attrs.senderFirstName ||
      !data.attrs.senderLastName ||
      !data.attrs.senderJID
    ) {
      console.log("Missing sender information in message history.");
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
        roomJID: store.getState().rooms.activeRoom?.jid || "test",
        message,
      })
    );
  }
};

const getListOfRooms = (xmpp: any) => {
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
