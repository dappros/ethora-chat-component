import React, { FC, useEffect, useState } from "react";
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
import { setLastViewedTimestamp } from "../../roomStore/roomsSlice";

interface ChatWrapperProps {
  token?: string;
  room?: IRoom;
  loginData?: { email: string; password: string };
  MainComponentStyles?: any; //change to particular types
  CustomMessageComponent?: any;
  config?: IConfig;
}

const ChatWrapper: FC<ChatWrapperProps> = ({
  MainComponentStyles,
  CustomMessageComponent,
  room,
  config,
}) => {
  const [isInited, setInited] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const dispatch = useDispatch();
  const { user } = useSelector((state: RootState) => state.chatSettingStore);

  const { client, initializeClient } = useXmppClient();

  useEffect(() => {
    dispatch(setConfig(config));

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
          );
          setInited(true);
        }
      }
    } catch (error) {
      setShowModal(true);
      console.log(error);
    }
  }, [user]);

  // functionality to handle unreadmessages
  useEffect(() => {
    const updateLastReadTimeStamp = () => {
      if (client) {
        client.actionSetTimestampToPrivateStore(
          room?.jid || defRoom.jid,
          new Date().getTime()
        );
      }
      dispatch(
        setLastViewedTimestamp({
          chatJID: room?.jid || defRoom.jid,
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

  if (user.xmppPassword === "" && user.xmppUsername === "")
    return <LoginForm config={config} />;

  return (
    <ChatWrapperBox>
      {showModal && (
        <Overlay>
          <StyledModal>Unsuccessfull login. Try again</StyledModal>
        </Overlay>
      )}
      {isInited ? (
        <ChatRoom
          defaultUser={user || defaultUser}
          defaultRoom={room || defRoom}
          CustomMessageComponent={CustomMessageComponent || CustomMessage}
          MainComponentStyles={MainComponentStyles}
          config={config}
        />
      ) : (
        <Loader />
      )}
    </ChatWrapperBox>
  );
};

export { ChatWrapper };
