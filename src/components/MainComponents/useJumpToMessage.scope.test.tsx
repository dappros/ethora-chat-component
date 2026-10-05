import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import chatSettingsSlice from '../../roomStore/chatSettingsSlice';
import roomsSlice, { requestJumpToMessage } from '../../roomStore/roomsSlice';
import { useJumpToMessage } from './useJumpToMessage';
import { clearJumpThread, setJumpThread } from '../../helpers/jumpThread';

const ROOM = 'room@conference.example.com';
const mk = (n: number, extra: Record<string, unknown> = {}) =>
  ({
    id: String(1_700_000_000_000_000 + n * 1000),
    body: `b${n}`,
    date: new Date(1_700_000_000_000 + n * 1000).toISOString(),
    ...extra,
  }) as any;

// The hook re-arms a short timer after each answer, so the clock has to move in
// steps for each re-armed timer to be reached.
const stepClock = async (totalMs: number, stepMs = 100) => {
  for (let elapsed = 0; elapsed < totalMs; elapsed += stepMs) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(stepMs);
    });
  }
};

const setup = (props: {
  messages: any[];
  allMessages?: any[];
  scope?: 'main' | { threadId: string };
  resolveReply?: any;
  fetchWindow?: any;
  roomOpening?: boolean;
  fetchOlderPage?: any;
  jump?: Record<string, unknown>;
}) => {
  const store = configureStore({
    reducer: { chatSettingStore: chatSettingsSlice, rooms: roomsSlice } as any,
  });
  const fetchOlderPage =
    props.fetchOlderPage ??
    vi.fn().mockResolvedValue({ ok: true, complete: true, cursor: 1 });
  const container = document.createElement('div');
  const nodes = new Map<string, HTMLElement>();
  for (const m of props.messages) {
    const node = document.createElement('div');
    node.setAttribute('data-message-id', m.id);
    node.scrollIntoView = vi.fn();
    container.appendChild(node);
    nodes.set(m.id, node);
  }
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <Provider store={store as any}>{children}</Provider>
  );
  const hook = renderHook(
    () =>
      useJumpToMessage({
        roomJID: ROOM,
        messages: props.messages,
        allMessages: props.allMessages,
        visibleCount: props.messages.length,
        setRenderWindow: vi.fn(),
        fetchOlderPage,
        containerRef: { current: container },
        historyComplete: false,
        isUserScrolledUpRef: { current: false },
        fetchWindow: props.fetchWindow,
        resolveReply: props.resolveReply,
        scope: props.scope,
        roomOpening: props.roomOpening,
      }),
    { wrapper }
  );
  const jump = () =>
    act(async () => {
      store.dispatch(
        requestJumpToMessage({
          roomJID: ROOM,
          ids: [],
          createdAt: '2023-11-14T22:13:21.000Z',
          body: 'b1',
          preview: { roomJID: ROOM, body: 'x', createdAt: 'x' } as any,
          ...(props.jump ?? {}),
        })
      );
      await Promise.resolve();
    });
  return { store, hook, jump, nodes, fetchOlderPage };
};

describe('useJumpToMessage: one owner per jump', () => {
  beforeEach(() => {
    clearJumpThread();
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) =>
      setTimeout(() => cb(0), 0)
    );
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    clearJumpThread();
  });

  it('a thread instance stays inert while no thread owns the jump', async () => {
    // Target absent from the thread's list: used to finish(false) and show the card.
    const { jump, store, fetchOlderPage } = setup({
      messages: [mk(5)],
      scope: { threadId: 'parent-1' },
    });
    await jump();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(store.getState().rooms.pendingJump).not.toBeNull();
    expect(store.getState().rooms.archivedMessage).toBeNull();
    expect(fetchOlderPage).not.toHaveBeenCalled();
  });

  it('the main instance stays inert once a thread owns the jump', async () => {
    const fetchWindow = vi.fn().mockResolvedValue('missing');
    const { jump, store } = setup({
      messages: [mk(5)],
      scope: 'main',
      fetchWindow,
    });
    // The thread takes the jump over (as openThreadForJump does) the moment
    // it is requested; the clock is frozen so `at` is known in advance.
    await act(async () => {
      setJumpThread({
        roomJID: ROOM,
        parentId: 'parent-1',
        at: Date.now(),
        parent: null,
        replies: [],
      });
    });
    await jump();
    await stepClock(2000);
    expect(fetchWindow).not.toHaveBeenCalled();
    expect(store.getState().rooms.archivedMessage).toBeNull();
    expect(store.getState().rooms.pendingJump).not.toBeNull();
  });

  it('the owning thread scrolls to the reply and clears the jump', async () => {
    const reply = mk(1, { isReply: 'true' });
    const { jump, store, nodes } = setup({
      messages: [reply],
      scope: { threadId: 'parent-1' },
      jump: { ids: [reply.id], createdAt: undefined, body: undefined },
    });
    await act(async () => {
      setJumpThread({
        roomJID: ROOM,
        parentId: 'parent-1',
        at: Date.now(),
        parent: null,
        replies: [reply],
      });
    });
    await jump();
    await stepClock(100);
    expect(nodes.get(reply.id)!.scrollIntoView).toHaveBeenCalled();
    expect(store.getState().rooms.pendingJump).toBeNull();
  });
});

