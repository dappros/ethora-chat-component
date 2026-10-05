import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import chatSettingsSlice from '../../roomStore/chatSettingsSlice';
import roomsSlice, {
  requestJumpToMessage,
  setJumpWindow,
} from '../../roomStore/roomsSlice';
import { NEAR_LIVE_MESSAGES, useJumpToMessage } from './useJumpToMessage';

const ROOM = 'room@conference.example.com';
const mk = (n: number) =>
  ({
    id: String(1_700_000_000_000_000 + n * 1000),
    body: `b${n}`,
    date: new Date(1_700_000_000_000 + n * 1000).toISOString(),
  }) as any;
const list = (count: number) => Array.from({ length: count }, (_, i) => mk(i));

const setup = (opts: {
  messages: any[];
  fetchWindow?: any;
  jumpWindowActive?: boolean;
  targetIndex: number;
}) => {
  const store = configureStore({
    reducer: {
      chatSettingStore: chatSettingsSlice,
      rooms: roomsSlice,
    } as any,
  });
  const fetchOlderPage = vi
    .fn()
    .mockResolvedValue({ ok: true, complete: true, cursor: 1 });
  const setRenderWindow = vi.fn();
  const container = document.createElement('div');
  const target = mk(opts.targetIndex);
  const targetNode = document.createElement('div');
  targetNode.setAttribute('data-message-id', target.id);
  targetNode.scrollIntoView = vi.fn();
  container.appendChild(targetNode);
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <Provider store={store as any}>{children}</Provider>
  );
  const hook = renderHook(
    (props: { messages: any[] }) =>
      useJumpToMessage({
        roomJID: ROOM,
        messages: props.messages,
        visibleCount: props.messages.length,
        setRenderWindow,
        fetchOlderPage,
        containerRef: { current: container },
        historyComplete: false,
        isUserScrolledUpRef: { current: false },
        jumpWindowActive: opts.jumpWindowActive,
        fetchWindow: opts.fetchWindow,
      }),
    { wrapper, initialProps: { messages: opts.messages } }
  );
  const jump = () =>
    act(async () => {
      store.dispatch(
        requestJumpToMessage({
          roomJID: ROOM,
          ids: [target.id],
          preview: { roomJID: ROOM, body: 'x', createdAt: 'x' } as any,
        })
      );
      await Promise.resolve();
    });
  return { store, hook, fetchOlderPage, jump, targetNode, target };
};

describe('useJumpToMessage: window or existing path', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) =>
      setTimeout(() => cb(0), 0)
    );
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('keeps the existing path for a target near the live tail', async () => {
    const messages = list(NEAR_LIVE_MESSAGES + 50);
    const fetchWindow = vi.fn().mockResolvedValue('found');
    const { jump, store, targetNode } = setup({
      messages,
      fetchWindow,
      targetIndex: messages.length - 10,
    });
    await jump();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(fetchWindow).not.toHaveBeenCalled();
    expect(targetNode.scrollIntoView).toHaveBeenCalled();
    expect(store.getState().rooms.pendingJump).toBeNull();
  });

  it('fetches a window for a target far from the tail instead of paging', async () => {
    const messages = list(NEAR_LIVE_MESSAGES + 200);
    const fetchWindow = vi.fn().mockResolvedValue('found');
    const { jump, fetchOlderPage } = setup({
      messages,
      fetchWindow,
      targetIndex: 5,
    });
    await jump();
    expect(fetchWindow).toHaveBeenCalledTimes(1);
    expect(fetchOlderPage).not.toHaveBeenCalled();
  });

  it('fetches a window for a target that is not loaded at all', async () => {
    const fetchWindow = vi.fn().mockResolvedValue('found');
    const { jump } = setup({
      messages: list(30),
      fetchWindow,
      targetIndex: 9999,
    });
    await jump();
    expect(fetchWindow).toHaveBeenCalledTimes(1);
  });

  it('shows the archived card when the server says the target is gone', async () => {
    const fetchWindow = vi.fn().mockResolvedValue('missing');
    const { jump, store, fetchOlderPage } = setup({
      messages: list(30),
      fetchWindow,
      targetIndex: 9999,
    });
    await jump();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(fetchOlderPage).not.toHaveBeenCalled();
    expect(store.getState().rooms.archivedMessage).not.toBeNull();
    expect(store.getState().rooms.pendingJump).toBeNull();
  });

  it('falls back to paging when a window could not be asked for', async () => {
    const fetchWindow = vi.fn().mockResolvedValue('unavailable');
    const { jump, fetchOlderPage } = setup({
      messages: list(30),
      fetchWindow,
      targetIndex: 9999,
    });
    await jump();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(fetchWindow).toHaveBeenCalledTimes(1);
    expect(fetchOlderPage).toHaveBeenCalled();
  });

  it('scrolls within the window when the target is in it', async () => {
    const messages = list(21);
    const fetchWindow = vi.fn();
    const { jump, targetNode, store } = setup({
      messages,
      fetchWindow,
      jumpWindowActive: true,
      targetIndex: 10,
    });
    await jump();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(fetchWindow).not.toHaveBeenCalled();
    expect(targetNode.scrollIntoView).toHaveBeenCalled();
    expect(store.getState().rooms.pendingJump).toBeNull();
  });

  it('returns to the live list when a new target is outside the window', async () => {
    const { jump, store } = setup({
      messages: list(21),
      fetchWindow: vi.fn(),
      jumpWindowActive: true,
      targetIndex: 9999,
    });
    store.dispatch(
      setJumpWindow({
        roomJID: ROOM,
        messages: list(21),
        targetId: mk(10).id,
        olderCursor: null,
        hasOlder: false,
        newerCursor: null,
        hasNewer: false,
      })
    );
    await jump();
    expect(store.getState().rooms.jumpWindow).toBeNull();
  });
});
