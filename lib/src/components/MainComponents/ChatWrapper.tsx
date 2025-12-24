import React, { FC, useCallback, useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import ChatRoom from './ChatRoom';
import {
  setActiveModal,
  setDeleteModal,
} from '../../roomStore/chatSettingsSlice';
import { ChatWrapperBox } from '../styled/ChatWrapperBox';
import { Message } from '../MessageBubble/Message';
import { IConfig, IRoom, ModalType } from '../../types/types';
import LoginForm from '../AuthForms/Login';
import { RootState } from '../../roomStore';
import {
  setCurrentRoom,
  setEditAction,
  setIsLoading,
} from '../../roomStore/roomsSlice';
import RoomList from './RoomList';
import Modal from '../Modals/Modal/Modal';
import ThreadWrapper from '../Thread/ThreadWrapper';
import { ModalWrapper } from '../Modals/ModalWrapper/ModalWrapper';
import { useChatSettingState } from '../../hooks/useChatSettingState';
import useMessageLoaderQueue from '../../hooks/useMessageLoaderQueue';
import { useRoomState } from '../../hooks/useRoomState';
import { StyledLoaderWrapper } from '../styled/StyledComponents';
import Loader from '../styled/Loader';
import { ModalReportChat } from '../Modals/ModalReportChat/ModalReportChat.tsx';
import { useQRCodeChat } from '../../hooks/useQRCodeChatHandler';
import useChatWrapperInit from '../../hooks/useChatWrapperInit.ts';
import { useHeapSender } from '../../hooks/useHeapSender';
import ErrorFallback from './ErrorFallback';
import ConnectionBanner from './ConnectionBanner';
import { useCustomComponents } from '../../context/CustomComponentsContext';

interface ChatWrapperProps {
  token?: string;
  room?: IRoom;
  loginData?: { email: string; password: string };
  MainComponentStyles?: React.CSSProperties; //change to particular types
  config?: IConfig;
  roomJID?: string;
}

const ChatWrapper: FC<ChatWrapperProps> = ({
  MainComponentStyles,
  config,
  roomJID,
}) => {
  const { CustomMessageComponent } = useCustomComponents();
  const resolvedMessageComponent = CustomMessageComponent || Message;
  const { user, activeModal, deleteModal } = useChatSettingState();

  const [isChatVisible, setIsChatVisible] = useState(false);
  const [isSmallScreen, setIsSmallScreen] = useState(false);

  const conferenceServer = config?.xmppSettings?.conference;

  const dispatch = useDispatch();
  const { wasAutoSelected } = useQRCodeChat(
    (params) => dispatch(setCurrentRoom(params)),
    conferenceServer
  );

  useEffect(() => {
    // Only run on client-side
    if (typeof window === 'undefined') {
      return;
    }

    const checkScreenSize = () => {
      setIsSmallScreen(window.innerWidth < 768);
    };

    // Set initial value
    checkScreenSize();

    // Listen for resize events
    window.addEventListener('resize', checkScreenSize);

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('resize', checkScreenSize);
      }
    };
  }, []); // Remove window.innerWidth from dependencies

  const handleItemClick = (value: boolean) => {
    setIsChatVisible(value);
  };

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
    dispatch(setCurrentRoom({ roomJID: null }));
    dispatch(setIsLoading({ chatJID: chat.jid, loading: true }));
    dispatch(setCurrentRoom({ roomJID: chat.jid }));
    dispatch(setEditAction({ isEdit: false }));
    handleItemClick(true);
    if (!chat?.historyComplete && chat.messages?.length < 30) {
      client?.getHistoryStanza(chat.jid, 30);
    }
  };

  const handleDeleteClick = () => {
    client.deleteMessageStanza(deleteModal.roomJid, deleteModal.messageId);
    dispatch(setDeleteModal({ isDeleteModal: false }));
  };

  const handleCloseDeleteModal = () => {
    dispatch(setDeleteModal({ isDeleteModal: false }));
  };

  const {
    client,
    inited,
    isRetrying,
    showModal,
    setShowModal,
    isConnectionLost,
  } = useChatWrapperInit({
    roomJID,
    wasAutoSelected,
    config,
  });
  const { sendHeapMessages } = useHeapSender(client);

  useEffect(() => {
    if (inited && client) {
      sendHeapMessages();
    }
  }, [inited, client]);

  //upd logic to use
  // const queueMessageLoader = useCallback(
  //   async (chatJID: string, max: number) => {
  //     try {
  //       console.log('2'); //bad
  //       return await client?.getHistoryStanza(chatJID, max);
  //     } catch (error) {
  //       console.log('Error in loading queue messages', error);
  //     }
  //   },
  //   [globalLoading, loading, !!client]
  // );

  // useMessageLoaderQueue(
  //   Object.keys(roomsList),
  //   roomsList,
  //   globalLoading,
  //   loading,
  //   queueMessageLoader
  // );

  if (showModal) {
    return (
      <ErrorFallback
        MainComponentStyles={MainComponentStyles}
        onButtonClick={() => {
          setShowModal(false);
          if (typeof window !== 'undefined') {
            window.location.reload();
          }
        }}
      />
    );
  }

  if (isConnectionLost && !inited) {
    return (
      <ChatWrapperBox
        style={{
          ...MainComponentStyles,
        }}
      >
        <ConnectionBanner />
        <StyledLoaderWrapper
          style={{ alignItems: 'center', flexDirection: 'column', gap: '10px' }}
        >
          <Loader color={config?.colors?.primary} style={{ margin: '0px' }} />
          <div>Connecting...</div>
        </StyledLoaderWrapper>
      </ChatWrapperBox>
    );
  }

  if (config?.enableRoomsRetry?.enabled && isRetrying === 'norooms') {
    return (
      <StyledLoaderWrapper
        style={{ alignItems: 'center', flexDirection: 'column', gap: '10px' }}
      >
        {config.enableRoomsRetry.helperText ||
          "We couldn't create any chat room."}
      </StyledLoaderWrapper>
    );
  }

  if (config?.enableRoomsRetry?.enabled && isRetrying) {
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
      {inited ? (
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
                    customMessageComponent={resolvedMessageComponent}
                  />
                ) : (
                  <ChatRoom
                    CustomMessageComponent={resolvedMessageComponent}
                    handleBackClick={handleItemClick}
                  />
                )
              ) : config?.disableRooms ? (
                <ChatRoom
                  CustomMessageComponent={resolvedMessageComponent}
                  handleBackClick={handleItemClick}
                />
              ) : null
            ) : activeMessage?.activeMessage ? (
              <ThreadWrapper
                activeMessage={activeMessage}
                user={user}
                customMessageComponent={resolvedMessageComponent}
              />
            ) : (
              <ChatRoom CustomMessageComponent={resolvedMessageComponent} />
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
