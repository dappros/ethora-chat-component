import React, { FC, useEffect, useCallback, useState } from "react";
import { useDispatch } from "react-redux";
import ChatRoom from "./ChatRoom";
import { setUser } from "../../roomStore/chatSettingsSlice";
import { ChatWrapperBox } from "../styled/ChatWrapperBox";

import { loginEmail } from "../../networking/apiClient";
import { defRoom, defaultUser, appToken } from "../../api.config";
import { Overlay, StyledModal } from "../styled/Modal";

import xmppClient from "../../networking/xmppClient";

import CustomMessage from "../Message";
import Loader from "../styled/Loader";
import { IRoom, User } from "../../types/types";
interface ChatWrapperProps {
  token?: string;
  room?: IRoom;
  user?: User;
  loginData?: { email: string; password: string };
  MainComponentStyles?: any; //change to particular types
  CustomMessageComponent?: any;
}

const ChatWrapper: FC<ChatWrapperProps> = ({
  MainComponentStyles,
  CustomMessageComponent,
  token,
  room,
  user,
  loginData,
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const client = xmppClient;
  const dispatch = useDispatch();

  const loginUserFunction = useCallback(async () => {
    try {
      const authData = await loginEmail(
        loginData?.email || "yukiraze9@gmail.com",
        loginData?.password || "Qwerty123",
        token || appToken
      );
      return authData.data;
    } catch (error) {
      console.error("Login failed:", error);
      return null;
    }
  }, []);

  useEffect(() => {
    const initUserAndClient = async () => {
      setIsLoading(true);
      const loginData = await loginUserFunction();

      if (loginData) {
        dispatch(setUser(loginData));

        try {
          if (
            loginData.user?.defaultWallet?.walletAddress &&
            loginData.user.xmppPassword
          ) {
            client
              .init(
                loginData.user.defaultWallet.walletAddress,
                loginData.user.xmppPassword
              )
              .then(() =>
                console.log("Client successfully initialized", client)
              )
              .catch((error) => console.log(error));
          }
        } catch (error) {
          console.log(error, "Unsuccessful init");
        }
      } else {
        console.log("Login unsuccessful");
        setShowModal(true);
      }
      setIsLoading(false);
    };

    initUserAndClient();
  }, [loginUserFunction, dispatch]);

  return (
    <ChatWrapperBox>
      {showModal && (
        <Overlay>
          <StyledModal>Unsuccessfull login. Try again</StyledModal>
        </Overlay>
      )}
      {isLoading ? (
        <Loader />
      ) : (
        <ChatRoom
          defaultUser={user || defaultUser}
          defaultRoom={room || defRoom}
          CustomMessageComponent={CustomMessageComponent || CustomMessage}
          MainComponentStyles={MainComponentStyles}
        />
      )}
    </ChatWrapperBox>
  );
};

export { ChatWrapper };
