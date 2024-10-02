import React from "react";
import { Provider } from "react-redux";
import { store } from "../../roomStore";
import { IConfig, IRoom, User } from "../../types/types";
import { XmppProvider } from "../../context/xmppProvider.tsx";
import "../../index.css";
import "../../helpers/storeConsole";
import LoginWrapper from "./LoginWrapper.tsx";

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
        <LoginWrapper {...props} />
      </Provider>
    </XmppProvider>
  );
};
