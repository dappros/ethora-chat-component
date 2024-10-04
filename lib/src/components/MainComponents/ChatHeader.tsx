import React from "react";
import {
  ChatContainerHeader,
  ChatContainerHeaderLabel,
} from "../styled/StyledComponents";
import RoomList from "./RoomList";
import { IRoom } from "../../types/types";

interface ChatHeaderProps {
  currentRoom: IRoom;
}

const ChatHeader: React.FC<ChatHeaderProps> = ({ currentRoom }) => {
  return (
    <>
      <ChatContainerHeader>
        {/* todo add here list of rooms */}
        <div style={{ display: "flex", gap: "8px" }}>
          {/* <RoomList chats={[]} /> */}

          <div>Icon</div>
          <div style={{ textAlign: "start" }}>
            <ChatContainerHeaderLabel>
              {currentRoom?.title}
            </ChatContainerHeaderLabel>
            <ChatContainerHeaderLabel
              style={{ color: "#8C8C8C", fontSize: "14px" }}
            >
              {currentRoom?.usersCnt} users
            </ChatContainerHeaderLabel>
          </div>
        </div>

        <div>
          {/* lens here */}
          <div>Lens</div>
          {/* three dots here */}
          <div>three</div>
        </div>
      </ChatContainerHeader>
    </>
  );
};

export default ChatHeader;
