import { FC, useCallback, useEffect, useState } from 'react';
import { IMessage, User } from '../../types/types';
import {
  AlsoCheckbox,
  AlsoContainer,
  ChatContainer,
} from '../styled/StyledComponents';
import SendInput from '../styled/SendInput';
import { useDispatch } from 'react-redux';
import { useXmppClient } from '../../context/xmppProvider';
import MessageList from '../MainComponents/MessageList';
import ModalHeaderComponent from '../Modals/ModalHeaderComponent';
import {
  deleteRoomMessage,
  setCloseActiveMessage,
  setEditAction,
  setLastViewedTimestamp,
} from '../../roomStore/roomsSlice';
import { EditWrapper } from '../MainComponents/EditWrapper';
import { useSendMessage } from '../../hooks/useSendMessage';
import { createMainMessageForThread } from '../../helpers/createMainMessageForThread';
import { useRoomState } from '../../hooks/useRoomState';
import { useChatSettingState } from '../../hooks/useChatSettingState';

interface ThreadWrapperProps {
  activeMessage: IMessage;
  user: User;
  customMessageComponent?: React.ComponentType<{
    message: IMessage;
    isUser: boolean;
    isReply: boolean;
  }>;
}

const ThreadWrapper: FC<ThreadWrapperProps> = ({
  activeMessage,
  user,
  customMessageComponent: CustomMessageComponent,
}) => {
  const { client } = useXmppClient();
  const dispatch = useDispatch();

  const { loading, roomsList, editAction, activeRoomJID } = useRoomState();
  const { config } = useChatSettingState();
  const { sendMessage: sendMs } = useSendMessage();

  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [isChecked, setIsChecked] = useState<boolean>(false);

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

  const sendStartComposing = useCallback(() => {
    client.sendTypingRequestStanza(
      activeMessage.roomJid,
      `${user.firstName} ${user.lastName}`,
      true
    );
  }, []);

  const sendEndComposing = useCallback(() => {
    client.sendTypingRequestStanza(
      activeMessage.roomJid,
      `${user.firstName} ${user.lastName}`,
      false
    );
  }, []);

  const onCloseEdit = () => {
    dispatch(setEditAction({ isEdit: false }));
  };

  const closeThread = () => {
    dispatch(setCloseActiveMessage({ chatJID: activeMessage.roomJid }));
    dispatch(setEditAction({ isEdit: false }));
  };

  return (
    <ChatContainer
      style={{
        overflow: 'auto',
        ...config?.chatRoomStyles,
      }}
    >
      <ModalHeaderComponent
        headerTitle="Thread"
        handleCloseModal={closeThread}
      />
      <MessageList
        loadMoreMessages={loadMoreMessages}
        CustomMessage={CustomMessageComponent}
        user={user}
        roomJID={activeMessage.roomJid}
        config={config}
        loading={isLoadingMore}
        activeMessage={activeMessage}
        isReply
      />
      <AlsoContainer
        style={{ cursor: 'pointer' }}
        onClick={() => setIsChecked((prev) => !prev)}
      >
        <AlsoCheckbox
          accentColor={config?.colors?.primary || '#0052CD'}
          type="checkbox"
          checked={isChecked}
          onChange={(e) => setIsChecked(e.target.checked)}
        />
        <span>Also send to</span>
        <a
          style={{
            color: config?.colors?.primary || '#0052CD',
            fontWeight: 500,
            cursor: 'pointer',
            borderBottom: '1px solid',
          }}
          onClick={closeThread}
        >
          {roomsList[activeMessage.roomJid].name}
        </a>
      </AlsoContainer>
      {editAction.isEdit && (
        <EditWrapper text={editAction.text} onClose={onCloseEdit} />
      )}
    </ChatContainer>
  );
};

export default ThreadWrapper;
