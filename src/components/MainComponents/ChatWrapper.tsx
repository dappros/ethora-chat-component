import React, { FC, useEffect, useCallback, useState } from "react";
import { useDispatch } from "react-redux";
import ChatRoom from "./ChatRoom";
import xmppClient from "../../networking/xmppClient";
import { setUser } from "../../roomStore/chatSettingsSlice";
import { ChatWrapperBox } from "../styled/ChatWrapperBox";
import CustomMessage from "../Message";
import { loginEmail } from "../../networking/apiClient";
import { defRoom, defaultUser, appToken } from "../../api.config";
import Loader from "../styled/Loader";

interface ChatWrapperProps {}

const ChatWrapper: FC<ChatWrapperProps> = ({}) => {
  const [isLoading, setIsLoading] = useState(true);
  const client = xmppClient;
  const dispatch = useDispatch();

  const loginUserFunction = useCallback(async () => {
    try {
      const loginData = await loginEmail(
        "yukiraze9@gmail.com",
        "Qwerty123",
        appToken
      );
      return loginData.data;
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
            client.init(
              loginData.user.defaultWallet.walletAddress,
              loginData.user.xmppPassword
            );
            console.log("Client successfully initialized", client);
          }
        } catch (error) {
          console.log(error, "Unsuccessful init");
        }
      } else {
        console.log("Login unsuccessful");
      }
      setIsLoading(false);
    };

    initUserAndClient();
  }, [loginUserFunction, dispatch]);

  return (
    <ChatWrapperBox>
      {isLoading ? (
        <Loader />
      ) : (
        <ChatRoom
          defaultUser={defaultUser}
          defaultRoom={defRoom}
          CustomMessageComponent={CustomMessage}
        />
      )}
    </ChatWrapperBox>
  );
};

export { ChatWrapper };
