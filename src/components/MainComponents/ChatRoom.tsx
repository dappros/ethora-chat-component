import React, { useState, useEffect, useCallback } from "react";
import {
  ChatContainer,
  ChatContainerHeader,
  ChatContainerHeaderLabel,
} from "../styled/StyledComponents";
import { useSelector, useDispatch } from "react-redux";
import { RootState } from "../../roomStore";
import MessageList from "./MessageList";
import { IConfig, IRoom, User } from "../../types/types";
import SendInput from "../styled/SendInput";
import {
  addRoom,
  addRoomMessage,
  setIsLoading,
  setLastViewedTimestamp,
} from "../../roomStore/roomsSlice";
import Loader from "../styled/Loader";
import { uploadFile } from "../../networking/apiClient";
import RoomList from "./RoomList";
import { useXmppClient } from "../../context/xmppProvider.tsx";
import ChatHeader from "./ChatHeader.tsx";

interface ChatRoomProps {
  roomJID?: string;
  defaultUser: User;
  isLoading?: boolean;
  room: IRoom;
  CustomMessageComponent?: any;
  MainComponentStyles?: any;
  config?: IConfig;
}

const ChatRoom: React.FC<ChatRoomProps> = React.memo(
  ({ room, roomJID, CustomMessageComponent, MainComponentStyles, config }) => {
    const { client } = useXmppClient();
    const dispatch = useDispatch();

    const [currentRoom, setCurrentRoom] = useState(room);
    const { roomsStore, loading, user } = useSelector((state: RootState) => ({
      roomsStore: state.rooms.rooms,
      loading: state.rooms[room.jid]?.isLoading || false,
      user: state.chatSettingStore.user,
    }));

    useEffect(() => {
      const roomToSet = roomJID ? roomsStore[roomJID] : room;
      if (!roomsStore[roomToSet.jid]) {
        dispatch(addRoom({ roomData: roomToSet }));
      }
      setCurrentRoom(roomToSet);
    }, [dispatch, roomsStore, room, roomJID]);

    const sendMessage = useCallback((message: string) => {
      // dispatch(
      //   addRoomMessage({
      //     roomJID: currentRoom.jid,
      //     message: {
      //       id: getHighResolutionTimestamp(),
      //       user: {
      //         ...user,
      //         id: user.walletAddress,
      //         name: user.firstName + " " + user.lastName,
      //       },
      //       date: new Date().toISOString(),
      //       body: message,
      //       roomJID: currentRoom.jid,
      //       // pending: true,
      //     },
      //   })
      // );
      dispatch(
        setLastViewedTimestamp({
          chatJID: currentRoom.jid,
          timestamp: undefined,
        })
      );
      client?.sendMessage(
        currentRoom.jid,
        user.firstName,
        user.lastName,
        "",
        user.walletAddress,
        message
      );
    }, []);

    const sendStartComposing = useCallback(() => {
      console.log(currentRoom.jid);
      client.sendTypingRequest(
        currentRoom.jid,
        `${user.firstName} ${user.lastName}`,
        true
      );
    }, []);

    const sendEndComposing = useCallback(() => {
      client.sendTypingRequest(
        currentRoom.jid,
        `${user.firstName} ${user.lastName}`,
        false
      );
    }, []);

    const loadMoreMessages = useCallback(
      async (chatJID: string, max: number, idOfMessageBefore?: number) => {
        if (!loading) {
          dispatch(setIsLoading({ chatJID: chatJID, loading: true }));
          client?.getHistory(chatJID, max, idOfMessageBefore).then((resp) => {
            console.log("getting history by scroll");
            dispatch(setIsLoading({ chatJID: chatJID, loading: false }));
          });
        }
      },
      [client]
    );

    const sendMedia = useCallback(
      async (data: any, type: string) => {
        let mediaData: FormData | null = new FormData();
        if (type === "audio") {
          mediaData.append(
            "audio",
            data,
            `${new Date().getTime()}-recording-${
              user.firstName + " " + user.lastName
            }.webm`
          );
        } else {
          mediaData.append(
            "media",
            data,
            `${new Date().getTime()}-media-${
              user.firstName + " " + user.lastName
            }`
          );
        }
        for (let pair of mediaData.entries()) {
          console.log(pair[0] + ": " + pair[1]);
        }
        console.log(mediaData.toString());
        false === true &&
          uploadFile(mediaData, user.token)
            .then((response) => {
              console.log("Upload successful", response);
            })

            .catch((error) => {
              console.error("Upload failed", error);
            })
            .then((result: any) => {
              console.log(result);
              let userAvatar = "";
              result.data.results.map(async (item: any) => {
                const data = {
                  firstName: user.firstName,
                  lastName: user.lastName,
                  walletAddress: user.walletAddress,
                  chatName: currentRoom.name,
                  userAvatar: userAvatar,
                  createdAt: item.createdAt,
                  expiresAt: item.expiresAt,
                  fileName: item.filename,
                  isVisible: item.isVisible,
                  location: item.location,
                  locationPreview: item.locationPreview,
                  mimetype: item.mimetype,
                  originalName: item.originalname,
                  ownerKey: item.ownerKey,
                  size: item.size,
                  duration: item?.duration,
                  updatedAt: item.updatedAt,
                  userId: item.userId,
                  waveForm: "",
                  attachmentId: item._id,
                  wrappable: true,
                  roomJid: currentRoom,
                };
                console.log(data, "data to send media");
                client?.sendMediaMessageStanza(currentRoom.jid, data);
              });
            })
            .catch((error) => {
              console.log(error);
            });
      },
      [client, currentRoom.jid]
    );

    useEffect(() => {
      setTimeout(() => {
        dispatch(setIsLoading({ chatJID: currentRoom.jid, loading: true }));

        client
          .initPresence()
          .then(() => client.getRooms())
          .then(() => client.presenceInRoom(currentRoom.jid))
          .then(async () => {
            const res: any = await client.getChatsPrivateStoreRequest();

            const entries = Object.entries(JSON.parse(res));
            if (entries.length > 0) {
              const [chatJID, timestamp] = entries[0];
              console.log(chatJID, timestamp);
              dispatch(
                setLastViewedTimestamp({
                  chatJID,
                  // @ts-expect-error
                  timestamp,
                })
              );
            }
          })
          .then(() => {
            client.getHistory(currentRoom.jid, 30);
          })
          .then(() => {
            console.log("here setting false");
            dispatch(
              setIsLoading({ chatJID: currentRoom.jid, loading: false })
            );
          });
      }, 1000);
    }, [user, currentRoom.jid]);

    if (!room) {
      return <>No room</>;
    }

    if (loading) {
      console.log(loading, "= loading");
      return <Loader color={config?.colors?.primary} />;
    }

    return (
      <ChatContainer
        style={{ maxHeight: "100vh", overflow: "auto", ...MainComponentStyles }}
      >
        {!config?.disableHeader && <ChatHeader currentRoom={currentRoom} />}
        {(!loading && !roomsStore[currentRoom.jid].messages) ||
        roomsStore[currentRoom.jid].messages.length < 1 ? (
          <div
            style={{
              height: "100%",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <>No messages yet</>
          </div>
        ) : (
          <MessageList
            loadMoreMessages={loadMoreMessages}
            messages={roomsStore[room.jid].messages}
            CustomMessage={CustomMessageComponent}
            user={user}
            room={currentRoom}
            config={config}
          />
        )}
        <SendInput
          sendMessage={sendMessage}
          sendMedia={sendMedia}
          config={config}
          onFocus={sendStartComposing}
          onBlur={sendEndComposing}
          isLoading={loading}
        />
      </ChatContainer>
    );
  }
);

export default ChatRoom;
