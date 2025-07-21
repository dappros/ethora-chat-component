import React, { useState, useEffect, useCallback } from 'react';
import { ChatContainer, NonRoomChat } from '../../styled/StyledComponents';
import { useDispatch } from 'react-redux';
import SendInput from '../../styled/SendInput';
import {
  deleteRoomMessage,
  setEditAction,
  setLastViewedTimestamp,
} from '../../../roomStore/roomsSlice';
import Loader from '../../styled/Loader';
import { useXmppClient } from '../../../context/xmppProvider.tsx';
import NewChatModal from '../../Modals/NewChatModal/NewChatModal.tsx';
import { NoSelectedChatIcon } from '../../../assets/icons.tsx';
import { useRoomUrl } from '../../../hooks/useRoomUrl.tsx';
import { useSendMessage } from '../../../hooks/useSendMessage.tsx';
import { useRoomState } from '../../../hooks/useRoomState.tsx';
import { useChatSettingState } from '../../../hooks/useChatSettingState.tsx';
import useComposing from '../../../hooks/useComposing.tsx';
import ChatHeader from '../ChatHeader.tsx';
import NoMessagesPlaceholder from '../NoMessagesPlaceholder.tsx';
import MessageList from '../MessageList.tsx';
import AssistantMessageList from './AssistantMessageList.tsx';
import { useRoomInitialization } from '../hooks/useRoomInitialization.tsx';

interface AssisstantChatRoomProps {
  CustomMessageComponent?: any;
  handleBackClick?: (value: boolean) => void;
}

const AssisstantChatRoom: React.FC<AssisstantChatRoomProps> = React.memo(
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
    const {
      sendMessage: sendMs,
      sendMedia: sendMessageMedia,
      sendEditMessage,
    } = useSendMessage();
    const { sendStartComposing, sendEndComposing } = useComposing();

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
      [activeRoomJID]
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

    useEffect(() => {
      dispatch(
        setLastViewedTimestamp({
          chatJID: activeRoomJID,
          timestamp: 0,
        })
      );
      setIsLoadingMore(false);
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
        setIsLoadingMore(false);
      };
    }, [activeRoomJID]);

    // hooks useEffects
    useRoomUrl(activeRoomJID, roomsList, config);

    useRoomInitialization(
      activeRoomJID,
      roomsList,
      config,
      roomMessages.length
    );

    return (
      <ChatContainer
        style={{
          overflow: 'auto',
          ...config?.AssisstantChatRoomStyles,
        }}
      >
        <AssistantMessageList
          loadMoreMessages={loadMoreMessages}
          CustomMessage={CustomMessageComponent}
          user={user}
          roomJID={activeRoomJID}
          config={config}
          loading={isLoadingMore}
          isReply={false}
        />
        <SendInput
          editMessage={editAction.text}
          sendMessage={editAction.isEdit ? sendEditMessage : sendMessage}
          sendMedia={sendMedia}
          config={config}
          onFocus={sendStartComposing}
          onBlur={sendEndComposing}
          isLoading={false}
        />
      </ChatContainer>
    );
  }
);

export default AssisstantChatRoom;
