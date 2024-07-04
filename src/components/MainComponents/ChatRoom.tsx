import React, { useState, useEffect, useCallback } from "react";
import {
  ChatContainer,
  ChatContainerHeader,
  ChatContainerHeaderLabel,
} from "../styled/StyledComponents";
import { useSelector, useDispatch } from "react-redux";
import { RootState } from "../../roomStore";
import MessageList from "./MessageList";
import xmppClient from "../../networking/xmppClient";
import { IRoom, User } from "../../types/types";
import SendInput from "../styled/SendInput";
import {
  addRoom,
  setActiveRoom,
  addRoomMessage,
} from "../../roomStore/roomsSlice";
import Loader from "../styled/Loader";
import { uploadFile } from "../../networking/apiClient";
import RoomList from "./RoomList";
import { getHighResolutionTimestamp } from "../../helpers/dateComparison";

interface ChatRoomProps {
  roomJID?: string;
  defaultUser: User;
  isLoading?: boolean;
  defaultRoom: IRoom;
  CustomMessageComponent?: any;
  MainComponentStyles?: any;
}

const ChatRoom: React.FC<ChatRoomProps> = React.memo(
  ({
    isLoading = false,
    defaultRoom,
    roomJID,
    CustomMessageComponent,
    MainComponentStyles,
  }) => {
    const client = xmppClient;
    const [currentRoom, setCurrentRoom] = useState(defaultRoom);
    const rooms = useSelector((state: RootState) => state.rooms.rooms);

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
      dispatch(
        addRoomMessage({
          roomJID: currentRoom.jid,
          message: {
            id: getHighResolutionTimestamp(),
            user: {
              ...user,
              id: user.walletAddress,
              name: user.firstName + " " + user.lastName,
            },
            date: new Date().toISOString(),
            body: message,
            roomJID: currentRoom.jid,
            pending: true,
          },
        })
      );
      xmppClient.sendMessage(
        currentRoom.jid,
        user.firstName,
        user.lastName,
        "",
        user.walletAddress,
        message
      );
    }, []);

    const loadMoreMessages = useCallback(
      async (chatJID: string, max: number, idOfMessageBefore?: number) => {
        client.getHistory(chatJID, max, idOfMessageBefore).then((resp) => {
          console.log("getting history by scroll");
          // console.log(resp);
        });
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
              client.sendMediaMessageStanza(currentRoom.jid, data);
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
            .init(mainUser.walletAddress, mainUser.xmppPassword)
            .then(() =>
              client
                .presence()
                .then(() => client.getRooms())
                .then(() => client.presenceInRoom(currentRoom.jid))
                .then(() => {
                  client.getHistory(currentRoom.jid, 30);
                })
                .catch((error) => console.log(error))
            )
            .catch((error) => {
              console.error("Error handling client operations:", error);
            });
        }, 1000);
      }
    }, [client, mainUser, currentRoom.jid, rooms]);

    if (!activeRoom) return <>No room</>;

    return (
      <ChatContainer
        style={{ maxHeight: "100vh", overflow: "auto", ...MainComponentStyles }}
      >
        <ChatContainerHeader>
          <RoomList chats={[]} />
          <ChatContainerHeaderLabel>
            {currentRoom?.title}
          </ChatContainerHeaderLabel>
          <ChatContainerHeaderLabel>
            {currentRoom?.usersCnt} users
          </ChatContainerHeaderLabel>
        </ChatContainerHeader>
        {isLoading ||
        !rooms[activeRoom.jid].messages ||
        rooms[activeRoom.jid].messages.length < 1 ? (
          <Loader />
        ) : (
          <MessageList
            loadMoreMessages={loadMoreMessages}
            messages={rooms[activeRoom.jid].messages}
            CustomMessage={CustomMessageComponent}
            user={mainUser}
            room={currentRoom}
          />
        )}
        <SendInput sendMessage={sendMessage} sendMedia={sendMedia} />
      </ChatContainer>
    );
  }
);

export default ChatRoom;
