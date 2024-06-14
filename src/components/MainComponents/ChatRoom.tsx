import React, { useState, useEffect, useCallback } from "react";
import {
  ChatContainer,
  ChatContainerHeader,
  ChatContainerHeaderLabel,
} from "../styled/StyledComponents";
import { useSelector, useDispatch } from "react-redux";
import { RootState } from "../../roomStore";
import ChatList from "./ChatList";
import xmppClient from "../../networking/xmppClient";
import { IRoom, User } from "../../types/types";
import { setUser } from "../../roomStore/chatSettingsSlice";
import SendInput from "../styled/SendInput";
import { addRoom, setActiveRoom } from "../../roomStore/roomsSlice";
import Loader from "../styled/Loader";
import { uploadFile } from "../../networking/apiClient";

interface ChatRoomProps {
  roomJID?: string;
  defaultUser: User;
  isLoading?: boolean;
  defaultRoom: IRoom;
  CustomMessageComponent?: any;
}

const ChatRoom: React.FC<ChatRoomProps> = React.memo(
  ({
    defaultUser,
    isLoading = false,
    defaultRoom,
    roomJID,
    CustomMessageComponent,
  }) => {
    const client = xmppClient;
    const [currentRoom, setCurrentRoom] = useState(defaultRoom);

    const rooms = useSelector((state: RootState) => state.rooms.rooms);
    const activeRoom = useSelector(
      (state: RootState) => state.rooms.activeRoom
    );
    const { user } = useSelector((state: RootState) => state.chatSettingStore);

    const mainUser = defaultUser || user;
    const dispatch = useDispatch();

    useEffect(() => {
      if (user !== mainUser) {
        dispatch(setUser(mainUser));
      }
    }, [dispatch, mainUser, user]);

    useEffect(() => {
      const roomToSet = roomJID ? rooms[roomJID] : defaultRoom;
      if (!rooms[roomToSet.jid]) {
        dispatch(addRoom({ roomData: roomToSet }));
      }
      setCurrentRoom(roomToSet);
      dispatch(setActiveRoom({ roomData: roomToSet }));
    }, [dispatch, rooms, defaultRoom, roomJID]);

    const sendMessage = useCallback(
      (message: string) => {
        xmppClient.sendMessage(
          currentRoom.jid,
          mainUser.firstName,
          mainUser.lastName,
          "",
          mainUser.walletAddress,
          message
        );
      },
      [currentRoom.jid, mainUser]
    );

    const loadMoreMessages = useCallback(
      async (chatJID: string, firstUserMessageID: string, amount: number) => {
        client.getHistory(chatJID, firstUserMessageID, amount);
      },

      // async (chatJID: string, max: number, amount?: number) => {
      //   client.getHistory(chatJID, max, amount).then((resp) => {
      //     console.log(resp);
      //   });
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
                  client.getHistory(currentRoom.jid, mainUser._id, 30);
                })
            )
            .catch((error) => {
              console.error("Error handling client operations:", error);
            });
        }, 1000);
      }
    }, [client, mainUser, currentRoom.jid, rooms]);

    if (!activeRoom) return <>No room</>;

    return (
      <ChatContainer style={{ maxHeight: "100vh", overflow: "auto" }}>
        <ChatContainerHeader>
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
          <ChatList
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
