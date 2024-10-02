import xmpp, { Client, xml } from "@xmpp/client";
import { walletToUsername } from "../helpers/walletUsername";
import {
  getListOfRooms,
  handleComposing,
  onGetLastMessageArchive,
  onMessageHistory,
  onPresenceInRoom,
  onRealtimeMessage,
} from "./stanzaHandlers";
import { Element } from "ltx";

export class XmppClient {
  client!: Client;
  devServer: string | undefined;
  host: string;
  service: string;
  conference: string;
  username: string;
  onclose: () => void;
  onmessage: (data: any) => void;

  password = "";
  resource = "";

  //core functions
  // we pass walletAddress for XMPP user name and the XMPP password generated by DP/Ethora backend for this user

  checkOnline() {
    return this.client && this.client.status === "online";
  }

  constructor(username: string, password: string) {
    const url = `wss://${this.devServer || "xmpp.ethoradev.com:5443"}/ws`;
    // if (url.startsWith("wss")) {
    //   this.host = url.match(/wss:\/\/([^:/]+)/)[1];
    // } else {
    //   this.host = url.match(/ws:\/\/([^:/]+)/)[1];
    // }
    try {
      this.conference = `conference.${this.host}`;
      this.username = username;
      console.log("+-+-+-+-+-+-+-+-+ ", { username });
      this.service = url;

      this.client = xmpp.client({
        service: url,
        username: walletToUsername(username),
        password: password,
      });

      this.client.on("disconnect", () => {
        this?.onclose();
        this.client.stop();
      });
      this.client.on("error", () => console.log("xmpp client error"));

      // this.client.on("stanza", this.onStanza.bind(this));
      // this.client.on('stanza', (stanza) => {
      //     console.log('==print stanza==', stanza.toString())
      // })
      this.client.setMaxListeners(20);
      this.client
        .start()
        .then(() => console.log("started client"))
        .catch((error) => console.log(error, "There were an error"));

      this.client.setMaxListeners(20);

      this.client.on("online", (jid) => {
        getListOfRooms(this);
        console.log("Client is online");
      });

      this.client.on("stanza", (stanza) => {
        switch (stanza.name) {
          case "message":
            onRealtimeMessage(stanza);
            onMessageHistory(stanza);
            onGetLastMessageArchive(stanza, this);
            handleComposing(stanza, this.username);
            break;
          case "presence":
            onPresenceInRoom(stanza);
            break;
          case "iq":
            onRealtimeMessage(stanza);
            break;
          default:
            console.log("Unhandled stanza type:", stanza.name);
        }
      });

      this.client.on("offline", () => {
        console.log("offline");
      });

      this.client.on("error", (error) => {
        console.log("xmpp on error", error);
        console.log("xmpp error, terminating connection");
      });
    } catch (error) {
      console.error("An error occurred during initialization:", error);
    }
  }

  initPresence() {
    return new Promise((resolve, reject) => {
      try {
        this.client.send(xml("presence"));
        console.log("Successful presence");
        resolve("Presence sent successfully");
      } catch (error) {
        console.error("Error sending presence:", error);
        reject(error);
      }
    });
  }

  unsubscribe = (address: string) => {
    try {
      const message = xml(
        "iq",
        {
          from: this.client?.jid?.toString(),
          to: address,
          type: "set",
          id: "unsubscribe",
        },
        xml("unsubscribe", { xmlns: "urn:xmpp:mucsub:0" })
      );

      this.client.send(message);
    } catch (error) {
      console.error("An error occurred while unsubscribing:", error);
    }
  };

  getRooms = () => {
    return new Promise((resolve, reject) => {
      try {
        const message = xml(
          "iq",
          {
            type: "get",
            from: this.client.jid?.toString(),
            id: "getUserRooms",
          },
          xml("query", { xmlns: "ns:getrooms" })
        );

        this.client
          .send(message)
          .then(() => {
            console.log("getRooms successfully sent");
            resolve("Request to get rooms sent successfully");
          })
          .catch((error: any) => {
            console.error("Failed to send getRooms request:", error);
            reject(error);
          });
      } catch (error) {
        console.error("An error occurred while getting rooms:", error);
        reject(error);
      }
    });
  };

