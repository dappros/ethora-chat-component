import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  MessagesScroll,
  MessagesList,
  ScrollToBottomButton,
} from '../styled/StyledComponents';
import { IConfig, IMessage, User } from '../../types/types';
import Loader from '../styled/Loader';
import Composing from '../styled/StyledInputComponents/Composing';
import CustomTypingIndicator from '../styled/StyledInputComponents/CustomTypingIndicator';
import TreadLabel from '../styled/TreadLabel';
import { MessageContainer } from './MessageContainer';
import { useRoomState } from '../../hooks/useRoomState';
import { useChatSettingState } from '../../hooks/useChatSettingState';
import { DownArrowIcon } from '../../assets/icons';
import NewMessageLabel from '../styled/NewMessageLabel';

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
  const { composing, messages, composingList } = useRoomState(roomJID).room;
  const { user } = useChatSettingState();
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [newMessagesCount, setNewMessagesCount] = useState(0);
  const lastMessageCount = useRef(messages.length);
  const lastUserMessageId = useRef<string | null>(null);
  const scrollPositions = useRef<{ [key: string]: number }>({});
  const isInitialized = useRef<boolean>(false);

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
    () =>
      messages.length &&
      messages[messages.length - 1].user.id === user.xmppUsername,
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
  const isUserScrolledUp = useRef<boolean>(false);
  const lastComposingState = useRef<boolean>(false);

  const scrollToBottom = useCallback(() => {
    const content = containerRef.current;
    if (content) {
      content.scrollTop = content.scrollHeight;
    }
  }, []);

  const isAtBottom = useCallback(() => {
    const content = containerRef.current;
    if (!content) return false;
    
    const scrollTop = content.scrollTop;
    const scrollHeight = content.scrollHeight;
    const clientHeight = content.clientHeight;
    const distanceFromBottom = scrollHeight - clientHeight - scrollTop;
    
    return distanceFromBottom <= 10;
  }, []);

  const initializeScrollPosition = useCallback(() => {
    if (isInitialized.current) return;

    const content = containerRef.current;
    if (!content) return;

    const scrollToBottom = () => {
      content.scrollTop = content.scrollHeight;
    };

    scrollToBottom();
    
    setTimeout(scrollToBottom, 50);
    setTimeout(scrollToBottom, 100);
    setTimeout(scrollToBottom, 200);
    
    setTimeout(() => {
      if (content) {
        const scrollTop = content.scrollTop;
        const scrollHeight = content.scrollHeight;
        const clientHeight = content.clientHeight;
        const distanceFromBottom = scrollHeight - clientHeight - scrollTop;
        
        if (distanceFromBottom > 5) {
          content.scrollTop = content.scrollHeight;
        }
      }
      isInitialized.current = true;
    }, 300);
  }, []);

  useEffect(() => {
    isInitialized.current = false;
    
    const content = containerRef.current;
    if (content && roomJID) {
      scrollPositions.current[roomJID] = content.scrollTop;
    }
  }, [roomJID]);

  useEffect(() => {
    if (memoizedMessages.length > 0 && !isInitialized.current) {
      initializeScrollPosition();
    }
  }, [memoizedMessages.length, initializeScrollPosition]);

  useEffect(() => {
    if (memoizedMessages.length > 0 && !isInitialized.current) {
      requestAnimationFrame(() => {
        setTimeout(() => {
          initializeScrollPosition();
        }, 100);
      });
    }
  }, [memoizedMessages, initializeScrollPosition]);

  const checkIfLoadMoreMessages = useCallback(() => {
    const content = containerRef.current;
    if (!content || isLoadingMore.current) return;

    const scrollTop = content.scrollTop;
    if (scrollTop >= 150) return;

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
      }
    );
  }, [loadMoreMessages, memoizedMessages]);

  const handleScrollToBottom = useCallback(() => {
    scrollToBottom();
    setShowScrollButton(false);
    setNewMessagesCount(0);
  }, [scrollToBottom]);

  const checkScrollPosition = useCallback(() => {
    const content = containerRef.current;
    if (!content) return;

    const scrollTop = content.scrollTop;
    const scrollHeight = content.scrollHeight;
    const clientHeight = content.clientHeight;
    const distanceFromBottom = scrollHeight - clientHeight - scrollTop;

    const shouldShowButton = distanceFromBottom > 100;
    setShowScrollButton(shouldShowButton);

    checkIfLoadMoreMessages();
  }, [checkIfLoadMoreMessages]);

  const onScroll = useCallback(() => {
    window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(checkScrollPosition, 50);
  }, [checkScrollPosition]);

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
    const hasNewMessages = memoizedMessages.length > lastMessageCount.current;
    
    if (hasNewMessages && isInitialized.current) {
      const content = containerRef.current;
      if (content) {
        const scrollTop = content.scrollTop;
        const scrollHeight = content.scrollHeight;
        const clientHeight = content.clientHeight;
        const distanceFromBottom = scrollHeight - clientHeight - scrollTop;
        
        if (distanceFromBottom <= 100) {
          scrollToBottom();
          setShowScrollButton(false);
          setNewMessagesCount(0);
        } else {
          setShowScrollButton(true);
          setNewMessagesCount(prev => prev + 1);
        }
      }
      
      lastMessageCount.current = memoizedMessages.length;
    }
  }, [memoizedMessages.length, scrollToBottom]);

  useEffect(() => {
    if (messages.length > 0 && isInitialized.current) {
      const lastMessage = messages[messages.length - 1];
      const isLastMessageFromUser = lastMessage && lastMessage.user.id === user.xmppUsername;

      if (
        lastMessage &&
        lastMessage.id !== lastUserMessageId.current &&
        isLastMessageFromUser
      ) {
        lastUserMessageId.current = lastMessage.id;
          scrollToBottom();
        setShowScrollButton(false);
        setNewMessagesCount(0);
      }
    }
  }, [messages, user.xmppUsername, scrollToBottom]);

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

          if (message.id === 'delimiter-new') {
            return (
              <div
                key={message.id}
                data-message-id="delimiter-new"
                className="message-container"
              >
                <NewMessageLabel color={config?.colors?.primary} />
              </div>
            );
          }

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
              data-message-id={message.id}
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
        {/* Custom Typing Indicator */}
        {config?.customTypingIndicator?.enabled && composing && (
          <CustomTypingIndicator
            usersTyping={composingList || ['User']}
            text={config.customTypingIndicator.text}
            position={config.customTypingIndicator.position || 'bottom'}
            styles={config.customTypingIndicator.styles}
            customComponent={config.customTypingIndicator.customComponent}
            isVisible={composing}
          />
        )}

        {/* Default Typing Indicator (fallback) */}
        {!config?.customTypingIndicator?.enabled &&
          config?.disableHeader &&
          composing && <Composing usersTyping={composingList || ['User']} />}
      </MessagesScroll>
      {showScrollButton && (
        <ScrollToBottomButton
          onClick={handleScrollToBottom}
          color={config?.colors?.primary}
        >
          <DownArrowIcon color={config?.colors?.secondary || 'white'} />
          {newMessagesCount > 0 && (
            <span className="count">{newMessagesCount}</span>
          )}
        </ScrollToBottomButton>
      )}
    </MessagesList>
  );
};

export default MessageList;
