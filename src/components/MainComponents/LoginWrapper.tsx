import React, { useCallback, useEffect } from "react";
import { IConfig, IRoom, User } from "../../types/types";
import { ChatWrapper } from "./ChatWrapper";
import LoginForm from "../AuthForms/Login";
import { RootState } from "../../roomStore";
import { useDispatch, useSelector } from "react-redux";
import { setUser } from "../../roomStore/chatSettingsSlice";
import { loginEmail } from "../../networking/apiClient";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { addRoom } from "../../roomStore/roomsSlice";

interface LoginWrapperProps {
  token?: string;
  room?: IRoom;
  loginData?: { email: string; password: string };
  MainComponentStyles?: any;
  CustomMessageComponent?: any;
  config?: IConfig;
}

const LoginWrapper: React.FC<LoginWrapperProps> = ({ ...props }) => {
  const { user } = useSelector((state: RootState) => state.chatSettingStore);

  const loginUserFunction = useCallback(async () => {
    try {
      const authData = await loginEmail(
        user.walletAddress || "yukiraze9@gmail.com",
        user?.xmppPassword || "Qwerty123"
      );

      return {
        ...authData.data.user,
        token: authData.data.token,
        refreshToken: authData.data.refreshToken,
      };
    } catch (error) {
      console.error("Login failed:", error);
      return null;
    }
  }, []);

  const dispatch = useDispatch();

  useEffect(() => {
    //use localStorage, to check for user was already logged

    const storedUser: User = useLocalStorage(
      "@ethora/chat-component-user"
    ).get() as User;
    if (storedUser) {
      dispatch(setUser(storedUser));
    }

    //if no login config - default user login

    if (!props.config?.googleLogin && user.xmppUsername === "") {
      const defaultLogin = async () => {
        try {
          const loginData = await loginUserFunction();
          if (loginData) {
            console.log("Login data", loginData);
            if (props.room) dispatch(setUser(loginData));
            useLocalStorage("@ethora/chat-component-user").set(loginData);
          }
        } catch (error) {
          console.log("error with default login", error);
        }
      };
      defaultLogin();
    }

    //if google - show login.tsx and process user there (there will be dispatch, set user)

    //if only ethora - show login with only ethora

    if (props.room) {
      dispatch(addRoom({ roomData: props.room }));
    }

    return () => {
      //clear
    };
  }, []);

  return (
    <>
      {!props.config?.googleLogin || user.xmppUsername !== "" ? (
        <ChatWrapper {...props} />
      ) : (
        <LoginForm {...props} />
      )}
    </>
  );
};

export default LoginWrapper;
