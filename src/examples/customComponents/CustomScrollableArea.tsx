import React, { FC, useCallback, useEffect, useRef } from 'react';
import useMeasure from 'react-use-measure';
import { CustomScrollableAreaProps } from '../../types/models/customComponents.model';
import Loader from '../../components/styled/Loader';

export const CustomScrollableArea: FC<CustomScrollableAreaProps> = ({
  roomJID,
  messages,
  decoratedMessages,
  isLoading,
  isReply,
  activeMessage,
  loadMoreMessages,
  renderMessage,
  scrollController,
  typingIndicator,
  config,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isLoadingMoreRef = useRef(false);
  const scrollParamsRef = useRef<{ top: number; height: number } | null>(null);
  const [measureRef, { height }] = useMeasure();

  const {
    scrollToBottom,
    showScrollButton,
    newMessagesCount,
    resetNewMessageCounter,
  } = scrollController;

  const handleScroll = useCallback(() => {
    const node = scrollRef.current;
    if (!node) return;

    // When user scrolls near the top, request older messages (throttled)
    if (node.scrollTop < 150 && !isLoadingMoreRef.current) {
      scrollParamsRef.current = {
        top: node.scrollTop,
        height: node.scrollHeight,
      };

      const [firstMessage, secondMessage] = messages;
      const firstMessageId =
        firstMessage?.id === 'delimiter-new'
          ? secondMessage?.id
          : firstMessage?.id;

      const chatJid = (firstMessage && firstMessage.roomJid) || roomJID;
      const numericFirstId =
        firstMessageId !== undefined && !Number.isNaN(Number(firstMessageId))
          ? Number(firstMessageId)
          : undefined;

      isLoadingMoreRef.current = true;
      const loadPromise =
        numericFirstId !== undefined
          ? loadMoreMessages(chatJid, 30, numericFirstId)
          : loadMoreMessages(chatJid, 30);

      loadPromise
        .catch(() => {
          // errors are swallowed to keep UX stable
        })
        .finally(() => {
          isLoadingMoreRef.current = false;
        });
    }

    // When user reaches the bottom, clear "new messages" counter
    const distanceFromBottom =
      node.scrollHeight - node.clientHeight - node.scrollTop;
    if (distanceFromBottom <= 5) {
      resetNewMessageCounter();
    }
  }, [loadMoreMessages, messages, resetNewMessageCounter, roomJID]);

  // Restore relative scroll position after older messages are loaded
  useEffect(() => {
    if (!scrollParamsRef.current) return;
    const node = scrollRef.current;
    if (!node) return;

    const { top, height } = scrollParamsRef.current;
    const newScrollTop = top + (node.scrollHeight - height);
    node.scrollTop = newScrollTop;
    scrollParamsRef.current = null;
  }, [messages.length]);

  // Auto-scroll to bottom whenever content height changes (new messages)
  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;

    node.scrollTo({
      top: node.scrollHeight,
      behavior: 'smooth',
    });
    scrollToBottom();
  }, [height, scrollToBottom]);

  return (
    <div
      ref={(el) => {
        scrollRef.current = el;
        // connect react-use-measure to the same DOM node
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        measureRef(el);
      }}
      onScroll={handleScroll}
      style={{ height: '100%', overflowY: 'auto' }}
      className="flex h-full flex-col bg-white"
    >
      {isLoading && (
        <div className="flex justify-center py-2">
          <Loader color={config?.colors?.primary} />
        </div>
      )}
      <div
        className="flex-1 space-y-2 px-4 py-6"
        style={{ scrollBehavior: 'smooth' }}
      >
        {decoratedMessages.map((decorated) => renderMessage(decorated))}
        {typingIndicator}
      </div>
      {showScrollButton && (
        <button
          type="button"
          onClick={() => scrollToBottom()}
          className="mx-auto mb-3 rounded-full bg-indigo-600 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-white"
        >
          Jump to latest ({newMessagesCount})
        </button>
      )}
    </div>
  );
};

export default CustomScrollableArea;
