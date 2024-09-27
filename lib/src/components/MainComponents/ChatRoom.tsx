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
  setActiveRoom,
  addRoomMessage,
  setIsLoading,
  setLastViewedTimestamp,
} from "../../roomStore/roomsSlice";
import Loader from "../styled/Loader";
import { uploadFile } from "../../networking/apiClient";
import RoomList from "./RoomList";
import { getHighResolutionTimestamp } from "../../helpers/dateComparison";
import { useXmppClient } from "../../context/xmppProvider.tsx";

interface ChatRoomProps {
  roomJID?: string;
  defaultUser: User;
  isLoading?: boolean;
  defaultRoom: IRoom;
  CustomMessageComponent?: any;
  MainComponentStyles?: any;
  config?: IConfig;
}

const ChatRoom: React.FC<ChatRoomProps> = React.memo(
  ({
    isLoading = false,
    defaultRoom,
    roomJID,
    CustomMessageComponent,
    MainComponentStyles,
    config,
  }) => {
    const [currentRoom, setCurrentRoom] = useState(defaultRoom);
    const rooms = useSelector((state: RootState) => state.rooms.rooms);
    const loading = useSelector(
      (state: RootState) =>
        state.rooms.rooms[currentRoom?.jid]?.isLoading || false
    );

    const { client } = useXmppClient();

    const activeRoom = useSelector(
      (state: RootState) => state.rooms.activeRoom
    );
    const { user } = useSelector((state: RootState) => state.chatSettingStore);

    const mainUser = user;
    const dispatch = useDispatch();

    useEffect(() => {
      const roomToSet = roomJID ? rooms[roomJID] : defaultRoom;
      if (!rooms[roomToSet.jid]) {
        dispatch(addRoom({ roomData: roomToSet }));
      }
      setCurrentRoom(roomToSet);
      dispatch(setActiveRoom({ roomData: roomToSet }));
    }, [dispatch, rooms, defaultRoom, roomJID]);

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
      async (data: any) => {
        const formData = new FormData();
        formData.append("/files", data);
        uploadFile(formData, user.token)
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
      if (!rooms[currentRoom.jid]?.messages) {
        setTimeout(() => {
          client
            .initPresence()
            .then(() => client.getRooms())
            .then(() => client.presenceInRoom(currentRoom.jid))
            .then(() => {
              client.getHistory(currentRoom.jid, 30);
            })
            .then(
              async () =>
                await client.actionSetTimestampToPrivateStore(
                  currentRoom.jid,
                  1727308800000
                )
            )
            .then(async () => {
              const res: any = await client.getChatsPrivateStoreRequest();
              console.log("res of priv store", res);

              const entries = Object.entries(res);
              if (entries.length > 0) {
                const [chatJID, timestamp] = entries[0];
                dispatch(
                  setLastViewedTimestamp({
                    // @ts-expect-error
                    timestamp,
                    chatJID,
                  })
                );
              }
            });
        }, 1000);
      }
    }, [client, mainUser, currentRoom.jid, rooms]);
    if (!activeRoom) return <>No room</>;

    return (
      <ChatContainer
        style={{ maxHeight: "100vh", overflow: "auto", ...MainComponentStyles }}
      >
        {!config?.disableHeader && (
          <ChatContainerHeader>
            {/* todo add here list of rooms */}
            <RoomList chats={[]} />
            <ChatContainerHeaderLabel>
              {currentRoom?.title}
            </ChatContainerHeaderLabel>
            <ChatContainerHeaderLabel>
              {currentRoom?.usersCnt} users
            </ChatContainerHeaderLabel>
          </ChatContainerHeader>
        )}
        {isLoading ||
        !rooms[activeRoom.jid].messages ||
        rooms[activeRoom.jid].messages.length < 1 ? (
          <Loader color={config?.colors?.primary} />
        ) : (
          <MessageList
            loadMoreMessages={loadMoreMessages}
            messages={rooms[activeRoom.jid].messages}
            CustomMessage={CustomMessageComponent}
            user={mainUser}
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
          isLoading={isLoading}
        />
      </ChatContainer>
    );
  }
);

export default ChatRoom;
