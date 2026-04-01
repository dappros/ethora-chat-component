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
import { useCustomComponents } from '../../context/CustomComponentsContext';
import { DecoratedMessage } from '../../types/models/customComponents.model';

const getMainMessageId = (mainMessage?: string): string | null => {
  if (!mainMessage) {
    return null;
  }

  try {
    const parsedMessage = JSON.parse(mainMessage);
    return parsedMessage?.id ?? null;
  } catch (error) {
    console.warn('[MessageList] Failed to parse mainMessage payload', error);
    return null;
  }
};

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
  const { CustomScrollableArea, CustomNewMessageLabel } = useCustomComponents();
  const { composing, messages, composingList } = useRoomState(roomJID).room;
  const { user } = useChatSettingState();
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [newMessagesCount, setNewMessagesCount] = useState(0);
  const lastMessageCount = useRef(messages.length);
  const lastUserMessageId = useRef<string | null>(null);
  const isFirstLoad = useRef<boolean>(true);
  const lastSeenMessageDateRef = useRef<number>(0);

  const repliesByMainMessageId = useMemo(() => {
    const replyMap = new Map<string, IMessage[]>();

    messages.forEach((message) => {
      const mainMessageId = getMainMessageId(message.mainMessage);

      if (!mainMessageId) {
        return;
      }

      const replies = replyMap.get(mainMessageId) || [];
      replies.push(message);
      replyMap.set(mainMessageId, replies);
    });

    return replyMap;
  }, [messages]);

  const addReplyMessages = useMemo(() => {
    return messages.map((message) => ({
      ...message,
      reply: repliesByMainMessageId.get(message.id) || [],
    }));
  }, [messages, repliesByMainMessageId]);

  const memoizedMessages = useMemo(() => {
    if (isReply) {
      return addReplyMessages.filter(
        (item: IMessage) =>
          item.roomJid === roomJID &&
          item.isReply &&
          item.isReply === 'true' &&
          item.mainMessage &&
          getMainMessageId(item.mainMessage) === activeMessage?.id
      );
    } else {
      return addReplyMessages.filter(
        (item: IMessage) =>
          item.isSystemMessage === 'true' ||
          item.showInChannel === 'true' ||
          ((!item.isReply || item.isReply === 'false') && !item.mainMessage)
        );
    }
  }, [activeMessage?.id, addReplyMessages, isReply, roomJID]);

  const isUserMessage = useMemo(
    () =>
      memoizedMessages.length > 0 &&
      memoizedMessages[memoizedMessages.length - 1].user.id === user.xmppUsername,
    [memoizedMessages, user.xmppUsername]
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const isLoadingMore = useRef<boolean>(false);

  const timeoutRef = useRef<number | undefined>(undefined);
  const scrollParams = useRef<{ top: number; height: number } | null>(null);
  const atBottom = useRef<boolean>(true);
  const isUserScrolledUp = useRef<boolean>(false);
  const lastComposingState = useRef<boolean>(false);

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

  const waitForImagesLoaded = useCallback((): Promise<void> => {
    const content = containerRef.current;
    if (!content) return Promise.resolve();

    const images = content.getElementsByTagName('img');
    if (images.length === 0) return Promise.resolve();

    const promises = Array.from(images).map((img) => {
      if (img.complete) return Promise.resolve();
      return new Promise((resolve) => {
        const handleComplete = () => resolve(undefined);
        img.addEventListener('load', handleComplete, { once: true });
        img.addEventListener('error', handleComplete, { once: true });
      });
    });

    return Promise.all(promises).then(() => {});
  }, []);

  const restoreScrollPosition = useCallback(async () => {
    const content = containerRef.current;
    if (!content) return;

    await waitForImagesLoaded();

    if (isFirstLoad.current) {
      const delimiterIndex = memoizedMessages.findIndex(
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
      content.scrollTop = content.scrollHeight;
    }
  }, [roomJID, memoizedMessages, waitForImagesLoaded]);

  useEffect(() => {
    const lastMessage = memoizedMessages[memoizedMessages.length - 1];
    if (!lastMessage) {
      return;
    }

    const newMessageDate = new Date(lastMessage.date).getTime();
    if (!Number.isFinite(newMessageDate)) {
      return;
    }

    if (
      lastSeenMessageDateRef.current !== 0 &&
      !isUserMessage &&
      newMessageDate > lastSeenMessageDateRef.current
    ) {
      setNewMessagesCount((prev) => prev + 1);
    }

    lastSeenMessageDateRef.current = newMessageDate;
  }, [isUserMessage, memoizedMessages]);

  useEffect(() => {
    void restoreScrollPosition();
  }, [restoreScrollPosition]);

  const checkIfLoadMoreMessages = useCallback(() => {
    const params = getScrollParams();

    if (!params) return;

    if (params.top >= 150 || isLoadingMore.current) return;

    scrollParams.current = getScrollParams();

    const [firstMessage, secondMessage] = memoizedMessages;
    const targetMessage =
      firstMessage?.id === 'delimiter-new'
        ? secondMessage
        : firstMessage;
    const firstMessageId = targetMessage?.id;

    if (!firstMessageId) return;

    isLoadingMore.current = true;

    loadMoreMessages(targetMessage.roomJid, 30, Number(firstMessageId)).finally(
      () => {
        isLoadingMore.current = false;
      }
    );
  }, [loadMoreMessages, memoizedMessages]);

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

  const checkAtBottom = useCallback(() => {
    const content = containerRef.current;
    if (content) {
      const scrollTop = content.scrollTop;
      const scrollHeight = content.scrollHeight;
      const clientHeight = content.clientHeight;
      const distanceFromBottom = scrollHeight - clientHeight - scrollTop;

      const isNearBottom = distanceFromBottom <= 150;
      const isAtBottom = distanceFromBottom <= 5;

      atBottom.current = isAtBottom;
      isUserScrolledUp.current = !isNearBottom;

      const scrolledUp = distanceFromBottom > 150;

      if (scrolledUp) {
        setShowScrollButton(true);
      } else if (isAtBottom) {
        scrollToBottom();
        setShowScrollButton(false);
        setNewMessagesCount(0);
      }

      lastMessageCount.current = messages.length;
      checkIfLoadMoreMessages();
    } else {
      timeoutRef.current = undefined;
    }
  }, [checkIfLoadMoreMessages, messages.length, scrollToBottom]);

  const onScroll = useCallback(() => {
    if (typeof window !== "undefined") {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = window.setTimeout(() => {
        checkAtBottom();
      }, 50);
    }
  }, [checkAtBottom]);

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined') {
        window.clearTimeout(timeoutRef.current);
      }
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

      if (
        lastMessage &&
        lastMessage.id !== lastUserMessageId.current &&
        isLastMessageFromUser
      ) {
        lastUserMessageId.current = lastMessage.id;
        scrollToBottom();
      }
    }
  }, [messages, isUserMessage]);

  useEffect(() => {
    const content = containerRef.current;
    if (!content) return;

    const hasNewMessages = memoizedMessages.length > lastMessageCount.current;
    const isTypingStarted =
      composingList?.length > 0 && !lastComposingState.current;
    lastComposingState.current = composingList?.length > 0;

    if (!isUserScrolledUp.current) {
      if (hasNewMessages || isTypingStarted) {
        waitForImagesLoaded().then(() => {
          scrollToBottom();
          setShowScrollButton(false);
          setNewMessagesCount(0);
        });
      }
    }

  }, [
    memoizedMessages.length,
    composingList,
    scrollToBottom,
    waitForImagesLoaded,
  ]);

  const decoratedMessages = useMemo<DecoratedMessage[]>(() => {
    let lastDateLabel: string | null = null;
    return memoizedMessages.map((message) => {
      const messageDate = new Date(message.date).toDateString();
      const showDateLabel = messageDate !== lastDateLabel;
      lastDateLabel = messageDate;

      return { message, showDateLabel };
    });
  }, [memoizedMessages]);

  const renderDecoratedMessage = useCallback(
    (decorated: DecoratedMessage) => {
      const { message, showDateLabel } = decorated;

      if (message.id === 'delimiter-new') {
        return (
          <div
            key={message.id}
            data-message-id="delimiter-new"
            className="message-container"
          >
            {CustomNewMessageLabel ? (
              <CustomNewMessageLabel color={config?.colors?.primary} />
            ) : (
              <NewMessageLabel color={config?.colors?.primary} />
            )}
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
    },
    [
      CustomMessage,
      activeMessage,
      config,
      isReply,
      user.xmppUsername,
      CustomNewMessageLabel,
    ]
  );

  const typingIndicatorNode = config?.customTypingIndicator?.enabled ? (
    composing && (
      <CustomTypingIndicator
        usersTyping={composingList || ['User']}
        text={config.customTypingIndicator.text}
        position={config.customTypingIndicator.position || 'bottom'}
        styles={config.customTypingIndicator.styles}
        customComponent={config.customTypingIndicator.customComponent}
        isVisible={composing}
      />
    )
  ) : config?.disableHeader && composing ? (
    <Composing usersTyping={composingList || ['User']} />
  ) : null;

  const resetNewMessageCounter = useCallback(() => {
    setShowScrollButton(false);
    setNewMessagesCount(0);
  }, []);

  if (CustomScrollableArea) {
    return (
      <CustomScrollableArea
        roomJID={roomJID}
        messages={memoizedMessages}
        decoratedMessages={decoratedMessages}
        isLoading={loading}
        isReply={isReply}
        activeMessage={activeMessage}
        loadMoreMessages={loadMoreMessages}
        renderMessage={renderDecoratedMessage}
        scrollController={{
          scrollToBottom,
          waitForImagesLoaded,
          showScrollButton,
          newMessagesCount,
          resetNewMessageCounter,
        }}
        typingIndicator={typingIndicatorNode}
        config={config}
      />
    );
  }

  return (
    <MessagesList>
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
        {decoratedMessages.map((decorated) =>
          renderDecoratedMessage(decorated)
        )}
        {typingIndicatorNode}
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

export default MessageList;
