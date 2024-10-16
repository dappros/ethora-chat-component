import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import styled, { css } from "styled-components";
import { IRoom } from "../../types/types";
import { ChatHeaderAvatar } from "./ChatHeaderAvatar";
import Button from "../styled/Button";
import { SearchInput } from "../InputComponents/Search";
import debounce from "lodash/debounce";

interface RoomListProps {
  chats: IRoom[];
  burgerMenu?: boolean;
  onRoomClick?: (chat: IRoom) => void;
  activeJID: string;
}

const Container = styled.div<{ burgerMenu?: boolean; open?: boolean }>`
  ${({ burgerMenu, open }) =>
    burgerMenu
      ? css`
          position: fixed;
          left: 0;
          top: 0;
          width: 300px;
          height: 100%;
          transform: ${open ? "translateX(0)" : "translateX(-100%)"};
          transition: transform 0.3s ease-in-out;
          box-shadow: 2px 0 5px rgba(0, 0, 0, 0.3);
          z-index: 2;
          display: flex;
          flex-direction: column;
          gap: 8px;
          /* background-color: rgba(156, 104, 104, 0.3); */
          background-color: #fff;
          /* padding: 16px 0px 12px 16px; */
          padding: 16px 12px;
        `
      : css`
          position: static;
          width: 300px;
          z-index: 2;
          padding: 0px 0px 12px 16px;
          background-color: #fff;
        `}
`;

const BurgerButton = styled.button`
  /* position: fixed; */
  left: 10px;
  top: 10px;
  background-color: #333;
  color: #fff;
  border: none;
  padding: 10px;
  cursor: pointer;
  z-index: 1000;
`;

const ChatItem = styled.div<{ active: boolean }>`
  display: flex;
  justify-content: space-between;
  border-radius: 16px;
  padding: 10px;
  border-bottom: 1px solid #ddd;
  cursor: pointer;
  background-color: ${({ active }) => (active ? "#0052CD" : "#fff")};
  color: ${({ active }) => (!active ? "#000" : "#fff")};

  &:hover {
    background-color: ${({ active }) =>
      active ? "rgba(0, 82, 205, 0.9)" : "rgba(0, 0, 0, 0.05)"};
  }
`;

const IconPlaceholder = styled.div`
  width: 40px;
  height: 40px;
  background-color: #ccc;
  border-radius: 50%;
  display: flex;
  justify-content: center;
  align-items: center;
  margin-right: 10px;
`;

const ChatInfo = styled.div`
  display: flex;
  flex-direction: column;
  max-width: 60%;
`;

const ChatName = styled.div`
  font-weight: bold;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const LastMessage = styled.div`
  color: #999;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const UserCount = styled.div<{ active: boolean }>`
  color: ${({ active }) => (!active ? "#000" : "#fff")};
  margin-left: auto;
`;

const RoomList: React.FC<RoomListProps> = ({
  chats,
  activeJID,
  burgerMenu = false,
  onRoomClick,
}) => {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const containerRef = useRef<HTMLDivElement>(null);

  const handleClickOutside = useCallback((event: MouseEvent) => {
    if (
      containerRef.current &&
      !containerRef.current.contains(event.target as Node)
    ) {
      setOpen(false);
    }
  }, []);

  const performClick = useCallback(
    (chat: IRoom) => {
      onRoomClick?.(chat);
      setOpen(false);
    },
    [onRoomClick]
  );

  const debouncedSearch = useMemo(
    () => debounce((value: string) => setSearchTerm(value), 300),
    []
  );

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      debouncedSearch(e.target.value);
    },
    [debouncedSearch]
  );

  const filteredChats = useMemo(
    () =>
      chats.filter((chat) =>
        chat.name.toLowerCase().includes(searchTerm.toLowerCase())
      ),
    [chats, searchTerm]
  );

  useEffect(() => {
    if (burgerMenu) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [burgerMenu, handleClickOutside]);

  const isChatActive = useCallback(
    (room: IRoom) => activeJID === room.jid,
    [activeJID]
  );

  return (
    <>
      {burgerMenu && !open && (
        <BurgerButton onClick={() => setOpen(!open)}>☰</BurgerButton>
      )}
      <Container burgerMenu={burgerMenu} open={open} ref={containerRef}>
        <div
          style={{
            display: "flex",
            gap: "16px",
            alignItems: "center",
            width: "100%",
          }}
        >
          <SearchInput
            value={searchTerm}
            onChange={handleSearchChange}
            placeholder="Search..."
          />
          <Button style={{ color: "black" }} text={"New"} />
        </div>
        {filteredChats.map((chat, index) => (
          <ChatItem
            key={index}
            active={isChatActive(chat)}
            onClick={() => performClick(chat)}
          >
            <div
              style={{
                display: "flex",
                alignItems: "start",
                width: "100%",
                gap: "8px",
              }}
            >
              {chat.icon ? (
                <IconPlaceholder>{chat.icon}</IconPlaceholder>
              ) : (
                <ChatHeaderAvatar name={chat.name} />
              )}
              <ChatInfo>
                <ChatName>{chat.name}</ChatName>
                <LastMessage>{chat.lastMessage}</LastMessage>
              </ChatInfo>
            </div>
            <div style={{ textAlign: "right", display: "flex" }}>
              <UserCount active={isChatActive(chat)}>{chat.usersCnt}</UserCount>
              {/* <div>{chat.lastMessageTime}</div> */}
            </div>
          </ChatItem>
        ))}
      </Container>
    </>
  );
};

export default RoomList;
