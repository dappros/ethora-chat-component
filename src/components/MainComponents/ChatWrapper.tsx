import React, { FC, useCallback, useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import ChatRoom from './ChatRoom';
import {
  setActiveModal,
  setConfig,
  setDeleteModal,
  setLangSource,
} from '../../roomStore/chatSettingsSlice';
import { ChatWrapperBox } from '../styled/ChatWrapperBox';
import { Overlay, StyledModal } from '../styled/MediaModal';
import { Message } from '../MessageBubble/Message';
import { IConfig, IRoom, MessageProps, ModalType } from '../../types/types';
import { useXmppClient } from '../../context/xmppProvider';
import LoginForm from '../AuthForms/Login';
import { RootState } from '../../roomStore';
import {
  setCurrentRoom,
  setEditAction,
  setIsLoading,
} from '../../roomStore/roomsSlice';
import { refresh } from '../../networking/apiClient';
import RoomList from './RoomList';
import Modal from '../Modals/Modal/Modal';
import ThreadWrapper from '../Thread/ThreadWrapper';
import { ModalWrapper } from '../Modals/ModalWrapper/ModalWrapper';
import { useChatSettingState } from '../../hooks/useChatSettingState';
import useMessageLoaderQueue from '../../hooks/useMessageLoaderQueue';
import { useRoomState } from '../../hooks/useRoomState';
import { initRoomsPresence } from '../../helpers/initRoomsPresence';
import { updatedChatLastTimestamps } from '../../helpers/updatedChatLastTimestamps';
import { updateMessagesTillLast } from '../../helpers/updateMessagesTillLast';
import { StyledLoaderWrapper } from '../styled/StyledComponents';
import Loader from '../styled/Loader';
import { ModalReportChat } from '../Modals/ModalReportChat/ModalReportChat.tsx';
import useGetNewArchRoom from '../../hooks/useGetNewArchRoom.tsx';
import { useQRCodeChat } from '../../hooks/useQRCodeChatHandler';
import XmppClient from '../../networking/xmppClient.ts';
import { chatAutoEnterer } from '../../helpers/chatAutoEnterer.ts';
import { getRoomsWithRetry } from '../../helpers/getRoomsWithRetry.ts';

interface ChatWrapperProps {
  token?: string;
  room?: IRoom;
  loginData?: { email: string; password: string };
  MainComponentStyles?: React.CSSProperties; //change to particular types
  CustomMessageComponent?: React.ComponentType<MessageProps>;
  config?: IConfig;
  roomJID?: string;
}

const ChatWrapper: FC<ChatWrapperProps> = ({
  MainComponentStyles,
  CustomMessageComponent,
  config,
  roomJID,
}) => {
  const { user, activeModal, deleteModal } = useChatSettingState();
  const syncRooms = useGetNewArchRoom();

  const [isInited, setInited] = useState(true);
  const [showModal, setShowModal] = useState(false);

  const [isChatVisible, setIsChatVisible] = useState(false);
  const [isSmallScreen, setIsSmallScreen] = useState(false);
  const [isRetrying, setIsRetrying] = useState<boolean | 'norooms'>(false);

  const conferenceServer = config?.xmppSettings?.conference;

  const dispatch = useDispatch();
  const { wasAutoSelected } = useQRCodeChat(
    (params) => dispatch(setCurrentRoom(params)),
    conferenceServer
  );

  useEffect(() => {
    const handleResize = () => {
      setIsSmallScreen(window.innerWidth < 768);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [window.innerWidth]);

  const handleItemClick = (value: boolean) => {
    setIsChatVisible(value);
  };

  const { client, initializeClient, setClient } = useXmppClient();

  const { rooms, activeRoomJID, reportRoom } = useSelector(
    (state: RootState) => state.rooms
  );
  const { roomsList, loading, globalLoading, loadingText } = useRoomState();

  const activeMessage = useMemo(() => {
    if (activeRoomJID) {
      return rooms[activeRoomJID]?.messages?.find(
        (message) => message?.activeMessage
      );
    }
  }, [rooms, activeRoomJID]);

  const handleChangeChat = (chat: IRoom) => {
    if (activeRoomJID !== chat.jid) {
      dispatch(setIsLoading({ chatJID: chat.jid, loading: true }));
      dispatch(setCurrentRoom({ roomJID: chat.jid }));
      dispatch(setEditAction({ isEdit: false }));
      handleItemClick(true);
    }
  };

  const handleDeleteClick = () => {
    client.deleteMessageStanza(deleteModal.roomJid, deleteModal.messageId);
    dispatch(setDeleteModal({ isDeleteModal: false }));
  };

  const handleCloseDeleteModal = () => {
    dispatch(setDeleteModal({ isDeleteModal: false }));
  };

  const getRoomsWithRertyRequest = async () => {
    if (Object.keys(roomsList || {}).length < 1) {
      setIsRetrying(true);
      const retryRooms = await getRoomsWithRetry(client, config, syncRooms);
      if (!retryRooms) {
        setIsRetrying('norooms');
        return;
      }
    }
    setIsRetrying(false);
  };

  useEffect(() => {
    return () => {
      if (client && user.xmppPassword === '') {
        console.log('closing client');
        client.close();
        setClient(null);
      }
    };
  }, [user.xmppPassword]);

  const loadRooms = async (
    client: XmppClient,
    disableLoad: boolean = false
  ) => {
    !disableLoad &&
      dispatch(
        setIsLoading({ loading: true, loadingText: 'Loading rooms...' })
      );
    const rooms = await syncRooms(client, config);
    dispatch(setIsLoading({ loading: false, loadingText: undefined }));
    return rooms;
  };

  useEffect(() => {
    const initXmmpClient = async () => {
      if (config?.translates?.enabled && !config?.translates?.translations) {
        dispatch(setLangSource(config?.translates?.translations));
      }
      dispatch(setConfig(config));
      try {
        if (!user.xmppUsername) {
          setShowModal(true);
          console.log('Error, no user');
        } else {
          chatAutoEnterer({ roomJID, wasAutoSelected, config, dispatch });

          if (!client) {
            setInited(false);
            setShowModal(false);

            console.log('No client, so initing one');
            const newClient = await initializeClient(
              user.xmppUsername || user?.defaultWallet?.walletAddress,
              user?.xmppPassword,
              config?.xmppSettings,
              roomsList
            ).then((client) => {
              return client;
            });

            if (roomsList && Object.keys(roomsList).length > 0) {
              setInited(true);
              await initRoomsPresence(newClient, roomsList);
            } else {
              if (config?.newArch) {
                const rooms = await loadRooms(newClient);
                if (config?.enableRoomsRetry.enabled && rooms.length < 1) {
                  await getRoomsWithRertyRequest();
                }
                setInited(true);
              } else {
                await newClient.getRoomsStanza();
              }
            }
            await newClient
              .getChatsPrivateStoreRequestStanza()
              .then(
                async (
                  roomTimestampObject: [jid: string, timestamp: string]
                ) => {
                  updatedChatLastTimestamps(roomTimestampObject, dispatch);
                  // newClient.setVCardStanza(
                  //   `${user.firstName} ${user.lastName}`
                  // );
                  await updateMessagesTillLast(rooms, newClient);
                  setClient(newClient);
                }
              );

            {
              config?.refreshTokens?.enabled && refresh();
            }
          } else {
            if (config?.newArch) {
              const rooms = await loadRooms(client, true);
              if (config?.enableRoomsRetry.enabled && rooms.length < 1) {
                await getRoomsWithRertyRequest();
              }
            }
            setInited(true);
            await client
              .getChatsPrivateStoreRequestStanza()
              .then(
                async (
                  roomTimestampObject: [jid: string, timestamp: string]
                ) => {
                  updatedChatLastTimestamps(roomTimestampObject, dispatch);
                  await updateMessagesTillLast(rooms, client);
                  setClient(client);
                }
              );
            {
              config?.refreshTokens?.enabled && refresh();
            }
          }
        }
        dispatch(setIsLoading({ loading: false }));
      } catch (error) {
        setShowModal(true);
        setInited(false);
        dispatch(setIsLoading({ loading: false }));
        console.log(error);
      }
    };

    initXmmpClient();
  }, [user.xmppPassword, user.defaultWallet?.walletAddress]);

  const queueMessageLoader = useCallback(
    async (chatJID: string, max: number) => {
      try {
        return await client?.getHistoryStanza(chatJID, max);
      } catch (error) {
        console.log('Error in loading queue messages', error);
      }
    },
    [globalLoading, loading, !!client]
  );

  useMessageLoaderQueue(
    Object.keys(roomsList),
    roomsList,
    globalLoading,
    loading,
    queueMessageLoader
  );

  if (config?.enableRoomsRetry.enabled && isRetrying === 'norooms') {
    return (
      <StyledLoaderWrapper
        style={{ alignItems: 'center', flexDirection: 'column', gap: '10px' }}
      >
        {config.enableRoomsRetry.helperText ||
          'We couldn’t create any chat room.'}
      </StyledLoaderWrapper>
    );
  }

  if (config?.enableRoomsRetry.enabled && isRetrying) {
    return (
      <StyledLoaderWrapper
        style={{ alignItems: 'center', flexDirection: 'column', gap: '10px' }}
      >
        <Loader color={config?.colors?.primary} style={{ margin: '0px' }} />
        {loadingText && <div>{loadingText}</div>}
      </StyledLoaderWrapper>
    );
  }

  if (user.xmppPassword === '' && user.xmppUsername === '')
    return <LoginForm config={config} />;

  return (
    <>
      {showModal && (
        <Overlay>
          <StyledModal>
            There was an error. Please, refresh the page
          </StyledModal>
        </Overlay>
      )}
      {isInited ? (
        <ChatWrapperBox
          style={{
            ...MainComponentStyles,
          }}
        >
          <ChatWrapperBox
            style={{
              ...MainComponentStyles,
            }}
          >
            {!config?.disableRooms &&
              rooms &&
              (isSmallScreen ? (
                !isChatVisible && (
                  <RoomList
                    chats={Object.values(rooms)}
                    onRoomClick={handleChangeChat}
                    isSmallScreen={isSmallScreen}
                  />
                )
              ) : (
                <RoomList
                  chats={Object.values(rooms)}
                  onRoomClick={handleChangeChat}
                />
              ))}
            {isSmallScreen ? (
              isChatVisible ? (
                activeMessage?.activeMessage ? (
                  <ThreadWrapper
                    activeMessage={activeMessage}
                    user={user}
                    customMessageComponent={CustomMessageComponent || Message}
                  />
                ) : (
                  <ChatRoom
                    CustomMessageComponent={CustomMessageComponent || Message}
                    handleBackClick={handleItemClick}
                  />
                )
              ) : null
            ) : activeMessage?.activeMessage ? (
              <ThreadWrapper
                activeMessage={activeMessage}
                user={user}
                customMessageComponent={CustomMessageComponent || Message}
              />
            ) : (
              <ChatRoom
                CustomMessageComponent={CustomMessageComponent || Message}
              />
            )}
            <Modal
              modal={activeModal}
              setOpenModal={(value?: ModalType) =>
                dispatch(setActiveModal(value))
              }
            />
          </ChatWrapperBox>
        </ChatWrapperBox>
      ) : (
        <StyledLoaderWrapper
          style={{ alignItems: 'center', flexDirection: 'column', gap: '10px' }}
        >
          <Loader color={config?.colors?.primary} style={{ margin: '0px' }} />
          {loadingText && <div>{loadingText}</div>}
        </StyledLoaderWrapper>
      )}
      {deleteModal?.isDeleteModal && (
        <ModalWrapper
          title="Delete Message"
          description="Are you sure you want to delete this message?"
          buttonText="Delete"
          backgroundColorButton="#E53935"
          handleClick={handleDeleteClick}
          handleCloseModal={handleCloseDeleteModal}
        />
      )}
      {reportRoom.isOpen && <ModalReportChat />}
    </>
  );
};

export { ChatWrapper };
