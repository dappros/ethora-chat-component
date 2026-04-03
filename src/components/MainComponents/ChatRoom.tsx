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
        dispatch(
          setLastViewedTimestamp({
            chatJID: activeRoomJID,
            timestamp: 0,
          })
        );
        sendMs(message, activeRoomJID);
      },
      [activeRoomJID, sendMs]
    );

    const sendMedia = useCallback(
      (data: any, type: string) => {
        sendMessageMedia(data, type, activeRoomJID);
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
          client?.getHistoryStanza(chatJID, max, lastMsgId).then(() => {
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
      dispatch(
        setLastViewedTimestamp({
          chatJID: activeRoomJID,
          timestamp: 0,
        })
      );
      setIsLoadingMore(false);
      return () => {
        const exitTs = Date.now();
        if (client) {
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
        {globalLoading ||
        (!roomsList[activeRoomJID].historyComplete &&
          roomsList[activeRoomJID].messages.length < 1) ? (
          <Loader color={config?.colors?.primary} />
        ) : Object.keys(roomsList).length < 1 || !activeRoomJID ? (
          <NoSelectedChatIcon />
        ) : roomsList[activeRoomJID]?.messages &&
          roomsList[activeRoomJID]?.messages.length < 1 ? (
          <NoMessagesPlaceholder />
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
