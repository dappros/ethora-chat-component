import React, { useState, useEffect, useCallback } from 'react';
import { ChatContainer, NonRoomChat } from '../styled/StyledComponents';
import { useDispatch } from 'react-redux';
import MessageList from './MessageList';
import SendInput, { SendInputProps } from '../styled/SendInput';
import CustomTypingIndicator from '../styled/StyledInputComponents/CustomTypingIndicator';
import {
  deleteRoomMessage,
  setEditAction,
  setLastViewedTimestamp,
} from '../../roomStore/roomsSlice';
import Loader from '../styled/Loader';
import { useXmppClient } from '../../context/xmppProvider.tsx';
import ChatHeader from './ChatHeader.tsx';
import NoMessagesPlaceholder from './NoMessagesPlaceholder.tsx';
import NewChatModal from '../Modals/NewChatModal/NewChatModal.tsx';
import { EditWrapper } from './EditWrapper.tsx';
import { NoSelectedChatIcon } from '../../assets/icons.tsx';
import { ChooseChatMessage } from './ChooseChatMessage.tsx';
import { useRoomUrl } from '../../hooks/useRoomUrl.tsx';
import { useSendMessage } from '../../hooks/useSendMessage.tsx';
import { useRoomInitialization } from '../../hooks/useRoomInitialization.tsx';
import { useRoomState } from '../../hooks/useRoomState.tsx';
import { useChatSettingState } from '../../hooks/useChatSettingState.tsx';
import useComposing from '../../hooks/useComposing.tsx';
import { useCustomComponents } from '../../context/CustomComponentsContext';
import { MessageProps } from '../../types/types';
import { useLoaderDebug } from '../../hooks/useLoaderDebug';

interface ChatRoomProps {
  CustomMessageComponent?: React.ComponentType<MessageProps>;
  handleBackClick?: (value: boolean) => void;
}

