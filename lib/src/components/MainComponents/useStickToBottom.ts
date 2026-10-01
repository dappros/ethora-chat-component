import { MutableRefObject, RefObject, useEffect, useRef } from 'react';

interface Options {
  /** The scrolling element. */
  containerRef: RefObject<HTMLElement>;
  /** The element that grows as messages, images and history arrive. */
  contentRef: RefObject<HTMLElement>;
  /** MessageList's "the reader is away from the bottom" flag. */
  isUserScrolledUpRef: MutableRefObject<boolean>;
  /** An unread delimiter means the list opens ON it, not at the bottom. */
  hasUnreadDelimiter: boolean;
}

/**
 * Keeps a transcript pinned to the bottom while it is still filling in.
 *
 * Opening a room scrolls to the bottom once, and then the room keeps
 * growing: history pages arrive (prepended above), images and embeds finish
 * sizing. The scrollTop stays where it was, so the reader is left hundreds of
 * pixels above the newest message (measured 1477px, and it stayed there),
 * looking at the middle of the conversation for no visible reason.
 *
 * So: whenever the content's height changes and the reader has not scrolled
 * away, go back to the bottom. A reader who has scrolled up (which also
 * covers a jump to a message, and paging older history by scrolling up) is
 * left exactly where they are.
 */
export function useStickToBottom({
  containerRef,
  contentRef,
  isUserScrolledUpRef,
  hasUnreadDelimiter,
}: Options) {
  const delimiterRef = useRef(hasUnreadDelimiter);
  delimiterRef.current = hasUnreadDelimiter;

  useEffect(() => {
    const scroller = containerRef.current;
    const content = contentRef.current;
    if (!scroller || !content || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(() => {
      if (isUserScrolledUpRef.current || delimiterRef.current) return;
      scroller.scrollTop = scroller.scrollHeight;
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, [containerRef, contentRef, isUserScrolledUpRef]);
}
