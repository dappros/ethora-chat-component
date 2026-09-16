import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import { IMessage } from '../../types/models/message.model';
import { User } from '../../types/types';

// The complaint this fixes: closing a thread used to dispatch
// setCloseActiveMessage synchronously, which flips `activeMessage` in
// ChatWrapper's ternary and swaps ThreadWrapper out for ChatRoom on the
// same tick - no time for the pane's exit animation (slideOutRightAnimation)
// to play. `closeThread` now delays that dispatch via `useDelayedAction`
// (MOTION_BASE_MS) so the pane stays mounted, and stays exiting, until the
// animation has actually had time to run.
vi.mock('../../context/xmppProvider', () => ({
  useXmppClient: () => ({ client: {} }),
}));
vi.mock('../MainComponents/MessageList', () => ({ default: () => null }));
vi.mock('../styled/SendInput', () => ({ default: () => null }));
vi.mock('../styled/StyledInputComponents/CustomTypingIndicator', () => ({
  default: () => null,
}));

// Imported after the mocks so ThreadWrapper picks up the stubbed children.
import ThreadWrapper from './ThreadWrapper';

const user: User = {
  id: 'u1',
  firstName: 'Ada',
  lastName: 'Lovelace',
  xmppUsername: 'ada',
} as User;

const roomJid = 'room1@conference.example.com';

const activeMessage: IMessage = {
  id: 'm1',
  user,
  date: new Date().toISOString(),
  body: 'hello',
  roomJid,
  activeMessage: true,
} as IMessage;

const buildPreloadedState = () => ({
  chatSettingStore: { config: {}, user } as any,
  rooms: {
    rooms: {
      [roomJid]: {
        jid: roomJid,
        name: 'General',
        messages: [{ ...activeMessage }],
      },
    },
    activeRoomJID: roomJid,
    isChatUiVisible: true,
    isLoading: false,
    editAction: { isEdit: false, roomJid: '', messageId: '', text: '' },
    usersSet: {},
    presenceByRoom: {},
    reportRoom: { isOpen: false },
    subscribedRooms: [],
    pushSubscriptionStatus: {},
    loadingText: undefined,
  } as any,
});

describe('ThreadWrapper close delay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not close the thread on the same tick - it waits for the exit animation', () => {
    const storeRef: { current: any } = { current: null };
    const { getByText } = renderWithProviders(
      <ThreadWrapper activeMessage={activeMessage} user={user} />,
      { preloadedState: buildPreloadedState(), storeRef }
    );

    const isStillActive = () =>
      storeRef.current.getState().rooms.rooms[roomJid].messages[0]
        .activeMessage;

    expect(isStillActive()).toBe(true);

    fireEvent.click(getByText('General'));

    // The click requested the close, but the real dispatch is delayed - the
    // thread must still read as open immediately after.
    expect(isStillActive()).toBe(true);

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(isStillActive()).toBe(false);
  });
});
