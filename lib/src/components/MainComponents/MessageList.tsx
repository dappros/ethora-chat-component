import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useDispatch } from 'react-redux';
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
import { useXmppClient } from '../../context/xmppProvider';
import { useTabVisibility } from '../../hooks/useTabVisibility';
import { setLastViewedTimestamp } from '../../roomStore/roomsSlice';
import { DownArrowIcon } from '../../assets/icons';
import NewMessageLabel from '../styled/NewMessageLabel';
import { useCustomComponents } from '../../context/CustomComponentsContext';
import { DecoratedMessage } from '../../types/models/customComponents.model';
import { parseMessageReference } from '../../helpers/parseMessageReference';
import { useLoaderDebug } from '../../hooks/useLoaderDebug';

// How long the active room must sit quiet (no new "mark as read" trigger)
// before we persist the read-state to the server's private store. Each new
// qualifying event (message arrives while at bottom, or the user jumps to
// the latest via the scroll button) resets this timer, so a fast burst of
// messages produces exactly one write, sent for the last message once
// things go quiet — not one write per message.
const MARK_READ_DEBOUNCE_MS = 5000;

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
  const { composing, messages, composingList, unreadMessages } =
    useRoomState(roomJID).room ?? {};
  const { user } = useChatSettingState();
  const { client } = useXmppClient();
  const dispatch = useDispatch();
  const isTabVisible = useTabVisibility();
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

  const timeoutRef = useRef<number>(0);
  const scrollParams = useRef<{ top: number; height: number } | null>(null);
  const atBottom = useRef<boolean>(true);
  const isUserScrolledUp = useRef<boolean>(false);
  const lastComposingState = useRef<boolean>(false);
  const markReadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Persist "I've read up to now" for this room to the server's private
  // store. Previously this only happened when the user LEFT the room
  // (ChatRoom's unmount effect) — while a chat stayed open and active with
  // messages streaming in, the server-side read marker never advanced, so a
  // refresh (or another device) could see the room as having a pile of
  // "unread" messages the user had actually already seen live. Debounced via
  // scheduleMarkRead below so a burst of messages produces one write, not one
  // per message.
  const flushMarkRead = useCallback(() => {
    markReadTimerRef.current = null;
    if (config?.disableLastRead) return;
    // Never mark-as-read while the tab is backgrounded — the user isn't
    // actually looking at these messages.
    if (!isTabVisible) return;
    if (!client || !roomJID) return;
    if (!unreadMessages) return; // nothing to advance

    const ts = Date.now();
    dispatch(setLastViewedTimestamp({ chatJID: roomJID, timestamp: ts }));
    client.actionSetTimestampToPrivateStoreStanza(roomJID, ts);
  }, [config?.disableLastRead, isTabVisible, client, roomJID, unreadMessages, dispatch]);

  const scheduleMarkRead = useCallback(() => {
    if (config?.disableLastRead) return;
    if (!isTabVisible) return;
    if (markReadTimerRef.current) clearTimeout(markReadTimerRef.current);
    markReadTimerRef.current = setTimeout(flushMarkRead, MARK_READ_DEBOUNCE_MS);
  }, [config?.disableLastRead, isTabVisible, flushMarkRead]);

  useEffect(() => {
    return () => {
      // Drop any pending write on unmount/room-switch — ChatRoom's own
      // unmount effect writes a fresher `Date.now()` timestamp on room exit,
      // so there's nothing useful left for this timer to do.
      if (markReadTimerRef.current) clearTimeout(markReadTimerRef.current);
    };
  }, [roomJID]);

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
  }, [roomJID]);

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
      // Every path that lands here means the user is now looking at the
      // latest messages: auto-follow while already at the bottom when a new
      // message arrives, or an explicit click on the "new messages" button
      // to jump down to them.
      scheduleMarkRead();
    }
  }, [scheduleMarkRead]);

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
        checkAtBottom();
      }, 50);
    }
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
