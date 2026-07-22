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
import { parseMessageReference } from '../../helpers/parseMessageReference';
import { useLoaderDebug } from '../../hooks/useLoaderDebug';

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
  useLoaderDebug('chat-room-load-more-loader', loading);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [newMessagesCount, setNewMessagesCount] = useState(0);
  const [lastMessageDate, setLastMessageDate] = useState<number | null>(null);
  const lastMessageCount = useRef(messages.length);
  const lastUserMessageId = useRef<string | null>(null);
  const scrollPositions = useRef<{ [key: string]: number }>({});
  const isFirstLoad = useRef<boolean>(true);

  const addReplyMessages = useMemo(() => {
    return messages.map((message) => {
      const newMessage = {
        ...message,
        reply: messages.filter(
          (mess) => parseMessageReference(mess.mainMessage)?.id === message.id
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
          parseMessageReference(item.mainMessage)?.id === activeMessage.id
      );
    } else {
      return addReplyMessages.filter(
        (item: IMessage) =>
          item.isSystemMessage === 'true' ||
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
  // The oldest message id we last KICKED OFF a load-more request for.
  // Guards against a busy-loop: a short conversation that never fills the
  // viewport keeps scrollTop permanently "near the top" (there's nothing
  // to scroll through), so every scroll tick re-satisfies
  // checkIfLoadMoreMessages' own top<150 condition. `isLoadingMore.current`
  // only blocks a request that's still in flight - it doesn't stop an
  // immediately-following one once that request resolves, even when
  // nothing about the room actually changed (parent's loadMoreMessages
  // no-ops once historyComplete is true, but a fresh promise still
  // resolves and re-arms this callback on the very next tick). Live-
  // observed on a real account: 245+ fetches in ~11s, ~340ms apart -
  // matching a real round trip each time, not a same-tick loop, so this
  // alone was never going to self-resolve. Skipping a repeat request for
  // the SAME oldest message id breaks the loop regardless of why the
  // server-side completion signal isn't sticking - a genuine page of
  // older history changes which message is oldest, so real pagination is
  // unaffected.
  const lastRequestedFirstMessageIdRef = useRef<string | null>(null);

  const timeoutRef = useRef<number>(0);
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
        img.onload = resolve;
        img.onerror = resolve;
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
      const savedPosition = scrollPositions.current[roomJID];
      if (savedPosition !== undefined) {
        content.scrollTop = savedPosition;
      } else {
        content.scrollTop = content.scrollHeight;
      }
    }
  }, [roomJID, memoizedMessages, waitForImagesLoaded]);

  useEffect(() => {
    if (memoizedMessages.length > 0) {
      setLastMessageDate(
        new Date(memoizedMessages[memoizedMessages.length - 1].date).getTime()
      );
    }
  }, []);

  useEffect(() => {
    if (isUserMessage) return;

    const newMessageDate = new Date(
      memoizedMessages[memoizedMessages.length - 1]?.date
    )?.getTime();
    if (newMessageDate > lastMessageDate) {
      setNewMessagesCount((prev) => (prev += 1));
    }
  }, [memoizedMessages.length]);

  useEffect(() => {
    restoreScrollPosition();
    // A new room's oldest message is unrelated to whatever the previous
    // room last attempted - don't let a stale guard block its first
    // legitimate load-more.
    lastRequestedFirstMessageIdRef.current = null;
  }, [roomJID]);

  const checkIfLoadMoreMessages = useCallback(() => {
    const params = getScrollParams();

    if (!params) return;

    if (params.top >= 150 || isLoadingMore.current) return;

    const [firstMessage, secondMessage] = memoizedMessages;
    const firstMessageId =
      firstMessage?.id === 'delimiter-new'
        ? secondMessage?.id
        : firstMessage?.id;

    if (!firstMessageId) return;
    if (firstMessageId === lastRequestedFirstMessageIdRef.current) return;

    scrollParams.current = getScrollParams();
    isLoadingMore.current = true;
    lastRequestedFirstMessageIdRef.current = firstMessageId;

    loadMoreMessages(firstMessage.roomJid, 30, Number(firstMessageId)).finally(
      () => {
        isLoadingMore.current = false;
        lastMessageRef.current = memoizedMessages[memoizedMessages.length - 1];
      }
    );
  }, [loadMoreMessages, memoizedMessages.length]);

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
      timeoutRef.current = null;
    }
  };

  const onScroll = () => {
    if (typeof window !== "undefined") {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = window.setTimeout(() => {
        checkAtBottomRef.current();
      }, 50);
    }
  };

  // The listener below is attached exactly once (empty deps - re-attaching
  // on every render would be wasteful and isn't needed). `checkAtBottom` is
  // a plain closure recreated every render (it reads checkIfLoadMoreMessages,
  // memoizedMessages, etc.), so without this ref indirection the listener
  // would permanently call the MOUNT-TIME version forever - e.g. a fresh
  // page of history arriving would never be seen by the scroll handler,
  // since it'd keep checking against the messages array from first render.
  const checkAtBottomRef = useRef(checkAtBottom);
  checkAtBottomRef.current = checkAtBottom;

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
        {decoratedMessages.map((decorated) =>
          renderDecoratedMessage(decorated)
        )}
        {typingIndicatorNode}
      </MessagesScroll>
      {showScrollButton && (
        <ScrollToBottomButton
          onClick={scrollToBottom}
          color={config?.colors?.iconsBg || config?.colors?.primary}
        >
          <DownArrowIcon
            color={
              config?.colors?.icons || config?.colors?.secondary || 'white'
            }
          />
          {newMessagesCount > 0 && (
            <span className="count">{newMessagesCount}</span>
          )}
        </ScrollToBottomButton>
      )}
    </MessagesList>
  );
};

export default MessageList;
