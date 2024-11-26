import React, { FC, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import ChatRoom from './ChatRoom';
import { setActiveModal, setConfig } from '../../roomStore/chatSettingsSlice';
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
  setIsLoading,
  setLastViewedTimestamp,
} from '../../roomStore/roomsSlice';
import { refresh } from '../../networking/apiClient';
import RoomList from './RoomList';
import { StyledLoaderWrapper } from '../styled/StyledComponents';
import Modal from '../Modals/Modal/Modal';

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
  const [isInited, setInited] = useState(false);
  const [showModal, setShowModal] = useState(false);

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

  const { user, activeModal } = useSelector(
    (state: RootState) => state.chatSettingStore
  );

  const { rooms, activeRoomJID } = useSelector(
    (state: RootState) => state.rooms
  );

  const handleChangeChat = (chat: IRoom) => {
    if (activeRoomJID !== chat.jid) {
      dispatch(setCurrentRoom({ roomJID: chat.jid }));
      dispatch(setIsLoading({ chatJID: chat.jid, loading: true }));
      handleItemClick(true);
    }
  };

  const { client, initializeClient, setClient } = useXmppClient();

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

    dispatch(setConfig(config));
    dispatch(setIsLoading({ loading: true }));

    const initXmmpClient = async () => {
      try {
        if (!user.defaultWallet || user?.defaultWallet.walletAddress === '') {
          setShowModal(true);
          console.log('Error, no user');
        } else {
          if (!client) {
            setShowModal(false);

            console.log('No client, so initing one');
            await initializeClient(
              user.defaultWallet?.walletAddress,
              user.xmppPassword
            ).then((client) => {
              client.getRooms().then(() => {
                // client.getChatsPrivateStoreRequestStanza();
                setClient(client);
              });
            });
            setInited(true);
            refresh();
          } else {
            if (!activeRoomJID) {
              client.getRooms();
            }
            setInited(true);
            refresh();
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
  }, [user.xmppPassword]);

  // functionality to handle unreadmessages
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
      updateLastReadTimeStamp();
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
                <ChatRoom
                  CustomMessageComponent={CustomMessageComponent || Message}
                  handleBackClick={
                    isChatVisible ? () => handleItemClick(false) : undefined
                  }
                />
              ) : null
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
        ) : (
          <StyledLoaderWrapper>
            <Loader color={config?.colors?.primary} />
          </StyledLoaderWrapper>
        )}
      </>
    </>
  );
};

export { ChatWrapper };
