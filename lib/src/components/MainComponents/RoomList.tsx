import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import styled, { css } from 'styled-components';
import { IRoom } from '../../types/types';
import { ChatHeaderAvatar } from './ChatHeaderAvatar';
import Button from '../styled/Button';
import { SearchInput } from '../InputComponents/Search';
import { useSelector } from 'react-redux';
import { RootState } from '../../roomStore';
import { getTintedColor } from '../../helpers/getTintedColor';
import { AddNewIcon, SearchIcon } from '../../assets/icons';

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
          transform: ${open ? 'translateX(0)' : 'translateX(-100%)'};
          transition: transform 0.3s ease-in-out;
          z-index: 2;
          display: flex;
          flex-direction: column;
          background-color: #fff;
          padding: 16px 12px;
          z-index: 1000;
          border-right: 1px solid var(--Colors-Border-border-primary, #f0f0f0);
        `
      : css`
          max-height: 80%;
          z-index: 2;
          padding: 16px 12px;
          overflow-y: hidden;
          z-index: 1000;
          background-color: #fff;
          min-width: 375px;
          border-right: 1px solid var(--Colors-Border-border-primary, #f0f0f0);
        `}
`;

const BurgerButton = styled.button`
  /* position: fixed; */
  left: 10px;
  top: 10px;
  color: #333;
  border: none;
  padding: 10px;
  cursor: pointer;
  z-index: 1000;
`;

const ChatItem = styled.div<{ active: boolean; bg?: string }>`
  display: flex;
  justify-content: space-between;
  border-radius: 16px;
  padding: 10px;
  cursor: pointer;
  background-color: ${({ active, bg }) =>
    active ? (bg ? bg : '#0052CD') : '#fff'};
  color: ${({ active }) => (!active ? '#000' : '#fff')};

  &:hover {
    background-color: ${({ active, bg }) =>
      active ? getTintedColor(bg ? bg : '#0052CD') : 'rgba(0, 0, 0, 0.05)'};
  }
`;

const ChatInfo = styled.div`
  display: flex;
  flex-direction: column;
  max-width: 60%;
  text-align: start;
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
  color: ${({ active }) => (!active ? '#000' : '#fff')};
  margin-left: auto;
`;

const Divider = styled.div<{ active: boolean }>``;

const RoomList: React.FC<RoomListProps> = ({
  chats,
  activeJID,
  burgerMenu = false,
  onRoomClick,
}) => {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const config = useSelector(
    (state: RootState) => state.chatSettingStore.config
  );

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

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearchTerm(e.target.value);
    },
    []
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
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
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
        {(open || !burgerMenu) && (
          <>
            <div
              style={{
                display: 'flex',
                gap: '16px',
                alignItems: 'center',
                width: '100%',
                marginBottom: 8,
                height: '50px',
              }}
            >
              <SearchInput
                icon={<SearchIcon height={'20px'} />}
                value={searchTerm}
                onChange={handleSearchChange}
                placeholder="Search..."
                // animated={true}
              />
              <Button
                style={{
                  color: 'black',
                  padding: 8,
                  borderRadius: '16px',
                  backgroundColor: 'transparent',
                }}
                EndIcon={<AddNewIcon color={config?.colors?.primary} />}
              />
            </div>
            <div
              style={{ height: '100%', overflow: 'hidden', overflowY: 'auto' }}
            >
              {filteredChats.map((chat, index) => (
                <ChatItem
                  key={index}
                  active={isChatActive(chat)}
                  onClick={() => performClick(chat)}
                  bg={config?.colors?.primary}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'start',
                      width: '100%',
                      gap: '8px',
                    }}
                  >
                    {chat.icon ? (
                      <img src={chat.icon} alt="Icon" />
                    ) : (
                      <ChatHeaderAvatar name={chat.name} />
                    )}
                    <ChatInfo>
                      <ChatName>{chat.name}</ChatName>
                      <LastMessage
                        style={{ color: '#141414', fontWeight: 600 }}
                      >
                        {chat?.lastRoomMessage?.name &&
                          `${chat?.lastRoomMessage?.name}:`}
                      </LastMessage>
                      <LastMessage>{chat?.lastRoomMessage?.body}</LastMessage>
                    </ChatInfo>
                  </div>
                  <div style={{ textAlign: 'right', display: 'flex' }}>
                    <UserCount active={isChatActive(chat)}>
                      {chat.usersCnt}
                    </UserCount>
                    {/* <div>{chat.lastMessageTime}</div> */}
                  </div>
                </ChatItem>
              ))}
            </div>
          </>
        )}
      </Container>
    </>
  );
};

export default RoomList;
