import React, { useState, useEffect, useCallback } from 'react';
import { ChatContainer } from '../../styled/StyledComponents';
import { useDispatch } from 'react-redux';
import SendInput from '../../styled/SendInput';
import {
  deleteRoomMessage,
  setLastViewedTimestamp,
} from '../../../roomStore/roomsSlice';
import { useXmppClient } from '../../../context/xmppProvider.tsx';
import { useRoomUrl } from '../../../hooks/useRoomUrl.tsx';
import { useSendMessage } from '../../../hooks/useSendMessage.tsx';
import { useRoomState } from '../../../hooks/useRoomState.tsx';
import { useChatSettingState } from '../../../hooks/useChatSettingState.tsx';
import useComposing from '../../../hooks/useComposing.tsx';
import AssistantMessageList from './AssistantMessageList.tsx';

interface AssisstantChatRoomProps {
  CustomMessageComponent?: any;
  handleBackClick?: (value: boolean) => void;
}

const AssisstantChatRoom: React.FC<AssisstantChatRoomProps> = React.memo(
  ({ CustomMessageComponent, handleBackClick }) => {
    const { client } = useXmppClient();
    const dispatch = useDispatch();

    const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
    const { config } = useChatSettingState();
    const user = config.assistantMode.user;

    const { roomsList, activeRoomJID, editAction } = useRoomState();
    const { sendMessage: sendMs } = useSendMessage();
    const { sendStartComposing, sendEndComposing } = useComposing();

    const sendMessage = useCallback(
      (message: string) => {
        dispatch(
          setLastViewedTimestamp({
            chatJID: activeRoomJID,
            timestamp: 0,
          })
        );
        console.log(activeRoomJID);
        sendMs(message, activeRoomJID, user);
        // sendUserMessage(message, user);
      },
      [activeRoomJID]
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

    return (
      <ChatContainer
        style={{
          overflow: 'auto',
          ...config?.AssisstantChatRoomStyles,
        }}
      >
        <AssistantMessageList
          CustomMessage={CustomMessageComponent}
          user={user}
          roomJID={activeRoomJID}
          config={config}
          isReply={false}
        />
        <SendInput
          editMessage={editAction.text}
          sendMessage={sendMessage}
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
