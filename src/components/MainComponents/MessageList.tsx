import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MessagesScroll, MessagesList, ScrollToBottomButton } from '../styled/StyledComponents';
import { IConfig, IMessage, User } from '../../types/types';
import Loader from '../styled/Loader';
import Composing from '../styled/StyledInputComponents/Composing';
import TreadLabel from '../styled/TreadLabel';
import { MessageContainer } from './MessageContainer';
import { useRoomState } from '../../hooks/useRoomState';
import { VirtualizedList } from './VirtualList';
import { useChatSettingState } from '../../hooks/useChatSettingState';
import { DownArrowIcon } from '../../assets/icons';

interface MessageListProps<TMessage extends IMessage> {
  CustomMessage?: React.ComponentType<{
    message: IMessage;
    isUser: boolean;
    isReply: boolean;
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
  isReply: boolean;
  activeMessage?: IMessage;
}

const MessageList = <TMessage extends IMessage>({
  CustomMessage,
  loadMoreMessages,
  roomJID,
  config,
  loading,
  isReply,
  activeMessage,
}: MessageListProps<TMessage>) => {
  const { composing, messages } = useRoomState(roomJID).room;
  const { user } = useChatSettingState();
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [newMessagesCount, setNewMessagesCount] = useState(0);
  const lastMessageCount = useRef(messages.length);
  const lastUserMessageId = useRef<string | null>(null);
  const lastComposingRef = useRef<boolean>(false);

  console.log(user);
  console.log(messages);

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
          item.roomJid === roomJID &&
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

  const isUserMessage = useMemo(
    () => messages.length && messages[messages.length - 1].user.id === user.xmppUsername,
    [messages.length, user.xmppUsername]
  );

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

    if (params.top >= 150 || isLoadingMore.current) return;

    scrollParams.current = getScrollParams();

    const [firstMessage, secondMessage] = memoizedMessages;
    const firstMessageId =
      firstMessage?.id === 'delimiter-new'
        ? secondMessage?.id
        : firstMessage?.id;

    if (!firstMessageId) return;

    isLoadingMore.current = true;

    loadMoreMessages(firstMessage.roomJid, 30, Number(firstMessageId)).finally(
      () => {
        isLoadingMore.current = false;
        lastMessageRef.current = memoizedMessages[memoizedMessages.length - 1];
        restoreScrollPosition();
      }
    );
  }, [loadMoreMessages, memoizedMessages.length]);

  const checkAtBottom = () => {
    const content = containerRef.current;
    if (content) {
      const isAtBottom = content.scrollHeight - content.clientHeight <= content.scrollTop + 100;
      atBottom.current = isAtBottom;

      const scrolledUp = content.scrollHeight - content.clientHeight - content.scrollTop > 150;

      if (scrolledUp) {
        setShowScrollButton(true);
      } else if (isAtBottom) {
        setShowScrollButton(false);
        setNewMessagesCount(0);
      }

      if (!isAtBottom && messages.length > lastMessageCount.current) {
        setNewMessagesCount(prev => prev + (messages.length - lastMessageCount.current));
      }

      lastMessageCount.current = messages.length;
      checkIfLoadMoreMessages();
    }
  };

  const scrollToBottom = useCallback((): void => {
    const content = containerRef.current;
    if (content) {
      content.scrollTo({
        top: content.scrollHeight,
        behavior: 'smooth'
      });
      setShowScrollButton(false);
      setNewMessagesCount(0);
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

  useEffect(() => {
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      const isLastMessageFromUser = lastMessage && isUserMessage;

      if (lastMessage && lastMessage.id !== lastUserMessageId.current && isLastMessageFromUser) {
        console.log('isUserMessage 2', isUserMessage);

        lastUserMessageId.current = lastMessage.id;
        scrollToBottom();
      }
    }
  }, [messages, isUserMessage, scrollToBottom]);

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
              isUser={isUserMessage}
              isReply={isReply}
            />
            <TreadLabel
              reply={memoizedMessages.length}
              colors={config?.colors}
            />
          </React.Fragment>
        )}
        {memoizedMessages.map((message) => {
          const messageDate = new Date(message.date).toDateString();
          const showDateLabel = messageDate !== lastDateLabel;
          lastDateLabel = messageDate;
          return (
            <MessageContainer
              key={message.id}
              CustomMessage={CustomMessage}
              message={message}
              activeMessage={activeMessage}
              config={config}
              xmppUsername={user.xmppUsername}
              isReply={isReply}
              showDateLabel={showDateLabel}
            />
          );
        })}
        {/* <VirtualizedList
          data={memoizedMessages}
          renderItem={(message) => {
            const messageDate = new Date(message.date).toDateString();
            const showDateLabel = messageDate !== lastDateLabel;
            lastDateLabel = messageDate;
            return (
              <MessageContainer
                key={message.id}
                CustomMessage={CustomMessage}
                message={message}
                activeMessage={activeMessage}
                config={config}
                walletAddress={user.walletAddress}
                isReply={isReply}
                showDateLabel={showDateLabel}
              />
            );
          }}
          itemHeight={100}
          containerHeight={containerRef.current.clientHeight}
        /> */}
        {config?.disableHeader && composing && (
          <Composing usersTyping={['User']} />
        )}
      </MessagesScroll>
      {showScrollButton && (
        <ScrollToBottomButton
          onClick={scrollToBottom}
          color={config?.colors?.primary}
        >
          <DownArrowIcon />
          {newMessagesCount > 0 && (
            <span className="count">{newMessagesCount}</span>
          )}
        </ScrollToBottomButton>
      )}
    </MessagesList>
  );
};

export default MessageList;
