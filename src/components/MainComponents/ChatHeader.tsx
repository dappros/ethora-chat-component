import React from "react";
import {
  ChatContainerHeader,
  ChatContainerHeaderLabel,
} from "../styled/StyledComponents";
import RoomList from "./RoomList";
import { IRoom } from "../../types/types";
import { ChatHeaderAvatar } from "./ChatHeaderAvatar";
import Button from "../styled/Button";
import { MoreIcon, SearchIcon } from "../../assets/icons";
import { RootState } from "../../roomStore";
import { useSelector } from "react-redux";
import Composing from "../styled/StyledInputComponents/Composing";

interface ChatHeaderProps {
  currentRoom: IRoom;
}

const ChatHeader: React.FC<ChatHeaderProps> = ({ currentRoom }) => {
  const { composing } = useSelector(
    (state: RootState) => state.rooms.rooms[currentRoom.jid]
  );
  return (
    <ChatContainerHeader>
      {/* todo add here list of rooms */}
      <div style={{ display: "flex", gap: "8px" }}>
        {/* <RoomList chats={[]} /> */}
        <div>
          {currentRoom?.icon ? (
            <img src={currentRoom.icon} />
          ) : (
            <ChatHeaderAvatar name={currentRoom.name} />
          )}
        </div>
        <div
          style={{
            textAlign: "start",
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          <ChatContainerHeaderLabel>
            {currentRoom?.title}
          </ChatContainerHeaderLabel>
          <ChatContainerHeaderLabel
            style={{ color: "#8C8C8C", fontSize: "14px" }}
          >
            {composing ? (
              <Composing usersTyping={["User"]} />
            ) : (
              `${currentRoom?.usersCnt} users`
            )}
          </ChatContainerHeaderLabel>
        </div>
      </div>

      <div style={{ display: "flex", gap: 16 }}>
        {/* <Button style={{ padding: 8 }} EndIcon={<SearchIcon />}></Button> */}
        <Button style={{ padding: 8 }} EndIcon={<MoreIcon />}></Button>
      </div>
    </ChatContainerHeader>
  );
};

export default ChatHeader;