  //room functions
  leaveTheRoom = (roomJID: string) => {
    try {
      const presence = xml("presence", {
        from: this.client.jid?.toString(),
        to: roomJID + "/" + this.client.jid?.getLocal(),
        type: "unavailable",
      });
      this.client.send(presence);
    } catch (error) {
      console.error("An error occurred while leaving the room:", error);
    }
  };

  presenceInRoom = (roomJID: string) => {
    return new Promise((resolve, reject) => {
      try {
        const presence = xml(
          "presence",
          {
            from: this.client.jid?.toString(),
            to: `${roomJID}/${this.client.jid?.getLocal()}`,
            id: "presenceInRoom",
          },
          xml("x", { xmlns: "http://jabber.org/protocol/muc" })
        );

        this.client
          .send(presence)
          .then(() => {
            console.log("Presence in room successfully sent");
            resolve("Presence in room sent successfully");
          })
          .catch((error: any) => {
            console.error("Failed to send presence in room:", error);
            reject(error);
          });
      } catch (error) {
        console.error(
          "An error occurred while setting presence in room:",
          error
        );
        reject(error);
      }
    });
  };

  getArchive = (userJID: string) => {
    const message = xml(
      "iq",
      { type: "set", id: userJID },
      xml(
        "query",
        { xmlns: "urn:xmpp:mam:2", queryid: "userArchive" },
        xml("set", { xmlns: "http://jabber.org/protocol/rsm" }, xml("before"))
      )
    );
    this.client.send(message);
  };

  getHistory = async (chatJID: string, max: number, before?: number) => {
    const id = `get-history:${Date.now().toString()}`;

    let stanzaHdlrPointer: {
      (el: Element): void;
      (stanza: any): void;
    };

    const unsubscribe = () => {
      this.client.off("stanza", stanzaHdlrPointer);
    };

    const responsePromise = new Promise((resolve, reject) => {
      let messages: Element[] = [];

      stanzaHdlrPointer = (stanza) => {
        const result = stanza.getChild("result");

        if (
          stanza.is("message") &&
          stanza.attrs["from"] &&
          stanza.attrs["from"].startsWith(chatJID) &&
          result
        ) {
          const messageEl = result.getChild("forwarded")?.getChild("message");

          messages.push(messageEl);
        }

        if (
          stanza.is("iq") &&
          stanza.attrs["id"] === id &&
          stanza.attrs["type"] === "result"
        ) {
          let mainMessages: Record<string, string>[] = [];

          for (const msg of messages) {
            const text = msg.getChild("body")?.getText();

            if (text) {
              let parsedEl: Record<string, string> = {};

              parsedEl.text = text;
              parsedEl.from = msg.attrs["from"];
              parsedEl.id = msg.getChild("archived")?.attrs["id"];
              parsedEl.created = parsedEl.id.slice(0, 13);
              const data = msg.getChild("data");

              if (!data || !data.attrs) {
                continue;
              }

              for (const [key, value] of Object.entries(data.attrs)) {
                parsedEl[key] = value as string;
              }

              // ignore messages wich has isReply but there is no mainMessage field
              if (parsedEl.isReply === "true" && !parsedEl.mainMessage) {
                continue;
              }

              // fucntionality to not to add deleted messages into array
              // if (msg.getChild("deleted")?.attrs["timestamp"]) continue;

              if (parsedEl.mainMessage) {
                try {
                  parsedEl.mainMessage = JSON.parse(parsedEl.mainMessage);
                } catch (e) {
                  // ignore message if mainMessage is not parsable
                  continue;
                }
              }

              mainMessages.push(parsedEl);
            }
          }
          unsubscribe();
          resolve(mainMessages);
        }

        if (
          stanza.is("iq") &&
          stanza.attrs.id === id &&
          stanza.attrs.type === "error"
        ) {
          unsubscribe();
          reject();
        }
      };

      this.client?.on("stanza", stanzaHdlrPointer);

      const message = xml(
        "iq",
        {
          type: "set",
          to: chatJID,
          id: id,
        },
        xml(
          "query",
          { xmlns: "urn:xmpp:mam:2" },
          xml(
            "set",
            { xmlns: "http://jabber.org/protocol/rsm" },
            xml("max", {}, max.toString()),
            before ? xml("before", {}, before.toString()) : xml("before")
          )
        )
      );

      this.client
        ?.send(message)
        .catch((err) => console.log("err on load", err));
    });

    const timeoutPromise = createTimeoutPromise(10000, unsubscribe);

    try {
      const res = await Promise.race([responsePromise, timeoutPromise]);
      return res;
    } catch (e) {
      console.log("=-> error ", e);
      return null;
    }
  };

