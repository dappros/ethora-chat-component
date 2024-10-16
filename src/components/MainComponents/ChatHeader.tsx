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
import { useDispatch, useSelector } from "react-redux";
import Composing from "../styled/StyledInputComponents/Composing";
import { setCurrentRoom, setIsLoading } from "../../roomStore/roomsSlice";

interface ChatHeaderProps {
  currentRoom: IRoom;
}

const ChatHeader: React.FC<ChatHeaderProps> = ({ currentRoom }) => {
  const dispatch = useDispatch();
  const { composing } = useSelector(
    (state: RootState) => state.rooms.rooms[currentRoom.jid]
  );

  const rooms = useSelector((state: RootState) => state.rooms.rooms);

  const handleChangeChat = (chat: IRoom) => {
    dispatch(setCurrentRoom({ roomJID: chat.jid }));
    dispatch(setIsLoading({ chatJID: chat.jid, loading: true }));
  };

  return (
    <ChatContainerHeader>
      {/* todo add here list of rooms */}
      <div style={{ display: "flex", gap: "8px" }}>
        {rooms && (
          <RoomList
            chats={Object.values(rooms)}
            burgerMenu
            onRoomClick={handleChangeChat}
            activeJID={currentRoom.jid}
          />
        )}
        <div>
          {currentRoom?.icon ? (
            <img src={currentRoom.icon} />
          ) : (
            <ChatHeaderAvatar name={currentRoom.name} size={40} />
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
