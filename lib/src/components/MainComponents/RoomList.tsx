import React, { useState, useRef, useEffect } from "react";
import styled, { css } from "styled-components";
import { IRoom } from "../../types/types";

interface RoomListProps {
  chats: IRoom[];
  burgerMenu?: boolean;
  onRoomClick?: (chat: IRoom) => void;
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
          background-color: #fff;
          transform: ${open ? "translateX(0)" : "translateX(-100%)"};
          transition: transform 0.3s ease-in-out;
          box-shadow: 2px 0 5px rgba(0, 0, 0, 0.3);
          z-index: 2;
          display: flex;
          flex-direction: column;
          gap: 8px;
        `
      : css`
          position: static;
          width: 300px;
          z-index: 2;
        `}
`;

const BurgerButton = styled.button`
  position: fixed;
  left: 10px;
  top: 10px;
  background-color: #333;
  color: #fff;
  border: none;
  padding: 10px;
  cursor: pointer;
  z-index: 1000;
`;

const CloseButton = styled.button`
  background-color: #333;
  color: #fff;
  border: none;
  padding: 10px;
  cursor: pointer;
  width: 100%;
`;

const ChatItem = styled.div`
  display: flex;
  align-items: center;
  padding: 10px;
  border-bottom: 1px solid #ddd;

  &:hover {
    background-color: #f9f9f9;
  }
`;

const Icon = styled.img`
  width: 40px;
  height: 40px;
  margin-right: 10px;
  border-radius: 50%;
`;

const ChatInfo = styled.div`
  display: flex;
  flex-direction: column;
`;

const ChatName = styled.div`
  font-weight: bold;
`;

const LastMessage = styled.div`
  color: #999;
`;

const UserCount = styled.div`
  color: #666;
  margin-left: auto;
`;

const RoomList: React.FC<RoomListProps> = ({
  chats,
  burgerMenu = false,
  onRoomClick,
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleClickOutside = (event: MouseEvent) => {
    if (
      containerRef.current &&
      !containerRef.current.contains(event.target as Node)
    ) {
      setOpen(false);
    }
  };

  const performClick = (chat: IRoom) => {
    console.log(`Clicked room: ${chat.name}`);
    onRoomClick?.(chat);
    setOpen(false);
  };

  useEffect(() => {
    if (burgerMenu) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [burgerMenu]);

  return (
    <>
      {burgerMenu && !open && (
        <BurgerButton onClick={() => setOpen(!open)}>☰</BurgerButton>
      )}
      <Container burgerMenu={burgerMenu} open={open} ref={containerRef}>
        {chats.map((chat, index) => (
          <ChatItem key={index} onClick={() => performClick(chat)}>
            <Icon src={chat.title} alt={chat.name} />
            <ChatInfo>
              <ChatName>{chat.name}</ChatName>
              <LastMessage>{chat.lastMessage}</LastMessage>
            </ChatInfo>
            <UserCount>{chat.usersCnt}</UserCount>
          </ChatItem>
        ))}
        {burgerMenu && open && (
          <CloseButton onClick={() => setOpen(false)}>Close</CloseButton>
        )}
      </Container>
    </>
  );
};

export default RoomList;
