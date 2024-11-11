import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ChatContainer } from '../styled/StyledComponents';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../roomStore';
import MessageList from './MessageList';
import SendInput from '../styled/SendInput';
import {
  addRoom,
  addRoomMessage,
  setCurrentRoom,
  setIsLoading,
} from '../../roomStore/roomsSlice';
import Loader from '../styled/Loader';
import { uploadFile } from '../../networking/api-requests/auth.api';
import { useXmppClient } from '../../context/xmppProvider.tsx';
import ChatHeader from './ChatHeader.tsx';
import NoMessagesPlaceholder from './NoMessagesPlaceholder.tsx';

interface ChatRoomProps {
  CustomMessageComponent?: any;
  MainComponentStyles?: any;
  chatJID?: string;
}

const ChatRoom: React.FC<ChatRoomProps> = React.memo(
  ({ CustomMessageComponent, MainComponentStyles, chatJID }) => {
    const { client } = useXmppClient();
    const dispatch = useDispatch();

    const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
    const { roomsStore, loading, user, activeRoomJID, globalLoading, config } =
      useSelector((state: RootState) => ({
        activeRoomJID: state.rooms.activeRoomJID,
        roomsStore: state.rooms.rooms,
        loading:
          state.rooms.rooms[state.rooms.activeRoomJID]?.isLoading || false,
        user: state.chatSettingStore.user,
        globalLoading: state.rooms.isLoading,
        config: state.chatSettingStore.config,
      }));

    const roomMessages = useMemo(
      () => roomsStore[activeRoomJID]?.messages || [],
      [roomsStore, activeRoomJID]
    );

    useEffect(() => {
      if (!activeRoomJID) {
        dispatch(setCurrentRoom({ roomJID: chatJID }));
        dispatch(setIsLoading({ loading: true }));
      }

      const actualJID = activeRoomJID;
      const roomToSet = roomsStore?.[actualJID];
      if (roomToSet?.jid && !roomsStore[roomToSet.jid]) {
        dispatch(addRoom({ roomData: roomToSet }));
      }

      if (config.jwtLogin?.handleAutoChangeRoom && activeRoomJID !== chatJID) {
        console.log('handleAutoChangeRoom', activeRoomJID, chatJID);
        dispatch(setCurrentRoom({ roomJID: chatJID }));
      } else {
        roomToSet?.jid && dispatch(setCurrentRoom({ roomJID: activeRoomJID }));
      }

      if (roomMessages.length) {
        dispatch(setIsLoading({ chatJID: activeRoomJID, loading: false }));
      }
    }, [dispatch, activeRoomJID, roomsStore.length, chatJID]);

    const sendMessage = useCallback(
      (message: string) => {
        // dispatch(
        //   addRoomMessage({
        //     roomJID: currentRoom.jid,
        //     message: {
        //       id: getHighResolutionTimestamp(),
        //       user: {
        //         ...user,
        //         id: user.walletAddress,
        //         name: user.firstName + " " + user.lastName,
        //       },
        //       date: new Date().toISOString(),
        //       body: message,
        //       roomJID: currentRoom.jid,
        //       // pending: true,
        //     },
        //   })
        // );
        client?.sendMessage(
          activeRoomJID,
          user.firstName,
          user.lastName,
          '',
          user.walletAddress,
          message
        );
      },
      [activeRoomJID]
    );

    const sendStartComposing = useCallback(() => {
      client.sendTypingRequestStanza(
        activeRoomJID,
        `${user.firstName} ${user.lastName}`,
        true
      );
    }, []);

    const sendEndComposing = useCallback(() => {
      client.sendTypingRequestStanza(
        activeRoomJID,
        `${user.firstName} ${user.lastName}`,
        false
      );
    }, []);

    const loadMoreMessages = useCallback(
      async (chatJID: string, max: number, idOfMessageBefore?: number) => {
        if (!isLoadingMore) {
          setIsLoadingMore(true);
          client?.getHistoryStanza(chatJID, max, idOfMessageBefore).then(() => {
            setIsLoadingMore(false);
          });
        }
      },
      [client]
    );

    const sendMedia = useCallback(
      async (data: any, type: string) => {
        let mediaData: FormData | null = new FormData();
        mediaData.append('files', data);

        uploadFile(mediaData)
          .then((response) => {
            console.log('Upload successful', response);
            response.data.results.map(async (item: any) => {
              const data = {
                firstName: user.firstName,
                lastName: user.lastName,
                walletAddress: user.walletAddress,
                createdAt: item.createdAt,
                expiresAt: item.expiresAt,
                fileName: item.filename,
                isVisible: item?.isVisible,
                location: item.location,
                locationPreview: item.locationPreview,
                mimetype: item.mimetype,
                originalName: item?.originalname,
                ownerKey: item?.ownerKey,
                size: item.size,
                duration: item?.duration,
                updatedAt: item?.updatedAt,
                userId: item?.userId,
                attachmentId: item?._id,
                wrappable: true,
                roomJid: activeRoomJID,
                isPrivate: item?.isPrivate,
                __v: item.__v,
              };
              console.log(data, 'data to send media');
              client?.sendMediaMessageStanza(activeRoomJID, data);
            });
          })
          .catch((error) => {
            console.error('Upload failed', error);
          });
      },
      [client, activeRoomJID]
    );

    useEffect(() => {
      if (Object.values(roomsStore).length > 0) {
        if (!activeRoomJID) {
          dispatch(setCurrentRoom({ roomJID: chatJID }));
          dispatch(setIsLoading({ loading: true }));
        }

        if (!roomMessages.length) {
          const initialPresenceAndHistory = () => {
            if (!roomsStore[chatJID || activeRoomJID]) {
              client.joinBySendingPresence(chatJID).then(() => {
                client.getRooms().then(() => {
                  client.getHistoryStanza(chatJID, 30).then(() => {
                    dispatch(
                      setIsLoading({ chatJID: chatJID, loading: false })
                    );
                  });
                });
              });
            } else {
              client.getHistoryStanza(activeRoomJID, 30).then(() => {
                dispatch(
                  setIsLoading({ chatJID: activeRoomJID, loading: false })
                );
              });
            }
          };
          initialPresenceAndHistory();
        }
      } else if (chatJID) {
        const initialPresenceAndHistory = async () => {
          if (!roomsStore[chatJID || activeRoomJID]) {
            await client.joinBySendingPresence(chatJID);
            await client.getRooms();
            client.getHistoryStanza(chatJID, 30).then(() => {
              dispatch(setIsLoading({ chatJID: chatJID, loading: false }));
            });
          } else {
            client.getHistoryStanza(activeRoomJID, 30).then(() => {
              dispatch(
                setIsLoading({ chatJID: activeRoomJID, loading: false })
              );
            });
          }
        };
        initialPresenceAndHistory();
      }
    }, [
      client,
      activeRoomJID,
      roomMessages,
      dispatch,
      Object.values(roomsStore).length,
    ]);

    if (!activeRoomJID || !roomsStore[activeRoomJID]) {
      return (
        <div
          style={{
            height: '100%',
            width: '100%',
            alignItems: 'center',
            display: 'flex',
          }}
        >
          <Loader color={config?.colors?.primary} />
        </div>
      );
    }

    return (
      <ChatContainer
        style={{
          overflow: 'auto',
        }}
      >
        {!config?.disableHeader && (
          <ChatHeader currentRoom={roomsStore[activeRoomJID]} />
        )}
        {globalLoading ? (
          <Loader color={config?.colors?.primary} />
        ) : roomsStore[activeRoomJID]?.messages &&
          roomsStore[activeRoomJID]?.messages.length < 1 ? (
          <div
            style={{
              height: '100%',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <NoMessagesPlaceholder />
          </div>
        ) : (
          <MessageList
            loadMoreMessages={loadMoreMessages}
            CustomMessage={CustomMessageComponent}
            user={user}
            roomJID={activeRoomJID}
            config={config}
            loading={isLoadingMore}
          />
        )}
        <SendInput
          sendMessage={sendMessage}
          sendMedia={sendMedia}
          config={config}
          onFocus={sendStartComposing}
          onBlur={sendEndComposing}
          isLoading={loading}
        />
      </ChatContainer>
    );
  }
);

export default ChatRoom;