const ChatRoom: React.FC<ChatRoomProps> = React.memo(
  ({ CustomMessageComponent, handleBackClick }) => {
    const { CustomInputComponent } = useCustomComponents();
    const { client } = useXmppClient();
    const dispatch = useDispatch();

    const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);

    const { user, config } = useChatSettingState();
    const {
      roomsList,
      activeRoomJID,
      editAction,
      loading,
      globalLoading,
      roomMessages,
    } = useRoomState();
    const {
      sendMessage: sendMs,
      sendMedia: sendMessageMedia,
      sendEditMessage,
      isLastMessageFromUserAndProcessing,
    } = useSendMessage();
    const { sendStartComposing, sendEndComposing } = useComposing(config);

    const sendMessage = useCallback(
      (message: string) => {
        sendMs(message, activeRoomJID);
      },
      [activeRoomJID, sendMs]
    );

    const sendMedia = useCallback(
      (data: any, type: string) => {
        return sendMessageMedia(data, type, activeRoomJID);
      },
      [activeRoomJID]
    );

    const loadMoreMessages = useCallback(
      async (chatJID: string, max: number, idOfMessageBefore?: number) => {
        if (!isLoadingMore && !roomsList?.[chatJID]?.historyComplete) {
          const lastMsgId =
            typeof idOfMessageBefore !== 'string'
              ? idOfMessageBefore
              : Number(
                  roomsList[chatJID].messages[
                    roomsList[chatJID].messages.length - 2
                  ].id
                );
          setIsLoadingMore(true);
          client
            ?.getHistoryStanza(chatJID, max, lastMsgId, undefined, {
              source: 'active',
            })
            .then(() => {
              setIsLoadingMore(false);
            });
        }
      },
      [client?.client?.jid]
    );

    const onCloseEdit = () => {
      dispatch(setEditAction({ isEdit: false }));
    };

    useEffect(() => {
      const enterTs = Date.now();
      dispatch(
        setLastViewedTimestamp({
          chatJID: activeRoomJID,
          timestamp: enterTs,
        })
      );
      setIsLoadingMore(false);
      return () => {
        const exitTs = Date.now();
        if (client && !config?.disableLastRead) {
          client.actionSetTimestampToPrivateStoreStanza(
            activeRoomJID,
            exitTs
          );
        }
        dispatch(
          setLastViewedTimestamp({
            chatJID: activeRoomJID,
            timestamp: exitTs,
          })
        );
        dispatch(
          deleteRoomMessage({
            roomJID: activeRoomJID,
            messageId: 'delimiter-new',
          })
        );
        setIsLoadingMore(false);
      };
    }, [activeRoomJID, client, dispatch]);

    // hooks useEffects
    useRoomUrl(activeRoomJID, roomsList, config);

    useRoomInitialization(
      activeRoomJID,
      roomsList,
      config,
      roomMessages.length
    );

    const activeRoom = activeRoomJID ? roomsList?.[activeRoomJID] : undefined;
    const CustomNoMessagesPlaceholder = config?.noMessagesPlaceholder;
    const hasMessages = (activeRoom?.messages?.length || 0) > 0;
    const loaderByGlobalLoading = Boolean(globalLoading);
    const loaderByLoading = Boolean(loading);
    const loaderByActiveRoomLoading = Boolean(activeRoom?.isLoading);
    const loaderByHistoryPreloadLoading = Boolean(
      !hasMessages && activeRoom?.historyPreloadState === 'loading'
    );

    const isHistoryLoading =
      loaderByGlobalLoading ||
      loaderByLoading ||
      loaderByActiveRoomLoading ||
      loaderByHistoryPreloadLoading;

    const activeRoomLoading =
      !hasMessages &&
      (loaderByLoading || loaderByActiveRoomLoading || loaderByHistoryPreloadLoading);

    useLoaderDebug('chat-room-history-loader', isHistoryLoading);
    useLoaderDebug(
      'chat-room-history-loader:globalLoading',
      loaderByGlobalLoading
    );
    useLoaderDebug('chat-room-history-loader:loading', loaderByLoading);
    useLoaderDebug(
      'chat-room-history-loader:activeRoom.isLoading',
      loaderByActiveRoomLoading
    );
    useLoaderDebug(
      "chat-room-history-loader:(!hasMessages&&historyPreloadState==='loading')",
      loaderByHistoryPreloadLoading
    );

    if (Object.keys(roomsList)?.length < 1 && !loading && !globalLoading) {
      return (
        <NonRoomChat>
          No room. Let's create one!
          <NewChatModal />
        </NonRoomChat>
      );
    }

    if (!activeRoomJID || !roomsList?.[activeRoomJID]) {
      return <ChooseChatMessage />;
    }

    return (
      <ChatContainer
        style={{
          overflow: 'auto',
          ...config?.chatRoomStyles,
        }}
      >
        {!config?.disableHeader && (
          <ChatHeader
            currentRoom={roomsList[activeRoomJID]}
            handleBackClick={handleBackClick}
          />
        )}
        {config?.chatHeaderAdditional?.enabled &&
          config.chatHeaderAdditional.element()}
        {activeRoomLoading ? (
          <Loader color={config?.colors?.primary} />
        ) : Object.keys(roomsList).length < 1 || !activeRoomJID ? (
          <NoSelectedChatIcon />
        ) : !hasMessages ? (
          CustomNoMessagesPlaceholder ? (
            <CustomNoMessagesPlaceholder />
          ) : (
            <NoMessagesPlaceholder />
          )
        ) : (
          <MessageList
            loadMoreMessages={loadMoreMessages}
            CustomMessage={CustomMessageComponent}
            user={user}
            roomJID={activeRoomJID}
            config={config}
            loading={isLoadingMore}
            isReply={false}
          />
        )}
        {editAction.isEdit && (
          <EditWrapper text={editAction.text} onClose={onCloseEdit} />
        )}
        {(() => {
          const baseInputProps: SendInputProps = {
            editMessage: editAction.text,
            sendMessage: editAction.isEdit ? sendEditMessage : sendMessage,
            sendMedia,
            config,
            onFocus: sendStartComposing,
            onBlur: sendEndComposing,
            isLoading: false,
            isMessageProcessing:
              isLastMessageFromUserAndProcessing(activeRoomJID),
            multiline: true,
            placeholderText: 'Type message',
          };

          const normalizedProps = {
            ...baseInputProps,
            onSendMessage: baseInputProps.sendMessage,
            onSendMedia: baseInputProps.sendMedia,
          };

          return CustomInputComponent ? (
            <CustomInputComponent {...normalizedProps} />
          ) : (
            <SendInput {...baseInputProps} />
          );
        })()}

        {/* Custom Typing Indicator for overlay/floating positions */}
        {config?.customTypingIndicator?.enabled &&
          (config.customTypingIndicator.position === 'overlay' ||
            config.customTypingIndicator.position === 'floating') &&
          roomsList[activeRoomJID]?.composing && (
            <CustomTypingIndicator
              usersTyping={roomsList[activeRoomJID]?.composingList || ['User']}
              text={config.customTypingIndicator.text}
              position={config.customTypingIndicator.position}
              styles={config.customTypingIndicator.styles}
              customComponent={config.customTypingIndicator.customComponent}
              isVisible={roomsList[activeRoomJID]?.composing || false}
            />
          )}
      </ChatContainer>
    );
  }
);

export default ChatRoom;
