import React, { useState, useEffect, useCallback } from 'react';
import { ChatContainer, NonRoomChat } from '../styled/StyledComponents';
import { useDispatch } from 'react-redux';
import MessageList from './MessageList';
import SendInput from '../styled/SendInput';
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
import useMessageLoaderQueue from '../../hooks/useMessageLoaderQueue.tsx';
import { useSendMessage } from '../../hooks/useSendMessage.tsx';
import { useRoomInitialization } from '../../hooks/useRoomInitialization.tsx';
import { useRoomState } from '../../hooks/useRoomState.tsx';
import { useChatSettingState } from '../../hooks/useChatSettingState.tsx';

interface ChatRoomProps {
  CustomMessageComponent?: any;
  handleBackClick?: (value: boolean) => void;
}

const ChatRoom: React.FC<ChatRoomProps> = React.memo(
  ({ CustomMessageComponent, handleBackClick }) => {
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
    const { sendMessage: sendMs, sendMedia: sendMessageMedia } =
      useSendMessage();

    const sendMessage = useCallback(
      (message: string) => {
        sendMs(message, activeRoomJID);
      },
      [activeRoomJID]
    );

    const sendMedia = useCallback(
      (data: any, type: string) => {
        sendMessageMedia(data, type, activeRoomJID);
      },
      [activeRoomJID]
    );

    const sendStartComposing = useCallback(() => {
      client.sendTypingRequestStanza(
        activeRoomJID,
        `${user.firstName} ${user.lastName}`,
        true
      );
    }, [activeRoomJID]);

    const sendEndComposing = useCallback(() => {
      client.sendTypingRequestStanza(
        activeRoomJID,
        `${user.firstName} ${user.lastName}`,
        false
      );
    }, [activeRoomJID]);

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

    const queueMessageLoader = useCallback(
      async (chatJID: string, max: number) => {
        try {
          client?.getHistoryStanza(chatJID, max);
        } catch (error) {
          console.log('Error in loading queue messages');
        }
      },
      [globalLoading, loading]
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
      return () => {
        if (client) {
          client.actionSetTimestampToPrivateStoreStanza(
            activeRoomJID,
            new Date().getTime(),
            Object.keys(roomsList)
          );
        }
        dispatch(
          setLastViewedTimestamp({
            chatJID: activeRoomJID,
            timestamp: new Date().getTime(),
          })
        );
        dispatch(
          deleteRoomMessage({
            roomJID: activeRoomJID,
            messageId: 'delimiter-new',
          })
        );
      };
    }, [activeRoomJID]);

    // hooks useEffect
    useMessageLoaderQueue(
      Object.keys(roomsList),
      globalLoading,
      loading,
      queueMessageLoader
    );

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
        {loading || globalLoading ? (
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
        <SendInput
          editMessage={editAction.text}
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
