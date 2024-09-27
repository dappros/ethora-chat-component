import React from "react";
import { Provider } from "react-redux";
import { store } from "../../roomStore";
import { ChatWrapper } from "./ChatWrapper";
import { IConfig, IRoom, User } from "../../types/types";
// import LoginForm from "../AuthForms/Login";
// import RegisterForm from "../AuthForms/Register";
import { XmppProvider } from "../../context/xmppProvider.tsx";
import "../../index.css";
import "../../helpers/storeConsole";
import LoginForm from "../AuthForms/Login.tsx";

interface ChatWrapperProps {
  token?: string;
  room?: IRoom;
  user?: User;
  loginData?: { email: string; password: string };
  MainComponentStyles?: any;
  CustomMessageComponent?: any;
  config?: IConfig;
}

export const ReduxWrapper: React.FC<ChatWrapperProps> = ({ ...props }) => {
  return (
    <XmppProvider>
      <Provider store={store}>
        {!props.config?.googleLogin ? (
          <LoginForm {...props} />
        ) : (
          <ChatWrapper {...props} />
        )}
      </Provider>
    </XmppProvider>
  );
};
