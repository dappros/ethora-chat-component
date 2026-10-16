import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeliveryReceiptBatcher } from './deliveryReceiptBatcher';

const ROOM = 'room1@conference.example.com';
const WINDOW = 1500;

describe('DeliveryReceiptBatcher', () => {
  let sent: Array<[string, string]>;
  let batcher: DeliveryReceiptBatcher;

  beforeEach(() => {
    vi.useFakeTimers();
    sent = [];
    batcher = new DeliveryReceiptBatcher({
      send: (roomJid, messageId) => sent.push([roomJid, messageId]),
    });
  });

  afterEach(() => {
    batcher.destroy();
    vi.useRealTimers();
  });

  it('acks a single message at once (leading edge)', () => {
    batcher.enqueue(ROOM, 'm1', WINDOW, 1000);
    expect(sent).toEqual([[ROOM, 'm1']]);
  });

  it('turns 50 messages inside one second into exactly two stanzas, the newest last', () => {
    for (let i = 0; i < 50; i++) {
      batcher.enqueue(ROOM, `m${i}`, WINDOW, 1000 + i * 20);
      vi.advanceTimersByTime(20);
    }
    vi.advanceTimersByTime(WINDOW);
    expect(sent).toHaveLength(2);
    expect(sent[0]).toEqual([ROOM, 'm0']);
    expect(sent[1]).toEqual([ROOM, 'm49']);
  });

  it('replaying 100 history messages produces at most two stanzas', () => {
    for (let i = 0; i < 100; i++) {
      batcher.enqueue(ROOM, `h${i}`, WINDOW, 1000 + i);
    }
    vi.advanceTimersByTime(WINDOW * 3);
    expect(sent.length).toBeLessThanOrEqual(2);
    expect(sent[sent.length - 1]).toEqual([ROOM, 'h99']);
  });

  it('keeps the newest pending message even when it arrives out of order', () => {
    batcher.enqueue(ROOM, 'a', WINDOW, 1000);
    batcher.enqueue(ROOM, 'c', WINDOW, 3000);
    batcher.enqueue(ROOM, 'b', WINDOW, 2000);
    vi.advanceTimersByTime(WINDOW);
    expect(sent.map(([, id]) => id)).toEqual(['a', 'c']);
  });

  it('never re-sends an id it already acked', () => {
    batcher.enqueue(ROOM, 'm1', WINDOW, 1000);
    vi.advanceTimersByTime(WINDOW);
    batcher.enqueue(ROOM, 'm1', WINDOW, 1000);
    vi.advanceTimersByTime(WINDOW);
    expect(sent).toEqual([[ROOM, 'm1']]);
  });

  it('skips anything older than the last acked timestamp in the room', () => {
    batcher.enqueue(ROOM, 'new', WINDOW, 5000);
    vi.advanceTimersByTime(WINDOW);
    batcher.enqueue(ROOM, 'old', WINDOW, 4000);
    vi.advanceTimersByTime(WINDOW);
    expect(sent.map(([, id]) => id)).toEqual(['new']);
  });

  it('does not coalesce across rooms', () => {
    batcher.enqueue(ROOM, 'm1', WINDOW, 1000);
    batcher.enqueue('room2@conference.example.com', 'm1', WINDOW, 1000);
    expect(sent).toHaveLength(2);
  });

  it('with coalesceMs 0 sends every new message straight away', () => {
    batcher.enqueue(ROOM, 'a', 0, 1000);
    batcher.enqueue(ROOM, 'b', 0, 2000);
    expect(sent.map(([, id]) => id)).toEqual(['a', 'b']);
  });

  it('clearRoom cancels the window and drops the held message', () => {
    batcher.enqueue(ROOM, 'a', WINDOW, 1000);
    batcher.enqueue(ROOM, 'b', WINDOW, 2000);
    batcher.clearRoom(ROOM);
    vi.advanceTimersByTime(WINDOW * 2);
    expect(sent).toEqual([[ROOM, 'a']]);
    expect(batcher.openWindowCount()).toBe(0);
  });

  it('clear() on disconnect leaves no timers running', () => {
    batcher.enqueue(ROOM, 'a', WINDOW, 1000);
    batcher.enqueue(ROOM, 'b', WINDOW, 2000);
    batcher.clear();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(WINDOW * 2);
    expect(sent).toEqual([[ROOM, 'a']]);
  });

  it('destroy() leaves no timers and forgets acked ids', () => {
    batcher.enqueue(ROOM, 'a', WINDOW, 1000);
    batcher.destroy();
    expect(vi.getTimerCount()).toBe(0);
    batcher.enqueue(ROOM, 'a', WINDOW, 1000);
    expect(sent).toEqual([[ROOM, 'a'], [ROOM, 'a']]);
  });

  it('uses injected timers when given', () => {
    const handles: Array<() => void> = [];
    const cleared: unknown[] = [];
    const custom = new DeliveryReceiptBatcher({
      send: (roomJid, messageId) => sent.push([roomJid, messageId]),
      setTimer: (fn) => {
        handles.push(fn);
        return handles.length;
      },
      clearTimer: (h) => cleared.push(h),
    });
    custom.enqueue(ROOM, 'x', WINDOW, 1);
    custom.enqueue(ROOM, 'y', WINDOW, 2);
    custom.clear();
    expect(cleared).toEqual([1]);
  });
});
