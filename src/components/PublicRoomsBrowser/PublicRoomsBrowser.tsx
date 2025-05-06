import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useDispatch } from 'react-redux';
import { ApiRoom, IRoom } from '../../types/types';
import {
  getPublicAppRooms,
  getRoomByName,
} from '../../networking/api-requests/rooms.api';
import {
  addRoomViaApi,
  setCurrentRoom,
  updateUsersSet,
} from '../../roomStore/roomsSlice';
import { useXmppClient } from '../../context/xmppProvider';
import { throttle } from '../../utils/throttle';
import {
  BrowserContainer,
  BrowseButton,
  Loader,
  RoomItem,
  RoomMembers,
  RoomName,
  RoomsListContainer,
} from './styled';
import Button from '../styled/Button';

const ROOMS_PER_PAGE = 10;

const PublicRoomsBrowser: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [rooms, setRooms] = useState<ApiRoom[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);

  const dispatch = useDispatch();
  const { client } = useXmppClient();

  const fetchRooms = useCallback(
    async (currentOffset: number, append = false) => {
      if (!hasMore || !client) return;

      if (append) {
        setIsFetchingMore(true);
      } else {
        setIsLoading(true);
        setRooms([]);
      }

      try {
        const data = await getPublicAppRooms(currentOffset, ROOMS_PER_PAGE);
        setRooms((prevRooms) =>
          append ? [...prevRooms, ...data.items] : data.items
        );
        setOffset(currentOffset + data.items.length);
        setHasMore(data.items.length === ROOMS_PER_PAGE);
      } catch (error) {
        console.error('Error fetching public rooms:', error);
      } finally {
        setIsLoading(false);
        setIsFetchingMore(false);
      }
    },
    [client, hasMore]
  );

  const handleBrowseClick = () => {
    const shouldOpen = !isOpen;
    setIsOpen(shouldOpen);
    if (shouldOpen && rooms.length === 0) {
      setOffset(0);
      setHasMore(true);
      fetchRooms(0);
    }
  };

  const handleRoomClick = useCallback(
    async (room: ApiRoom) => {
      if (!client?.conference || !room.name || !room._id) {
        console.error(
          'Missing client, conference service, room name, or room ID for click handler.'
        );
        return;
      }

      console.log('Selected public room:', room.name);
      setIsLoading(true);
      try {
        dispatch(setCurrentRoom({ roomJID: room.name }));

        client.presenceInRoomStanza(
          room.name + '@conference.dev.xmpp.ethoradev.com'
        );

        const roomDetails = await getRoomByName(
          room.name + '@conference.dev.xmpp.ethoradev.com'
        );

        if (roomDetails?._id) {
          dispatch(updateUsersSet({ rooms: [roomDetails] }));

          const roomJid = `${roomDetails.name}@${client.conference}`;

          const roomToAdd: IRoom = {
            id: roomDetails._id,
            jid: roomJid,
            name: roomDetails.name,
            title: roomDetails.title || roomDetails.name,
            description: roomDetails.description || '',
            members: roomDetails.members || [],
            type: roomDetails.type,
            createdAt: roomDetails.createdAt,
            updatedAt: roomDetails.updatedAt,
            picture: roomDetails.picture,
            messages: [],
            unreadMessages: 0,
            isLoading: false,
            composing: false,
            composingList: [],
            lastViewedTimestamp: null,
            noMessages: false,
            usersCnt: roomDetails.members?.length || 0,
            roomBg: '',
          };
          dispatch(addRoomViaApi({ room: roomToAdd, xmpp: client }));

          setIsOpen(false);
        } else {
          console.error('Could not fetch room details for:', room.name);
        }
      } catch (error) {
        console.error(`Error processing room click for ${room.name}:`, error);
      } finally {
        setIsLoading(false);
      }
    },
    [client, dispatch]
  );

  const handleScroll = useCallback(() => {
    if (
      listRef.current &&
      !isLoading &&
      !isFetchingMore &&
      hasMore &&
      listRef.current.scrollHeight - listRef.current.scrollTop <=
        listRef.current.clientHeight + 100
    ) {
      console.log('Fetching more rooms, offset:', offset);
      fetchRooms(offset, true);
    }
  }, [isLoading, isFetchingMore, hasMore, fetchRooms, offset]);

  const throttledScrollHandler = useCallback(throttle(handleScroll, 300), [
    handleScroll,
  ]);

  useEffect(() => {
    const listElement = listRef.current;
    if (isOpen && listElement) {
      listElement.addEventListener('scroll', throttledScrollHandler);
      return () => {
        listElement.removeEventListener('scroll', throttledScrollHandler);
      };
    }
  }, [isOpen, throttledScrollHandler]);

  if (!client) {
    return null;
  }

  return (
    <BrowserContainer>
      <Button onClick={handleBrowseClick}>
        {isOpen ? 'Hide Public Chats' : 'Browse Public Chats'}
      </Button>
      {isOpen && (
        <>
          {isLoading && rooms.length === 0 ? (
            <Loader>Loading rooms...</Loader>
          ) : (
            <RoomsListContainer ref={listRef}>
              {rooms.map((room) => (
                <RoomItem key={room._id} onClick={() => handleRoomClick(room)}>
                  <RoomName>{room.title}</RoomName>
                </RoomItem>
              ))}
              {isFetchingMore && <Loader>Loading more...</Loader>}
              {!hasMore && rooms.length > 0 && (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '10px',
                    color: '#888',
                    fontSize: '12px',
                  }}
                >
                  No more rooms
                </div>
              )}
              {rooms.length === 0 && !isLoading && (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '20px',
                    color: '#888',
                  }}
                >
                  No public rooms found.
                </div>
              )}
            </RoomsListContainer>
          )}
        </>
      )}
    </BrowserContainer>
  );
};

export default PublicRoomsBrowser;