  getAndReceiveRoomInfo = (roomJID: string) => {
    const message = xml(
      "iq",
      {
        from: this.client.jid?.toString(),
        id: "roomInfo",
        to: roomJID,
        type: "get",
      },
      xml("query", { xmlns: "http://jabber.org/protocol/disco#info" })
    );
    return this.client.sendReceive(message);
  };

  getLastMessageArchive(roomJID: string) {
    // xmppMessagesHandler.isGettingMessages = true
    const message = xml(
      "iq",
      {
        type: "set",
        to: roomJID,
        id: "GetArchive",
      },
      xml(
        "query",
        { xmlns: "urn:xmpp:mam:2" },
        xml(
          "set",
          { xmlns: "http://jabber.org/protocol/rsm" },
          xml("max", {}, "1"),
          xml("before")
        )
      )
    );
    this.client.send(message);
  }

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
    const id = `send-message:${Date.now().toString()}`;

    try {
      const message = xml(
        "message",
        {
          to: roomJID,
          type: "groupchat",
          id: id,
        },
        xml("data", {
          xmlns: `wss://${this?.devServer || "xmpp.ethoradev.com:5443"}/ws`,
          senderFirstName: firstName,
          senderLastName: lastName,
          photoURL: photo,
          senderJID: this.client.jid?.toString(),
          senderWalletAddress: walletAddress,
          roomJid: roomJID,
          isSystemMessage: false,
          tokenAmount: 0,
          quickReplies: "",
          notDisplayedValue: "",
          showInChannel: true,
        }),
        xml("body", {}, userMessage)
      );
      this.client.send(message);
    } catch (error) {
      console.error("An error occurred while sending message:", error);
    }
  };

  deleteMessage(room: string, msgId: string) {
    const stanza = xml(
      "message",
      {
        from: this.client.jid?.toString(),
        to: room,
        id: "deleteMessageStanza",
        type: "groupchat",
      },
      xml("body", "wow"),
      xml("delete", {
        id: msgId,
      })
    );

    this.client.send(stanza);
  }

  sendTypingRequest(chatId: string, fullName: string, start: boolean) {
    let id = start ? `typing-${Date.now()}` : `stop-typing-${Date.now()}`;
    const stanza = xml(
      "message",
      {
        type: "groupchat",
        id: id,
        to: chatId,
      },
      xml(start ? "composing" : "paused", {
        xmlns: "http://jabber.org/protocol/chatstates",
      }),
      xml("data", {
        fullName: fullName,
      })
    );

    this.client?.send(stanza);
  }

  getChatsPrivateStoreRequest() {
    const id = `get-chats-private-req:${Date.now().toString()}`;
    let stanzaHdlrPointer: {
      (el: Element): void;
      (stanza: Element): void;
      (el: Element): void;
    };

    const unsubscribe = () => {
      this.client?.off("stanza", stanzaHdlrPointer);
    };

    const responsePromise = new Promise((resolve, _reject) => {
      stanzaHdlrPointer = (stanza: Element) => {
        if (stanza.is("iq") && stanza.attrs.id === id) {
          let chatjson = stanza.getChild("query")?.getChild("chatjson");

          if (chatjson) {
            resolve(chatjson.attrs.value);
          } else {
            resolve(null);
          }
        }
      };

      this.client?.on("stanza", stanzaHdlrPointer);

      const message = xml(
        "iq",
        {
          id: id,
          type: "get",
        },
        xml(
          "query",
          { xmlns: "jabber:iq:private" },
          xml("chatjson", { xmlns: "chatjson:store" })
        )
      );

      this.client?.send(message);
    });

    const timeoutPromise = createTimeoutPromise(2000, unsubscribe);

    return Promise.race([responsePromise, timeoutPromise]);
  }

  async actionSetTimestampToPrivateStore(chatId: string, timestamp: number) {
    let storeObj: any = await this.getChatsPrivateStoreRequest();

    if (storeObj && typeof storeObj === "object") {
      storeObj[chatId] = timestamp;

      const str = JSON.stringify(storeObj);
      await this.setChatsPrivateStoreRequest(str);
      return true;
    } else {
      await this.setChatsPrivateStoreRequest(
        JSON.stringify({ [chatId]: timestamp })
      );
      return true;
    }
  }

  // async actionSetChatViewedTimestamp() {
  //   const chat = store.chatStore.currentRoom;

  //   if (!chat) {
  //     return;
  //   }

  //   const timestamp = Date.now();

  //   await this.actionSetTimestampToPrivateStore(chat.localJid, timestamp);
  //   runInAction(() => rootStore.chatStore.setLastViewedTimestamp(timestamp));
  // }

  setChatsPrivateStoreRequest(jsonObj: string) {
    const id = `set-chats-private-req:${Date.now().toString()}`;
    let stanzaHdlrPointer: {
      (el: Element): void;
      (stanza: Element): void;
      (el: Element): void;
    };

    const unsubscribe = () => {
      this.client?.off("stanza", stanzaHdlrPointer);
    };

    const responsePromise = new Promise((resolve, _reject) => {
      stanzaHdlrPointer = (stanza: Element) => {
        if (stanza.is("iq") && stanza.attrs.id === id) {
          resolve(true);
        }
      };

      this.client?.on("stanza", stanzaHdlrPointer);

      const message = xml(
        "iq",
        {
          id: id,
          type: "set",
        },
        xml(
          "query",
          { xmlns: "jabber:iq:private" },
          xml("chatjson", { xmlns: "chatjson:store", value: jsonObj })
        )
      );

      this.client?.send(message);
    });

    const timeoutPromise = createTimeoutPromise(2000, unsubscribe);

    return Promise.race([responsePromise, timeoutPromise]);
  }

  sendMediaMessageStanza(roomJID: string, data: any) {
    const dataToSend = {
      senderJID: this.client.jid?.toString(),
      senderFirstName: data[0].firstName,
      senderLastName: data[0].lastName,
      senderWalletAddress: data[0].walletAddress,
      isSystemMessage: false,
      tokenAmount: "0",
      receiverMessageId: "0",
      mucname: data[0].chatName,
      photoURL: data[0].userAvatar ? data[0].userAvatar : "",
      isMediafile: true,
      createdAt: data[0].createdAt,
      expiresAt: data[0].expiresAt,
      fileName: data[0].fileName,
      isVisible: data[0].isVisible,
      location: data[0].location,
      locationPreview: data[0].locationPreview,
      mimetype: data[0].mimetype,
      originalName: data[0].originalName,
      ownerKey: data[0].ownerKey,
      size: data[0].size,
      duration: data[0]?.duration,
      updatedAt: data[0].updatedAt,
      userId: data[0].userId,
      waveForm: data[0].waveForm,
      attachmentId: data[0]?.attachmentId,
      isReply: data[0]?.isReply,
      mainMessage: data[0]?.mainMessage,
      roomJid: data[0]?.roomJid,
    };

    console.log(dataToSend);

    const message = xml(
      "message",
      {
        id: "sendMessage",
        type: "groupchat",
        from: this.client.jid?.toString(),
        to: roomJID,
      },
      xml("body", {}, "media"),
      xml("store", { xmlns: "urn:xmpp:hints" }),
      xml("data", dataToSend)
    );

    this.client.send(message);
  }
}

export default XmppClient;

function createTimeoutPromise(
  ms: number | undefined,
  unsubscribe: { (): void; (): void }
) {
  return new Promise((_, reject) => {
    setTimeout(() => {
      try {
        unsubscribe();
      } catch (e) {}
      reject();
    }, ms);
  });
}