describe('useJumpToMessage: a target that is a thread reply', () => {
  beforeEach(() => {
    clearJumpThread();
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) =>
      setTimeout(() => cb(0), 0)
    );
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    clearJumpThread();
  });

  const parentRef = JSON.stringify({ id: 'p1', roomJid: ROOM });

  it('hands a reply found in the unfiltered list to resolveReply, with no card', async () => {
    const reply = mk(1, { isReply: 'true', mainMessage: parentRef });
    const resolveReply = vi.fn(async (j: any) => {
      setJumpThread({
        roomJID: ROOM,
        parentId: 'p1',
        at: j.at,
        parent: null,
        replies: [],
      });
      return true;
    });
    const { jump, store, fetchOlderPage } = setup({
      messages: [mk(5)], // main list: replies are filtered out
      allMessages: [reply, mk(5)],
      resolveReply,
      jump: { ids: [reply.id], createdAt: undefined, body: undefined },
    });
    await jump();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(resolveReply).toHaveBeenCalledTimes(1);
    expect(resolveReply.mock.calls[0][1].id).toBe(reply.id);
    expect(store.getState().rooms.archivedMessage).toBeNull();
    expect(fetchOlderPage).not.toHaveBeenCalled();
  });

  it('shows the card only when the thread could not be opened', async () => {
    const reply = mk(1, { isReply: 'true', mainMessage: parentRef });
    const resolveReply = vi.fn().mockResolvedValue(false);
    const { jump, store } = setup({
      messages: [mk(5)],
      allMessages: [reply, mk(5)],
      resolveReply,
      jump: { ids: [reply.id], createdAt: undefined, body: undefined },
    });
    await jump();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(store.getState().rooms.archivedMessage).not.toBeNull();
  });

  it('does not treat a reply also shown in the channel as a thread target', async () => {
    const shown = mk(1, {
      isReply: 'true',
      mainMessage: parentRef,
      showInChannel: 'true',
    });
    const resolveReply = vi.fn();
    const { jump, nodes } = setup({
      messages: [shown, mk(5)],
      allMessages: [shown, mk(5)],
      resolveReply,
      jump: { ids: [shown.id], createdAt: undefined, body: undefined },
    });
    await jump();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(resolveReply).not.toHaveBeenCalled();
    expect(nodes.get(shown.id)!.scrollIntoView).toHaveBeenCalled();
  });
});

describe('useJumpToMessage: a room that is still opening', () => {
  beforeEach(() => {
    clearJumpThread();
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) =>
      setTimeout(() => cb(0), 0)
    );
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('asks again instead of showing the card when the window could not be asked yet', async () => {
    const fetchWindow = vi
      .fn()
      .mockResolvedValueOnce('unavailable')
      .mockResolvedValueOnce('unavailable')
      .mockResolvedValue('missing');
    const { jump, store } = setup({
      messages: [mk(5)],
      fetchWindow,
      roomOpening: true,
    });
    await jump();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(store.getState().rooms.archivedMessage).toBeNull();
    await stepClock(3000);
    expect(fetchWindow.mock.calls.length).toBeGreaterThanOrEqual(3);
    // The server finally answered "absent": now, and only now, the card.
    expect(store.getState().rooms.archivedMessage).not.toBeNull();
  });

  it('does not count failed page requests of an opening room toward giving up', async () => {
    const fetchOlderPage = vi.fn().mockResolvedValue({ ok: false });
    const { jump, store } = setup({
      messages: [mk(5)],
      roomOpening: true,
      fetchOlderPage,
    });
    await jump();
    await stepClock(5000);
    expect(fetchOlderPage.mock.calls.length).toBeGreaterThan(3);
    expect(store.getState().rooms.archivedMessage).toBeNull();
  });

  it('waits for the live list of an empty opening room, then asks the archive', async () => {
    const fetchWindow = vi.fn().mockResolvedValue('found');
    const { jump } = setup({
      messages: [],
      fetchWindow,
      roomOpening: true,
    });
    await jump();
    await stepClock(1000);
    expect(fetchWindow).not.toHaveBeenCalled();
    await stepClock(4000);
    expect(fetchWindow).toHaveBeenCalledTimes(1);
  });
});
