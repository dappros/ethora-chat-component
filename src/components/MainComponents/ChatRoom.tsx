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
  setCurrentRoom,
  setIsLoading,
  setLastViewedTimestamp,
} from "../../roomStore/roomsSlice";
import Loader from "../styled/Loader";
import { uploadFile } from "../../networking/apiClient";
import RoomList from "./RoomList";
import { useXmppClient } from "../../context/xmppProvider.tsx";
import ChatHeader from "./ChatHeader.tsx";
import NoMessagesPlaceholder from "./NoMessagesPlaceholder.tsx";

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

    const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
    const { roomsStore, loading, user, activeRoom } = useSelector(
      (state: RootState) => ({
        activeRoom: state.rooms.currentRoom,
        roomsStore: state.rooms.rooms,
        loading: state.rooms.rooms[room.jid]?.isLoading || false,
        user: state.chatSettingStore.user,
      })
    );

    useEffect(() => {
      const roomToSet = activeRoom.jid ? roomsStore[activeRoom.jid] : room;
      if (!roomsStore[roomToSet.jid]) {
        dispatch(addRoom({ roomData: roomToSet }));
      }
      dispatch(setCurrentRoom({ room: roomToSet }));
    }, [dispatch, roomJID, activeRoom.jid]);

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
          chatJID: activeRoom.jid,
          timestamp: undefined,
        })
      );
      client?.sendMessage(
        activeRoom.jid,
        user.firstName,
        user.lastName,
        "",
        user.walletAddress,
        message
      );
    }, []);

    const sendStartComposing = useCallback(() => {
      client.sendTypingRequest(
        activeRoom.jid,
        `${user.firstName} ${user.lastName}`,
        true
      );
    }, []);

    const sendEndComposing = useCallback(() => {
      client.sendTypingRequest(
        activeRoom.jid,
        `${user.firstName} ${user.lastName}`,
        false
      );
    }, []);

    const loadMoreMessages = useCallback(
      async (chatJID: string, max: number, idOfMessageBefore?: number) => {
        // console.log("getting history by scroll", loading);

        if (!isLoadingMore) {
          setIsLoadingMore(true);
          client
            ?.getHistory(chatJID, max, idOfMessageBefore)
            .then((resp) => {
              // console.log("getting history by scroll");
            })
            .then(() => {
              setIsLoadingMore(false);
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
                chatName: activeRoom.name,
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
                roomJid: activeRoom,
              };
              console.log(data, "data to send media");
              client?.sendMediaMessageStanza(activeRoom.jid, data);
            });
          })
          .catch((error) => {
            console.log(error);
          });
      },
      [client, activeRoom.jid]
    );

    useEffect(() => {
      setTimeout(() => {
        client
          .initPresence()
          .then(() => client.getRooms())
          .then(() => client.presenceInRoom(activeRoom.jid))
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
            client.getHistory(activeRoom.jid, 30).then(() => {
              dispatch(
                setIsLoading({ chatJID: activeRoom.jid, loading: false })
              );
            });
          });
      }, 1000);
    }, [user, activeRoom.jid]);

    if (!room) {
      return <>No room</>;
    }

    return (
      <ChatContainer
        style={{
          maxHeight: "100vh",
          overflow: "auto",
          ...MainComponentStyles,
        }}
      >
        {!config?.disableHeader && <ChatHeader currentRoom={activeRoom} />}
        {loading ? (
          <Loader color={config?.colors?.primary} />
        ) : roomsStore[activeRoom.jid].messages &&
          roomsStore[activeRoom.jid].messages.length < 1 ? (
          <div
            style={{
              height: "100%",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <NoMessagesPlaceholder />
          </div>
        ) : (
          <MessageList
            loadMoreMessages={loadMoreMessages}
            CustomMessage={CustomMessageComponent}
            user={user}
            room={activeRoom}
            config={config}
            loading={isLoadingMore}
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
