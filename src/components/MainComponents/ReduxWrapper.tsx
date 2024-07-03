import React from "react";
import { Provider } from "react-redux";
import { store } from "../../roomStore";
import { ChatWrapper } from "./ChatWrapper";
import { IRoom, User } from "../../types/types";

interface ChatWrapperProps {
  token?: string;
  room?: IRoom;
  user?: User;
  loginData?: { email: string; password: string };
  MainComponentStyles?: any;
  CustomMessageComponent?: any;
}

const ReduxWrapper: React.FC<ChatWrapperProps> = (props) => {
  return (
    <Provider store={store}>
      <ChatWrapper {...props} />
    </Provider>
  );
};

export default ReduxWrapper;
