import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

import chatSettingsSlice, { setConfig } from '../roomStore/chatSettingsSlice';
import roomsSlice, { addRoom, setCurrentRoom } from '../roomStore/roomsSlice';
import roomHeapSlice from '../roomStore/roomHeapSlice';

// Regression coverage for the root cause of "replies render with a visible
// delay": useSendMessage's optimistic addRoomMessage dispatch (the pending
// bubble MessageList actually renders from - see MessageList.tsx's
// memoizedMessages, which needs item.isReply === 'true' and a matching
// item.mainMessage to place a message in the open reply thread) used to omit
// isReply/showInChannel/mainMessage entirely, even though the sibling
// addMessageToHeap dispatch right below it always carried them. That left
// the optimistic bubble invisible in the thread until the server echo
// (which does carry those fields) replaced it. This test asserts the
// optimistic room message itself - not just the heap entry - carries the
// same reply metadata the caller passed in.
const sendMessageStanza = vi.fn(async () => true);
const sendTextMessageWithTranslateTagStanza = vi.fn(async () => true);

vi.mock('../context/xmppProvider', () => ({
  useXmppClient: () => ({
    client: {
      sendMessage: (...args: unknown[]) => sendMessageStanza(...args),
      sendTextMessageWithTranslateTagStanza: (...args: unknown[]) =>
        sendTextMessageWithTranslateTagStanza(...args),
      recoverRoomPresenceOnly: vi.fn(async () => true),
      acknowledgeSentMessage: vi.fn(),
    },
  }),
}));

import { useSendMessage } from './useSendMessage';

const ROOM_JID = 'room@conference.xmpp.example';
const MAIN_MESSAGE_REF = JSON.stringify({ id: 'parent-1', text: 'parent body' });

const setup = () => {
  const store = configureStore({
    reducer: { chatSettingStore: chatSettingsSlice, rooms: roomsSlice, roomHeapSlice },
    middleware: (getDefault) =>
      getDefault({ serializableCheck: false, immutableCheck: false }),
  });

  store.dispatch(
    addRoom({ roomData: { jid: ROOM_JID, name: 'room', messages: [] } as never })
  );
  store.dispatch(setCurrentRoom({ roomJID: ROOM_JID }));

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );

  const { result } = renderHook(() => useSendMessage(), { wrapper });
  return { store, result };
};

const roomMessages = (store: ReturnType<typeof setup>['store']) =>
  (store.getState() as any).rooms.rooms[ROOM_JID]?.messages ?? [];

describe('useSendMessage - optimistic reply metadata', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendMessageStanza.mockResolvedValue(true);
    sendTextMessageWithTranslateTagStanza.mockResolvedValue(true);
  });

  it('stamps isReply/showInChannel/mainMessage on the optimistic room message, not just the heap entry', async () => {
    const { store, result } = setup();

    await act(async () => {
      await result.current.sendMessage(
        'reply body',
        ROOM_JID,
        true,
        true,
        MAIN_MESSAGE_REF
      );
    });

    const messages = roomMessages(store);
    expect(messages).toHaveLength(1);
    const optimistic = messages[0];
    expect(optimistic.pending).toBe(true);
    // These are the exact fields MessageList's reply-thread filter checks -
    // without them the optimistic bubble is invisible in the open thread.
    expect(optimistic.isReply).toBe('true');
    expect(optimistic.showInChannel).toBe('true');
    expect(optimistic.mainMessage).toBe(MAIN_MESSAGE_REF);

    // The heap entry already carried these before the fix - still must.
    const heap = (store.getState() as any).roomHeapSlice.messageHeap;
    expect(heap).toHaveLength(1);
    expect(heap[0].isReply).toBe(true);
    expect(heap[0].mainMessage).toBe(MAIN_MESSAGE_REF);
  });

  it('stamps the same reply metadata on the translate-tagged send path', async () => {
    const { store, result } = setup();

    act(() => {
      store.dispatch(setConfig({ translates: { enabled: true } } as any));
    });

    await act(async () => {
      await result.current.sendMessage(
        'reply body translated',
        ROOM_JID,
        true,
        false,
        MAIN_MESSAGE_REF
      );
    });

    const messages = roomMessages(store);
    expect(messages).toHaveLength(1);
    expect(messages[0].isReply).toBe('true');
    expect(messages[0].showInChannel).toBe('false');
    expect(messages[0].mainMessage).toBe(MAIN_MESSAGE_REF);
  });
});
