import React, { FC, useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import ChatRoom from './ChatRoom';
import {
  setActiveModal,
  setConfig,
  setDeleteModal,
  setStoreClient,
} from '../../roomStore/chatSettingsSlice';
import { ChatWrapperBox } from '../styled/ChatWrapperBox';
import { Overlay, StyledModal } from '../styled/MediaModal';
import { Message } from '../MessageBubble/Message';
import {
  IConfig,
  IRoom,
  MessageProps,
  ModalType,
  User,
} from '../../types/types';
import { useXmppClient } from '../../context/xmppProvider';
import LoginForm from '../AuthForms/Login';
import { RootState } from '../../roomStore';
import Loader from '../styled/Loader';
import {
  setCurrentRoom,
  setEditAction,
  setIsLoading,
  setLastViewedTimestamp,
} from '../../roomStore/roomsSlice';
import { refresh } from '../../networking/apiClient';
import RoomList from './RoomList';
import { StyledLoaderWrapper } from '../styled/StyledComponents';
import Modal from '../Modals/Modal/Modal';
import ThreadWrapper from '../Thread/ThreadWrapper';
import { ModalWrapper } from '../Modals/ModalWrapper/ModalWrapper';

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
  room,
  config,
  roomJID,
}) => {
  const {
    user,
    activeModal,
    deleteModal,
    client: storedClient,
  } = useSelector((state: RootState) => state.chatSettingStore);

  const [isInited, setInited] = useState(false);
  const [showModal, setShowModal] = useState(false);
  // const [isModalDeleteOpen, setIsModalDeleteOpen] = useState(false);

  const [isChatVisible, setIsChatVisible] = useState(false);
  const [isSmallScreen, setIsSmallScreen] = useState(false);
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

  const dispatch = useDispatch();
  const { client, initializeClient, setClient } = useXmppClient();

  const { rooms, activeRoomJID } = useSelector(
    (state: RootState) => state.rooms
  );

  const activeMessage = useMemo(() => {
    if (activeRoomJID) {
      return rooms[activeRoomJID]?.messages?.find(
        (message) => message?.activeMessage
      );
    }
  }, [rooms, activeRoomJID]);

  const handleChangeChat = (chat: IRoom) => {
    dispatch(setCurrentRoom({ roomJID: chat.jid }));
    activeRoomJID !== chat.jid &&
      dispatch(setIsLoading({ chatJID: chat.jid, loading: true }));
    dispatch(setEditAction({ isEdit: false }));
    handleItemClick(true);
  };

  const handleDeleteClick = () => {
    client.deleteMessageStanza(deleteModal.roomJid, deleteModal.messageId);
    dispatch(setDeleteModal({ isDeleteModal: false }));
  };

  const handleCloseDeleteModal = () => {
    dispatch(setDeleteModal({ isDeleteModal: false }));
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

  useEffect(() => {
    if (roomJID) {
      dispatch(setCurrentRoom({ roomJID: roomJID }));
    }

    const initXmmpClient = async () => {
      try {
        if (!user.defaultWallet || user?.defaultWallet.walletAddress === '') {
          setShowModal(true);
          console.log('Error, no user');
        } else {
          if (!client && !storedClient) {
            setShowModal(false);

            console.log('No client, so initing one');
            await initializeClient(
              user.defaultWallet?.walletAddress,
              user.xmppPassword
            ).then((client) => {
              client.getRooms().then(() => {
                client.getChatsPrivateStoreRequestStanza();
                dispatch(setStoreClient(client));
                setClient(client);
              });
            });
            setInited(true);
            {
              config?.refreshTokens?.enabled && refresh();
            }
          } else if (storedClient) {
            setClient(client);
            if (!activeRoomJID) {
              client.getRooms().then(() => {
                client.getChatsPrivateStoreRequestStanza();
              });
            }
            setInited(true);
            {
              config?.refreshTokens?.enabled && refresh();
            }
          } else {
            if (!activeRoomJID) {
              client.getRooms().then(() => {
                client.getChatsPrivateStoreRequestStanza();
              });
            }
            client.getChatsPrivateStoreRequestStanza();
            setInited(true);
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
  }, [user.xmppPassword, user.defaultWallet]);

  // functionality to handle unreadmessages if user leaves tab
  useEffect(() => {
    const updateLastReadTimeStamp = () => {
      if (client) {
        client.actionSetTimestampToPrivateStoreStanza(
          room?.jid || roomJID,
          new Date().getTime()
        );
      }
      dispatch(
        setLastViewedTimestamp({
          chatJID: room?.jid || roomJID,
          timestamp: new Date().getTime(),
        })
      );
    };

    const handleBeforeUnload = () => {
      // updateLastReadTimeStamp();
    };

    window.addEventListener('blur', handleBeforeUnload);
    window.addEventListener('offline', handleBeforeUnload);

    return () => {
      window.removeEventListener('blur', handleBeforeUnload);
      window.removeEventListener('offline', handleBeforeUnload);
    };
  }, [client, room?.jid]);

  if (user.xmppPassword === '' && user.xmppUsername === '')
    return <LoginForm config={config} />;

  return (
    <>
      {showModal && (
        <Overlay>
          <StyledModal>Unsuccessfull login. Try again</StyledModal>
        </Overlay>
      )}
      <>
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
          <StyledLoaderWrapper>
            <Loader color={config?.colors?.primary} />
          </StyledLoaderWrapper>
        )}
      </>
      {deleteModal.isDeleteModal && (
        <ModalWrapper
          title="Delete Message"
          description="Are you sure you want to delete this message?"
          buttonText="Delete"
          backgroundColorButton="#E53935"
          handleClick={handleDeleteClick}
          handleCloseModal={handleCloseDeleteModal}
        />
      )}
    </>
  );
};

export { ChatWrapper };
