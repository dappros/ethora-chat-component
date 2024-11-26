import { FC, useCallback, useState } from 'react';
import { IMessage } from '../../types/types';
import { ChatContainer } from '../styled/StyledComponents';
import { Message } from '../MessageBubble/Message';
import SendInput from '../styled/SendInput';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../roomStore';
import { User } from '../../../lib/src/types/types';
import { useXmppClient } from '../../context/xmppProvider';
import { uploadFile } from '../../networking/api-requests/auth.api';
import MessageList from '../MainComponents/MessageList';
import ModalHeaderComponent from '../Modals/ModalHeaderComponent';
import { setCloseActiveMessage } from '../../roomStore/roomsSlice';

interface ThreadWrapperProps {
  activeMessage: IMessage;
  user: User;
  customMessageComponent?: React.ComponentType<{ message: IMessage; isUser: boolean }>;
}

const ThreadWrapper: FC<ThreadWrapperProps> = ({
  activeMessage,
  user,
  customMessageComponent: CustomMessageComponent
}) => {
  const { client } = useXmppClient();
  const dispatch = useDispatch();
  const { config, loading } =
  useSelector((state: RootState) => ({
    loading:
      state.rooms.rooms[state.rooms.activeRoomJID]?.isLoading || false,
    globalLoading: state.rooms.isLoading,
    config: state.chatSettingStore.config,
  }));

  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);

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
      size: "",
      duration: "",
      waveForm: "",
      attachmentId: "",
      wrappable: "",
      nftActionType: "",
      contractAddress: "",
      roomJid: activeMessage.roomJID,
      nftId: "",
    };
    return JSON.stringify(data);
  };

  const sendMessage = useCallback(
    (message: string) => {
      client?.sendMessage(
        activeMessage.roomJID,
        user.firstName,
        user.lastName,
        '',
        user.walletAddress,
        message,
        '',
        true,
        createMainMessageForThread(activeMessage),
      );
    },
    [activeMessage.roomJID]
  );

  const sendMedia = useCallback(
    async (data: any, type: string) => {
      let mediaData: FormData | null = new FormData();
      mediaData.append('files', data);

      uploadFile(mediaData)
        .then((response) => {
          response.data.results.map(async (item: any) => {
            const data = {
              firstName: user.firstName,
              lastName: user.lastName,
              walletAddress: user.walletAddress,
              createdAt: item.createdAt,
              expiresAt: item.expiresAt,
              fileName: item.filename,
              isVisible: item?.isVisible,
              location: item.location,
              locationPreview: item.locationPreview,
              mimetype: item.mimetype,
              originalName: item?.originalname,
              ownerKey: item?.ownerKey,
              size: item.size,
              duration: item?.duration,
              updatedAt: item?.updatedAt,
              userId: item?.userId,
              attachmentId: item?._id,
              wrappable: true,
              roomJid: activeMessage.roomJID,
              isPrivate: item?.isPrivate,
              isReply: true,
              mainMessage: createMainMessageForThread(activeMessage),
              __v: item.__v,
            };
            client?.sendMediaMessageStanza(activeMessage.roomJID, data);
          });
        })
        .catch((error) => {
          console.error('Upload failed', error);
        });
    },
    [client, activeMessage.roomJID]
  );

  const sendStartComposing = useCallback(() => {
    client.sendTypingRequestStanza(
      activeMessage.roomJID,
      `${user.firstName} ${user.lastName}`,
      true
    );
  }, []);

  const sendEndComposing = useCallback(() => {
    client.sendTypingRequestStanza(
      activeMessage.roomJID,
      `${user.firstName} ${user.lastName}`,
      false
    );
  }, []);

  const closeThread = () => {
    dispatch(setCloseActiveMessage({ chatJID: activeMessage.roomJID}));
  };

  return (
    <ChatContainer
      style={{
        height: "100%",
        justifyContent: "space-between",
        overflow: "auto"
      }}>
      <div>
        <ModalHeaderComponent headerTitle="Thread" handleCloseModal={closeThread}/>
        <div style={{ padding: "0 16px"}}>
          <Message message={activeMessage} isUser={isUser} />
        </div>
      </div>
      <MessageList
        loadMoreMessages={loadMoreMessages}
        CustomMessage={CustomMessageComponent}
        user={user}
        roomJID={activeMessage.roomJID}
        config={config}
        loading={isLoadingMore}
        activeMessage={activeMessage}
        isReply
      />
      <SendInput
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