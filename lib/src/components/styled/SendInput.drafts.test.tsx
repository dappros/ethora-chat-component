import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, screen } from '@testing-library/react';
import type { EnhancedStore } from '@reduxjs/toolkit';
import { renderWithProviders } from '../../test/renderWithProviders';
import SendInput from './SendInput';
import { setCurrentRoom } from '../../roomStore/roomsSlice';

vi.mock('../../hooks/usePdfThumbnail', () => ({
  usePdfThumbnail: () => ({ status: 'idle', retry: () => undefined }),
}));

// The composer fetches a room's member list once per room for the mention
// dropdown; nothing in these tests is about that.
vi.mock('../../networking/api-requests/rooms.api', () => ({
  getRoomByName: () => Promise.resolve(null),
}));

const ROOM_A = 'a@conference.example.com';
const ROOM_B = 'b@conference.example.com';

const makeRoom = (jid: string) => ({
  jid,
  name: jid,
  title: jid,
  usersCnt: 0,
  messages: [],
  isLoading: false,
  roomBg: null,
});

const setup = (
  drafts: Record<string, string> = {},
  props: Partial<React.ComponentProps<typeof SendInput>> = {}
) => {
  const sendMessage = vi.fn();
  const sendMedia = vi.fn();
  const storeRef: { current: EnhancedStore | null } = { current: null };

  const element = (extra: Partial<React.ComponentProps<typeof SendInput>> = {}) => (
    <SendInput
      sendMessage={sendMessage}
      sendMedia={sendMedia}
      isLoading={false}
      multiline
      {...props}
      {...extra}
    />
  );

  const { container, rerender } = renderWithProviders(
    element(),
    {
      storeRef,
      preloadedState: {
        chatSettingStore: { config: {} },
        rooms: {
          rooms: { [ROOM_A]: makeRoom(ROOM_A), [ROOM_B]: makeRoom(ROOM_B) },
          activeRoomJID: ROOM_A,
          drafts,
          usersSet: {},
          presenceByRoom: {},
          subscribedRooms: [],
          pushSubscriptionStatus: {},
          reportRoom: { isOpen: false },
          isChatUiVisible: false,
          isLoading: false,
          editAction: { isEdit: false, roomJid: '', messageId: '', text: '' },
        },
      } as never,
    }
  );

  const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
  const getDrafts = () =>
    (storeRef.current?.getState() as any).rooms.drafts as Record<string, string>;
  const switchTo = (jid: string) =>
    act(() => {
      storeRef.current?.dispatch(setCurrentRoom({ roomJID: jid }));
    });

  const setEditMessage = (editMessage: string) =>
    act(() => {
      rerender(element({ editMessage }));
    });

  return {
    sendMessage,
    sendMedia,
    textarea,
    getDrafts,
    switchTo,
    setEditMessage,
    storeRef,
  };
};

const type = (textarea: HTMLTextAreaElement, value: string) =>
  fireEvent.change(textarea, { target: { value } });

describe('SendInput per-room drafts', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('restores the active room draft on mount, caret at the end', () => {
    const { textarea } = setup({ [ROOM_A]: 'unsent text' });

    expect(textarea.value).toBe('unsent text');
    expect(textarea.selectionStart).toBe('unsent text'.length);
  });

  // The debounce is the point: typing must not dispatch (and so must not
  // trigger a persist write of the whole rooms slice) per keystroke.
  it('debounces the write instead of saving on every keystroke', () => {
    const { textarea, getDrafts } = setup();

    type(textarea, 'h');
    type(textarea, 'he');
    type(textarea, 'hel');
    expect(getDrafts()).toEqual({});

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(getDrafts()).toEqual({ [ROOM_A]: 'hel' });
  });

  it('gives each room its own text when switching between them', () => {
    const { textarea, getDrafts, switchTo } = setup({ [ROOM_B]: 'from B' });

    type(textarea, 'from A');
    act(() => {
      vi.advanceTimersByTime(500);
    });

    switchTo(ROOM_B);
    expect(textarea.value).toBe('from B');
    expect(textarea.selectionStart).toBe('from B'.length);

    switchTo(ROOM_A);
    expect(textarea.value).toBe('from A');
    expect(getDrafts()[ROOM_A]).toBe('from A');
  });

  // Leaving a room mid-debounce used to be exactly where text went missing.
  it('flushes a pending draft when the room changes before the debounce fires', () => {
    const { textarea, getDrafts, switchTo } = setup();

    type(textarea, 'typed and left immediately');
    switchTo(ROOM_B);

    expect(getDrafts()[ROOM_A]).toBe('typed and left immediately');
    expect(textarea.value).toBe('');
  });

  it('does not leak one room text into another on switch', () => {
    const { textarea, getDrafts, switchTo } = setup();

    type(textarea, 'belongs to A');
    switchTo(ROOM_B);
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(getDrafts()[ROOM_B]).toBeUndefined();
    expect(getDrafts()[ROOM_A]).toBe('belongs to A');
  });

  it('clears the room draft when the message is sent', () => {
    const { textarea, getDrafts, sendMessage } = setup();

    type(textarea, 'about to send');
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(getDrafts()[ROOM_A]).toBe('about to send');

    fireEvent.click(screen.getByLabelText('Send'));
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(sendMessage).toHaveBeenCalled();
    expect(getDrafts()[ROOM_A]).toBeUndefined();
    expect(textarea.value).toBe('');
  });

  // An edit is a rewrite of an already sent message with its own state; it
  // must not overwrite the unsent draft it stands in for, and the draft has
  // to come back when the edit ends.
  it('keeps an edit-in-progress out of the draft and restores the draft after', () => {
    const { textarea, getDrafts, setEditMessage } = setup({
      [ROOM_A]: 'my draft',
    });
    expect(textarea.value).toBe('my draft');

    // ChatRoom starts an edit by feeding the message body in as editMessage.
    setEditMessage('the message being edited');
    expect(textarea.value).toBe('the message being edited');

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(getDrafts()[ROOM_A]).toBe('my draft');

    // Edit cancelled/finished: the room's own unsent text comes back.
    setEditMessage('');
    expect(textarea.value).toBe('my draft');
    expect(textarea.selectionStart).toBe('my draft'.length);

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(getDrafts()[ROOM_A]).toBe('my draft');
  });

  it('stays inert when drafts are disabled (the thread composer)', () => {
    const { textarea, getDrafts } = setup(
      { [ROOM_A]: 'main composer draft' },
      { disableDrafts: true }
    );

    expect(textarea.value).toBe('');

    type(textarea, 'thread reply');
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(getDrafts()[ROOM_A]).toBe('main composer draft');
  });
});
