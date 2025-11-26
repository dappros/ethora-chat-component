import React, { useCallback, useEffect, useRef } from 'react';
import { CustomScrollableAreaProps } from '../../types/models/customComponents.model';

const CustomScrollableArea: React.FC<CustomScrollableAreaProps> = ({
  decoratedMessages,
  renderMessage,
  typingIndicator,
  scrollController,
  loadMoreMessages,
  roomJID,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const {
    scrollToBottom,
    waitForImagesLoaded,
    showScrollButton,
    newMessagesCount,
    resetNewMessageCounter,
  } = scrollController;

  const handleScroll = useCallback(() => {
    const node = scrollRef.current;
    if (!node) return;

    if (node.scrollTop < 120) {
      loadMoreMessages(roomJID, 30);
    }

    const distanceFromBottom =
      node.scrollHeight - node.clientHeight - node.scrollTop;
    if (distanceFromBottom <= 5) {
      resetNewMessageCounter();
    }
  }, [loadMoreMessages, resetNewMessageCounter, roomJID]);

  useEffect(() => {
    waitForImagesLoaded().then(() => {
      scrollToBottom();
    });
  }, [
    decoratedMessages.length,
    scrollToBottom,
    waitForImagesLoaded,
  ]);

  return (
    <div className="flex h-full flex-col bg-white">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 space-y-2 overflow-y-auto px-4 py-6"
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

