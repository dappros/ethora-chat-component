import React, { FC, useCallback, useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import ChatRoom from "./ChatRoom";
import { setConfig } from "../../roomStore/chatSettingsSlice";
import { ChatWrapperBox } from "../styled/ChatWrapperBox";

import { defRoom, defaultUser } from "../../api.config";
import { Overlay, StyledModal } from "../styled/Modal";

import CustomMessage from "../Message";
import { IConfig, IRoom, User } from "../../types/types";
import { useXmppClient } from "../../context/xmppProvider";
import LoginForm from "../AuthForms/Login";
import { RootState } from "../../roomStore";
import Loader from "../styled/Loader";
import {
  addRoom,
  setCurrentRoom,
  setIsLoading,
  setLastViewedTimestamp,
} from "../../roomStore/roomsSlice";
import { refresh } from "../../networking/apiClient";
import RoomList from "./RoomList";

interface ChatWrapperProps {
  token?: string;
  room?: IRoom;
  loginData?: { email: string; password: string };
  MainComponentStyles?: any; //change to particular types
  CustomMessageComponent?: any;
  config?: IConfig;
  roomJID?: string;
}

const ChatWrapper: FC<ChatWrapperProps> = ({
  MainComponentStyles,
  CustomMessageComponent,
  room,
  config,
  roomJID,
}) => {
  const [isInited, setInited] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const dispatch = useDispatch();

  const { user } = useSelector((state: RootState) => state.chatSettingStore);
  const { rooms } = useSelector((state: RootState) => state.rooms.rooms);

  const { client, initializeClient, setClient } = useXmppClient();

  useEffect(() => {
    dispatch(setConfig(config));
    dispatch(setIsLoading({ loading: true }));

    try {
      if (!user.defaultWallet || user?.defaultWallet.walletAddress === "") {
        setShowModal(true);
        console.log("Error, no user");
      } else {
        if (!client) {
          setShowModal(false);

          console.log("No client, so initing one");
          initializeClient(
            user.defaultWallet?.walletAddress,
            user.xmppPassword
          ).then((client) => {
            client
              .getRooms()
              .then(() => {
                setClient(client);
              })
              .finally(() => setInited(true));
          });

          refresh();
        }
      }
    } catch (error) {
      setShowModal(true);
      dispatch(setIsLoading({ loading: false }));
      console.log(error);
    }
  }, [user]);

  // functionality to handle unreadmessages
  useEffect(() => {
    const updateLastReadTimeStamp = () => {
      if (client) {
        client.actionSetTimestampToPrivateStore(
          room?.jid || roomJID,
          new Date().getTime()
        );
      }
      dispatch(
        setLastViewedTimestamp({
          chatJID: room?.jid || roomJID,
          timestamp: new Date().getTime(),
        })
      );
    };

    const handleBeforeUnload = () => {
      updateLastReadTimeStamp();
    };

    window.addEventListener("blur", handleBeforeUnload);
    window.addEventListener("offline", handleBeforeUnload);

    return () => {
      window.removeEventListener("blur", handleBeforeUnload);
      window.removeEventListener("offline", handleBeforeUnload);
    };
  }, [client, room?.jid]);

  // const handleChangeChat = () => (chat: IRoom) => {
  //   dispatch(setCurrentRoom({ room: chat }));
  //   dispatch(setIsLoading({ chatJID: chat.jid, loading: true }));
  // };

  if (user.xmppPassword === "" && user.xmppUsername === "")
    return <LoginForm config={config} />;

  return (
    <ChatWrapperBox>
      {showModal && (
        <Overlay>
          <StyledModal>Unsuccessfull login. Try again</StyledModal>
        </Overlay>
      )}
      {/* {isInited ?? !loading ? ( */}
      <div
        style={{
          display: "flex",
          height: "100%",
          width: "100%",
        }}
      >
        {isInited ? (
          // {/* {rooms && (
          //   <RoomList
          //     chats={Object.values(rooms)}
          //     onRoomClick={handleChangeChat}
          //   />
          // )} */}
          <>
            <ChatRoom
              CustomMessageComponent={CustomMessageComponent || CustomMessage}
              MainComponentStyles={MainComponentStyles}
              chatJID={roomJID}
            />
          </>
        ) : (
          <Loader color={config?.colors?.primary} />
        )}
      </div>
    </ChatWrapperBox>
  );
};

export { ChatWrapper };
