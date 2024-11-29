import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Message,
  UserName,
  MessageText,
  MessageTimestamp,
  MessagesScroll,
  MessagesList,
} from '../styled/StyledComponents';
import { IConfig, IMessage, User } from '../../types/types';
import SystemMessage from './SystemMessage';
import DateLabel from '../styled/DateLabel';
import Loader from '../styled/Loader';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../roomStore';
import Composing from '../styled/StyledInputComponents/Composing';
import { validateMessages } from '../../helpers/validator';
import NewMessageLabel from '../styled/NewMessageLabel';
import TreadLabel from '../styled/TreadLabel';

interface MessageListProps<TMessage extends IMessage> {
  CustomMessage?: React.ComponentType<{
    message: IMessage;
    isUser: boolean;
    isReply?: boolean;
  }>;
  user: User;
  roomJID: string;
  loadMoreMessages: (
    chatJID: string,
    max: number,
    amount?: number
  ) => Promise<void>;
  loading: boolean;
  config?: IConfig;
  isReply?: boolean;
  activeMessage?: IMessage;
}
const MessageList = <TMessage extends IMessage>({
  CustomMessage,
  user,
  loadMoreMessages,
  roomJID,
  config,
  loading,
  isReply,
  activeMessage,
}: MessageListProps<TMessage>) => {
  const dispatch = useDispatch();

  const { composing, lastViewedTimestamp, messages } = useSelector(
    (state: RootState) => state.rooms.rooms[roomJID]
  );

  const addReplyMessages = useMemo(() => {
    return messages.map((message) => {
      const newMessage = {
        ...message,
        reply: messages.filter(
          (mess) =>
            !!mess.mainMessage && JSON.parse(mess.mainMessage).id === message.id
        ),
      };

      return newMessage;
    });
  }, [messages, messages.length]);

  const isUserActiveMessage = useMemo(
    () => activeMessage && activeMessage.user.id === user.walletAddress,
    [activeMessage, user.walletAddress]
  );

  const memoizedMessages = useMemo(() => {
    if (isReply) {
      return addReplyMessages.filter(
        (item: IMessage) =>
          item.roomJid.includes(roomJID) &&
          item.isReply &&
          item.isReply === 'true' &&
          item.mainMessage &&
          JSON.parse(item.mainMessage).id === activeMessage.id
      );
    } else {
      return addReplyMessages.filter(
        (item: IMessage) =>
          item.showInChannel === 'true' ||
          ((!item.isReply || item.isReply === 'false') && !item.mainMessage)
      );
    }
  }, [messages, messages.length]);

  const containerRef = useRef<HTMLDivElement>(null);
  const outerRef = useRef<HTMLDivElement>(null);
  const lastMessageRef = useRef<IMessage>(
    memoizedMessages[memoizedMessages.length - 1]
  );
  const isLoadingMore = useRef<boolean>(false);

  const timeoutRef = useRef<number>(0);
  const scrollParams = useRef<{ top: number; height: number } | null>(null);
  const atBottom = useRef<boolean>(true);

  const getScrollParams = (): { top: number; height: number } | null => {
    const content = containerRef.current;
    if (!content) {
      return null;
    }
    return {
      top: content.scrollTop,
      height: content.scrollHeight,
    };
  };

  const restoreScrollPosition = () => {
    const content = containerRef.current;
    if (content && scrollParams.current) {
      const { top, height } = scrollParams.current;
      const newHeight = content.scrollHeight;
      const scrollTop = top + (newHeight - height);
      content.scrollTop = scrollTop;
    }
  };

  const checkIfLoadMoreMessages = useCallback(() => {
    const params = getScrollParams();
    if (!params) return;

    if (params.top < 150 && !isLoadingMore.current) {
      scrollParams.current = getScrollParams();
      const firstMessage = memoizedMessages[0];
      if (firstMessage?.user?.id) {
        isLoadingMore.current = true;

        loadMoreMessages(
          memoizedMessages[0].roomJid,
          30,
          Number(memoizedMessages[0].id)
        ).finally(() => {
          isLoadingMore.current = false;
          lastMessageRef.current =
            memoizedMessages[memoizedMessages.length - 1];
          restoreScrollPosition();
        });
      }
    }
  }, [loadMoreMessages, memoizedMessages.length]);

  const checkAtBottom = () => {
    const content = containerRef.current;
    if (content) {
      atBottom.current =
        content.scrollHeight - content.clientHeight <= content.scrollTop + 10;
      checkIfLoadMoreMessages();
    }
  };

  const scrollToBottom = useCallback((): void => {
    const content = containerRef.current;
    if (content) {
      content.scrollTop = content.scrollHeight;
    }
  }, []);

  const onScroll = () => {
    window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => {
      checkAtBottom();
    }, 50);
  };

  useEffect(() => {
    const messagesOuter = outerRef.current;
    if (messagesOuter) {
      messagesOuter.addEventListener('scroll', onScroll, true);
    }

    return () => {
      messagesOuter &&
        messagesOuter.removeEventListener('scroll', onScroll, true);
    };
  }, []);

  useEffect(() => {
    if (atBottom.current) {
      scrollToBottom();
    }
  }, [memoizedMessages.length]);

  useEffect(() => {
    if (memoizedMessages.length > 30) {
      const content = containerRef.current;
      if (content && scrollParams.current) {
        const newScrollTop =
          scrollParams.current.top +
          (content.scrollHeight - scrollParams.current.height);
        content.scrollTop = newScrollTop;
      }
      scrollParams.current = null;
    }
  }, [memoizedMessages.length, composing]);

  // if (!validateMessages(memoizedMessages)) {
  //   console.log("Invalid 'messages' props provided to MessageList.");
  //   return null;
  // }

  let lastDateLabel: string | null = null;

  return (
    <MessagesList ref={outerRef}>
      <MessagesScroll
        ref={containerRef}
        onScroll={onScroll}
        color={config?.colors?.primary}
      >
        {loading && <Loader color={config?.colors?.primary} />}
        {activeMessage && (
          <React.Fragment>
            <CustomMessage
              message={activeMessage}
              isUser={isUserActiveMessage}
            />
            <TreadLabel
              reply={memoizedMessages.length}
              colors={config?.colors}
            />
          </React.Fragment>
        )}
        {memoizedMessages.map((message) => {
          const isUser = message.user.id === user.walletAddress;
          const messageDate = new Date(message.date);
          const currentDateLabel = messageDate.toDateString();

          const showDateLabel = currentDateLabel !== lastDateLabel;
          if (showDateLabel) {
            lastDateLabel = currentDateLabel;
          }

          if (message.isSystemMessage === 'true') {
            return (
              <React.Fragment key={message.id}>
                {showDateLabel && (
                  <DateLabel date={messageDate} colors={config?.colors} />
                )}
                <SystemMessage
                  messageText={message.body}
                  colors={config?.colors}
                />
              </React.Fragment>
            );
          }

          // todo finish unread messages
          if (message.id === 'delimiter-new') {
            return <NewMessageLabel color={config?.colors?.primary} />;
          }

          const MessageComponent = CustomMessage || Message;

          return (
            <React.Fragment key={message.id}>
              {showDateLabel &&
                !activeMessage &&
                message.id !== 'delimiter-new' && (
                  <DateLabel date={messageDate} colors={config?.colors} />
                )}
              {!CustomMessage ? (
                <MessageComponent message={message} isUser={isUser}>
                  <MessageTimestamp>
                    {messageDate.toLocaleTimeString()}
                  </MessageTimestamp>
                  <UserName>{message.user.name}: </UserName>
                  <MessageText>{message.body}</MessageText>
                </MessageComponent>
              ) : (
                <MessageComponent
                  message={message}
                  isUser={isUser}
                  isReply={isReply}
                />
              )}
            </React.Fragment>
          );
        })}
        {config?.disableHeader && composing && (
          <Composing usersTyping={['User']} />
        )}
      </MessagesScroll>
    </MessagesList>
  );
};

export default MessageList;
