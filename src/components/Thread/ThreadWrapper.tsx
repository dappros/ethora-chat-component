import { FC, useCallback, useState } from 'react';
import { IMessage, User } from '../../types/types';
import {
  AlsoCheckbox,
  AlsoContainer,
  ChatContainer,
} from '../styled/StyledComponents';
import SendInput from '../styled/SendInput';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../roomStore';
import { useXmppClient } from '../../context/xmppProvider';
import { uploadFile } from '../../networking/api-requests/auth.api';
import MessageList from '../MainComponents/MessageList';
import ModalHeaderComponent from '../Modals/ModalHeaderComponent';
import {
  setCloseActiveMessage,
  setEditAction,
} from '../../roomStore/roomsSlice';
import { EditWrapper } from '../MainComponents/EditWrapper';
import { useSendMessage } from '../../hooks/useSendMessage';

interface ThreadWrapperProps {
  activeMessage: IMessage;
  user: User;
  customMessageComponent?: React.ComponentType<{
    message: IMessage;
    isUser: boolean;
  }>;
}

const ThreadWrapper: FC<ThreadWrapperProps> = ({
  activeMessage,
  user,
  customMessageComponent: CustomMessageComponent,
}) => {
  const { client } = useXmppClient();
  const dispatch = useDispatch();
  const { config, loading, roomsList, editAction } = useSelector(
    (state: RootState) => ({
      loading: state.rooms.rooms[state.rooms.activeRoomJID]?.isLoading || false,
      globalLoading: state.rooms.isLoading,
      config: state.chatSettingStore.config,
      roomsList: state.rooms.rooms,
      editAction: state.rooms.editAction,
    })
  );
  const { sendMessage: sendMs, sendMedia: sendMessageMedia} = useSendMessage();
  
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [isChecked, setIsChecked] = useState<boolean>(false);

  const isUser = activeMessage.user.id === user.walletAddress;

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

  const createMainMessageForThread = (message): string => {
    const data = {
      text: message.body,
      id: message.id,
      userName: activeMessage.user.name,
      createdAt: message.date,
      imageLocation: message.location,
      imagePreview: message.locationPreview,
      mimeType: message.mimetype,
      size: '',
      duration: '',
      waveForm: '',
      attachmentId: '',
      wrappable: '',
      nftActionType: '',
      contractAddress: '',
      roomJid: activeMessage.roomJid,
      nftId: '',
    };
    return JSON.stringify(data);
  };

  const sendMessage = (message: string) => {
    sendMs(
      message,
      activeMessage.roomJid,
      true,
      isChecked,
      createMainMessageForThread(activeMessage)
    );
  }

  const sendMedia = (data: any, type: string) => {
    sendMessageMedia(
      data,
      type,
      activeMessage.roomJid,
      true,
      true,
      createMainMessageForThread(activeMessage),
    );
  }

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
      <SendInput
        editMessage={editAction.text}
        sendMedia={sendMedia}
        sendMessage={sendMessage}
        config={config}
        onFocus={sendStartComposing}
        onBlur={sendEndComposing}
        isLoading={loading}
      />
    </ChatContainer>
  );
};

export default ThreadWrapper;
