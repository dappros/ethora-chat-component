import React, { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import ChatRoom from './ChatRoom';
import {
  setActiveModal,
  setDeleteModal,
} from '../../roomStore/chatSettingsSlice';
import { ChatWrapperBox, ChatWrapperInnerBox } from '../styled/ChatWrapperBox';
import { Message } from '../MessageBubble/Message';
import { IConfig, IRoom, ModalType } from '../../types/types';
import LoginForm from '../AuthForms/Login';
import { RootState } from '../../roomStore';
import {
  setCloseActiveMessage,
  setCurrentRoom,
  setEditAction,
  setIsLoading,
} from '../../roomStore/roomsSlice';
import RoomList from './RoomList';
import Modal from '../Modals/Modal/Modal';
import SidePanel from '../Modals/SidePanel/SidePanel';
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
import ErrorFallback from './ErrorFallback';
import ConnectionBanner from './ConnectionBanner';
import FallbackScreen from './FallbackScreen';
import { useCustomComponents } from '../../context/CustomComponentsContext';
import { ethoraLogger } from '../../helpers/ethoraLogger';
import { useLoaderDebug } from '../../hooks/useLoaderDebug';
import { useExclusiveRightPane } from '../../hooks/useExclusiveRightPane';
import { SIDE_PANEL_MODAL_TYPES } from '../../helpers/constants/MODAL_TYPES';
import { useIsMobileViewport } from '../../hooks/useIsMobileViewport';

// Three columns (432px room list + chat + 400px panel) stop fitting long
// before the mobile breakpoint: at 1000px the chat would be left with ~170px,
// which is not a chat. 1280 is the narrowest viewport that still leaves the
// conversation ~450px, so below it the ROOM LIST is the column that gives way
// while a panel is open - it is the one you are least likely to be reading,
// and closing the panel brings it straight back.
export const THREE_COLUMN_MIN_WIDTH_PX = 1280;

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
  // Initialize from the actual viewport on the FIRST render (lazy initializer)
  // instead of defaulting to false. Otherwise the first paint uses the desktop
  // 432px room-list width and then snaps to 100% once the effect runs - the
  // "list is wide, then shrinks" jump on mobile load.
  const [isSmallScreen, setIsSmallScreen] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 768
  );
  const [isRouteActive, setIsRouteActive] = useState(true);

  const conferenceServer = config?.xmppSettings?.conference;

  const dispatch = useDispatch();

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

  const rooms = useSelector((state: RootState) => state.rooms.rooms);
  const activeRoomJID = useSelector((state: RootState) => state.rooms.activeRoomJID);
  const isRoomsLoading = useSelector((state: RootState) => state.rooms.isLoading);
  const reportRoomIsOpen = useSelector((state: RootState) =>
    Boolean(state.rooms?.reportRoom?.isOpen)
  );
  const { loadingText } = useRoomState();

  // Deliberately placed after the room selectors: the QR / deep-link hook
  // needs to see the rooms as they load so it can keep re-asserting the
  // requested room until it actually lands (and stop once it is clear the
  // room will never arrive). `conferenceServer` comes from the host config
  // only - there is no build-time fallback.
  const { wasAutoSelected } = useQRCodeChat(
    useCallback(
      (params: { roomJID: string }) => dispatch(setCurrentRoom(params)),
      [dispatch]
    ),
    conferenceServer,
    {
      rooms,
      activeRoomJID,
      isReady: !isRoomsLoading && Object.keys(rooms || {}).length > 0,
    }
  );

  // A QR code is scanned on a phone, which is exactly the viewport where the
  // room list and the conversation are two separate screens. Selecting the
  // room is not enough there: without this the deep link left the user
  // looking at the room list with the target room silently selected behind
  // it. Fires once per auto-selected room, so tapping Back still works.
  const revealedRoomRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isSmallScreen) return;
    if (!activeRoomJID) return;
    if (!wasAutoSelected && !roomJID) return;
    if (revealedRoomRef.current === activeRoomJID) return;
    revealedRoomRef.current = activeRoomJID;
    setIsChatVisible(true);
  }, [isSmallScreen, activeRoomJID, wasAutoSelected, roomJID]);

  // Memoized so ChatWrapper re-renders that don't touch `rooms` (typing
  // indicators, activeRoomJID changes, etc.) don't hand RoomList a brand-new
  // array reference each time, which otherwise forces its `filteredChats`
  // useMemo (keyed on `chats`) to re-run and re-sort for no reason.
  const roomsList = useMemo<IRoom[]>(() => Object.values(rooms), [rooms]);

  const activeMessage = useMemo(() => {
    if (activeRoomJID) {
      return rooms[activeRoomJID]?.messages?.find(
        (message: { activeMessage: any; }) => message?.activeMessage
      );
    }
  }, [rooms, activeRoomJID]);

  const handleChangeChat = (chat: IRoom) => {
    dispatch(setCurrentRoom({ roomJID: null }));
    dispatch(setIsLoading({ chatJID: chat.jid, loading: true }));
    dispatch(setCurrentRoom({ roomJID: chat.jid }));
    dispatch(setEditAction({ isEdit: false }));
    client?.promoteRoomHistory(chat.jid);
    handleItemClick(true);
    if (!chat?.historyComplete && chat.messages?.length < 30) {
      client?.getHistoryStanza(chat.jid, 30, undefined, undefined, {
        source: 'active',
        coalesceRoom: true,
        skipIfPreloaded: true,
      });
    }
  };

  // Only one of the thread view and the profile panel may hold the right
  // column; see useExclusiveRightPane for the rule.
  const isThreadOpen = Boolean(activeMessage?.activeMessage);
  const isSidePanelOpen = SIDE_PANEL_MODAL_TYPES.includes(activeModal || '');
  useExclusiveRightPane({
    threadOpen: isThreadOpen,
    panelOpen: isSidePanelOpen,
    closeThread: () => {
      if (activeRoomJID) {
        dispatch(setCloseActiveMessage({ chatJID: activeRoomJID }));
      }
    },
    closePanel: () => dispatch(setActiveModal(undefined)),
  });

  // Desktop, but not wide enough for room list + chat + panel at once.
  const isNarrowDesktop = useIsMobileViewport(THREE_COLUMN_MIN_WIDTH_PX - 1);
  const hideRoomListForPanel =
    !isSmallScreen && isSidePanelOpen && isNarrowDesktop;

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
  const hasRooms = Object.keys(rooms || {}).length > 0;
  const clientReadyForUI = !!client && !isConnectionLost && hasRooms;
  const showShell = (inited || clientReadyForUI) && !(isRoomsLoading && !hasRooms);
  const isConnectingLoaderVisible = isConnectionLost && !inited;
  const isRoomsRetryLoaderVisible = Boolean(
    config?.enableRoomsRetry?.enabled && isRetrying && isRetrying !== 'norooms'
  );
  const isStartupLoaderVisible =
    !showModal &&
    !isConnectingLoaderVisible &&
    !isRoomsRetryLoaderVisible &&
    user.xmppPassword !== '' &&
    user.xmppUsername !== '' &&
    isRouteActive &&
    !showShell;

  useLoaderDebug('chat-wrapper-connecting-loader', isConnectingLoaderVisible);
  useLoaderDebug('chat-wrapper-retry-loader', isRoomsRetryLoaderVisible);
  useLoaderDebug('chat-wrapper-startup-loader', isStartupLoaderVisible);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mountPathname = window.location.pathname;

    const syncRouteState = () => {
      const stillOnMountRoute = window.location.pathname === mountPathname;
      setIsRouteActive(stillOnMountRoute);
      if (!stillOnMountRoute && activeRoomJID) {
        dispatch(setCurrentRoom({ roomJID: null }));
      }
    };

    syncRouteState();
    const interval = window.setInterval(syncRouteState, 250);
    window.addEventListener('popstate', syncRouteState);
    window.addEventListener('hashchange', syncRouteState);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('popstate', syncRouteState);
      window.removeEventListener('hashchange', syncRouteState);
    };
  }, [activeRoomJID, dispatch]);

  //upd logic to use
  // const queueMessageLoader = useCallback(
  //   async (chatJID: string, max: number) => {
  //     try {
  //       ethoraLogger.log('2'); //bad
  //       return await client?.getHistoryStanza(chatJID, max);
  //     } catch (error) {
  //       ethoraLogger.log('Error in loading queue messages', error);
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
    if (config?.fallbackScreens?.noConnection != null) {
      return (
        <ChatWrapperBox style={{ ...MainComponentStyles }}>
          <FallbackScreen content={config.fallbackScreens.noConnection} />
        </ChatWrapperBox>
      );
    }
    return (
      <ChatWrapperBox
        style={{
          ...MainComponentStyles,
        }}
      >
        <ConnectionBanner message="Connection lost. Retrying..." />
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
    if (config?.fallbackScreens?.noRoom != null) {
      return (
        <ChatWrapperBox style={{ ...MainComponentStyles }}>
          <FallbackScreen content={config.fallbackScreens.noRoom} />
        </ChatWrapperBox>
      );
    }
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

  if (user.xmppPassword === '' && user.xmppUsername === '') {
    if (config?.fallbackScreens?.noUser != null) {
      return (
        <ChatWrapperBox style={{ ...MainComponentStyles }}>
          <FallbackScreen content={config.fallbackScreens.noUser} />
        </ChatWrapperBox>
      );
    }
    return <LoginForm config={config} />;
  }

  if (!isRouteActive) {
    return null;
  }

  // No rooms exist for this user after init finished - the shell would just
  // show an empty list, so let the host swap in an explanation instead.
  if (
    config?.fallbackScreens?.noRoom != null &&
    inited &&
    !isRoomsLoading &&
    !hasRooms
  ) {
    return (
      <ChatWrapperBox style={{ ...MainComponentStyles }}>
        <FallbackScreen content={config.fallbackScreens.noRoom} />
      </ChatWrapperBox>
    );
  }

  return (
    <>
      {showShell ? (
        <ChatWrapperBox
          style={{
            ...MainComponentStyles,
          }}
        >
          <ChatWrapperInnerBox
            style={{
              ...MainComponentStyles,
            }}
          >
            {!config?.disableRooms &&
              rooms &&
              (isSmallScreen
                ? !isChatVisible && (
                    <RoomList
                      chats={roomsList}
                      onRoomClick={handleChangeChat}
                      isSmallScreen={isSmallScreen}
                    />
                  )
                : !hideRoomListForPanel && (
                    <RoomList
                      chats={roomsList}
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
            {/* The profile/settings family is a COLUMN of this row, not an
                overlay on top of it, so opening one narrows the chat instead
                of covering it. Everything still centred (file preview, the
                confirm cards) stays with <Modal/>. */}
            <SidePanel
              modal={activeModal}
              setOpenModal={(value?: ModalType) =>
                dispatch(setActiveModal(value))
              }
            />
            <Modal
              modal={activeModal}
              setOpenModal={(value?: ModalType) =>
                dispatch(setActiveModal(value))
              }
            />
            {/* VideoCallOverlay now lives in XmppProvider (see xmppProvider.tsx)
                so an incoming call still rings while the user is on a
                different in-app page, not just while <Chat> is mounted. */}
          </ChatWrapperInnerBox>
        </ChatWrapperBox>
      ) : (
        <StyledLoaderWrapper
          style={{ alignItems: 'center', flexDirection: 'column', gap: '10px' }}
        >
          <Loader color={config?.colors?.primary} style={{ margin: '0px' }} />
          <div>{loadingText || 'Loading chat...'}</div>
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
      {reportRoomIsOpen && <ModalReportChat />}
    </>
  );
};

export { ChatWrapper };
