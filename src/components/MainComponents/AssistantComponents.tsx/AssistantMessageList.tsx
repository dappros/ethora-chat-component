import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  MessagesScroll,
  MessagesList,
  ScrollToBottomButton,
} from '../../styled/StyledComponents';
import { AsisstantUserType, IConfig, IMessage } from '../../../types/types';
import { DownArrowIcon } from '../../../assets/icons';
import NewMessageLabel from '../../styled/NewMessageLabel';
import { MessageContainer } from '../MessageContainer';
// Redux imports
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../../roomStore';
import { addRoomMessage } from '../../../roomStore/assistantMessageSlice';
import NoMessagesPlaceholder from '../NoMessagesPlaceholder';

interface AssistantMessageListProps<TMessage extends IMessage> {
  CustomMessage?: React.ComponentType<{
    message: IMessage;
    isUser: boolean;
    isReply: boolean;
  }>;
  user: AsisstantUserType;
  roomJID: string;
  config?: IConfig;
  isReply: boolean;
  activeMessage?: IMessage;
}

const AssistantMessageList = <TMessage extends IMessage>({
  CustomMessage,
  roomJID,
  config,
  isReply,
  activeMessage,
  user,
}: AssistantMessageListProps<TMessage>) => {
  const assistantState = useSelector(
    (state: RootState) => state.assistantMessageSlicePersistConfig
  );
  const messages = assistantState.messages[roomJID] || [];
  const isComposing = assistantState.composing?.[roomJID];

  const [showScrollButton, setShowScrollButton] = useState(false);
  const [newMessagesCount, setNewMessagesCount] = useState(0);
  const [lastMessageDate, setLastMessageDate] = useState<number | null>(null);
  const lastMessageCount = useRef(messages.length);
  const lastUserMessageId = useRef<string | null>(null);
  const scrollPositions = useRef<{ [key: string]: number }>({});
  const isFirstLoad = useRef<boolean>(true);

  const isUserMessage = useMemo(
    () =>
      messages.length &&
      messages[messages.length - 1].user.xmppUsername === user.xmppUsername,
    [messages.length, user.xmppUsername, messages]
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const outerRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<number>(0);
  const atBottom = useRef<boolean>(true);

  const waitForImagesLoaded = useCallback(() => {
    const content = containerRef.current;
    if (!content) return Promise.resolve();

    const images = content.getElementsByTagName('img');
    if (images.length === 0) return Promise.resolve();

    const promises = Array.from(images).map((img) => {
      if (img.complete) return Promise.resolve();
      return new Promise((resolve) => {
        img.onload = resolve;
        img.onerror = resolve;
      });
    });

    return Promise.all(promises);
  }, []);

  const restoreScrollPosition = useCallback(async () => {
    const content = containerRef.current;
    if (!content) return;

    await waitForImagesLoaded();

    if (isFirstLoad.current) {
      const delimiterIndex = messages.findIndex(
        (msg) => msg.id === 'delimiter-new'
      );

      if (delimiterIndex !== -1) {
        setTimeout(() => {
          const allMessages = content.querySelectorAll('[data-message-id]');
          const delimiterElement = Array.from(allMessages).find(
            (el) => el.getAttribute('data-message-id') === 'delimiter-new'
          );

          if (delimiterElement) {
            delimiterElement.scrollIntoView({
              behavior: 'auto',
              block: 'center',
            });
          } else {
            content.scrollTop = content.scrollHeight;
          }
        }, 100);
      } else {
        content.scrollTop = content.scrollHeight;
      }
      isFirstLoad.current = false;
    } else {
      const savedPosition = scrollPositions.current[roomJID];
      if (savedPosition !== undefined) {
        content.scrollTop = savedPosition;
      } else {
        content.scrollTop = content.scrollHeight;
      }
    }
  }, [roomJID, messages, waitForImagesLoaded]);

  useEffect(() => {
    if (messages.length > 0) {
      setLastMessageDate(
        new Date(messages[messages.length - 1].date).getTime()
      );
    }
  }, [messages]);

  useEffect(() => {
    if (isUserMessage) return;

    const newMessageDate = new Date(
      messages[messages.length - 1]?.date
    )?.getTime();
    if (newMessageDate > lastMessageDate) {
      setNewMessagesCount((prev) => (prev += 1));
    }
  }, [messages.length, messages, isUserMessage, lastMessageDate]);

  useEffect(() => {
    restoreScrollPosition();
  }, [roomJID, restoreScrollPosition]);

  const scrollToBottom = useCallback((): void => {
    const content = containerRef.current;
    if (content) {
      content.scrollTo({
        top: content.scrollHeight,
        behavior: 'smooth',
      });
      setShowScrollButton(false);
      setNewMessagesCount(0);
    }
  }, []);

  const checkAtBottom = () => {
    const content = containerRef.current;
    if (content) {
      const isAtBottom =
        content.scrollHeight - content.clientHeight <= content.scrollTop + 120;
      atBottom.current = isAtBottom;

      const scrolledUp =
        content.scrollHeight - content.clientHeight - content.scrollTop > 150;

      if (scrolledUp) {
        setShowScrollButton(true);
      } else if (isAtBottom) {
        scrollToBottom();
        setShowScrollButton(false);
        setNewMessagesCount(0);
      }

      lastMessageCount.current = messages.length;
    } else {
      timeoutRef.current = null;
    }
  };

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
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      const isLastMessageFromUser = lastMessage && isUserMessage;

      if (
        lastMessage &&
        lastMessage.id !== lastUserMessageId.current &&
        isLastMessageFromUser
      ) {
        lastUserMessageId.current = lastMessage.id;
        scrollToBottom();
      }
    }
  }, [messages, isUserMessage, scrollToBottom]);

  useEffect(() => {
    const shouldAutoScroll = config?.botMessageAutoScroll;
    const content = containerRef.current;
    if (!shouldAutoScroll || !content) return;

    waitForImagesLoaded().then(() => {
      setTimeout(() => {
        scrollToBottom();
        setShowScrollButton(false);
      }, 50);
    });
  }, [
    messages.length,
    config?.botMessageAutoScroll,
    waitForImagesLoaded,
    scrollToBottom,
  ]);

  let lastDateLabel: string | null = null;

  return (
    <MessagesList ref={outerRef}>
      <MessagesScroll
        ref={containerRef}
        onScroll={onScroll}
        color={config?.colors?.primary}
      >
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', color: 'red', padding: '16px' }}>
            <NoMessagesPlaceholder />
          </div>
        )}
        {messages.map((message) => {
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
        {isComposing && (
          <div
            className="message-container"
            style={{ textAlign: 'center', padding: '8px' }}
          >
            <span>Assistant is typing...</span>
          </div>
        )}
      </MessagesScroll>
      {showScrollButton && (
        <ScrollToBottomButton
          onClick={scrollToBottom}
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

export default AssistantMessageList;
