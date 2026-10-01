import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useStickToBottom } from './useStickToBottom';

let trigger: () => void = () => {};
class FakeResizeObserver {
  constructor(cb: () => void) {
    trigger = cb;
  }
  observe() {}
  disconnect() {}
}

const setup = (opts: { scrolledUp?: boolean; delimiter?: boolean } = {}) => {
  const scroller = document.createElement('div');
  Object.defineProperty(scroller, 'scrollHeight', { value: 5000, configurable: true });
  scroller.scrollTop = 100;
  const content = document.createElement('div');
  renderHook(() =>
    useStickToBottom({
      containerRef: { current: scroller },
      contentRef: { current: content },
      isUserScrolledUpRef: { current: Boolean(opts.scrolledUp) },
      hasUnreadDelimiter: Boolean(opts.delimiter),
    })
  );
  return scroller;
};

// Opening a room scrolls to the bottom once, and the room then keeps growing
// (history pages arrive above, images size themselves). Without this the
// reader was left 1477px above the newest message, in the middle of the
// conversation, and stayed there.
describe('useStickToBottom', () => {
  beforeEach(() => vi.stubGlobal('ResizeObserver', FakeResizeObserver));
  afterEach(() => vi.unstubAllGlobals());

  it('returns to the bottom when the content grows and the reader is at the bottom', () => {
    const scroller = setup();
    trigger();
    expect(scroller.scrollTop).toBe(5000);
  });

  it('leaves a reader who scrolled up exactly where they are', () => {
    const scroller = setup({ scrolledUp: true });
    trigger();
    expect(scroller.scrollTop).toBe(100);
  });

  it('does not fight the unread delimiter, which the list opens on', () => {
    const scroller = setup({ delimiter: true });
    trigger();
    expect(scroller.scrollTop).toBe(100);
  });
});
