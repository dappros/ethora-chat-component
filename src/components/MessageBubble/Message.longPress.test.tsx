import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import { Message } from './Message';
import { IMessage, IRoom } from '../../types/types';

vi.mock('../../context/xmppProvider', () => ({
  useXmppClient: () => ({ client: { sendMessageReactionStanza: vi.fn() } }),
}));

// Long-press opens the message menu on touch screens. A finger that moves
// (scrolling the list, swiping) must cancel it: holding a bubble while
// scrolling used to pop the menu up half a second later.

const ROOM_JID = 'room1@conference.example.com';

const message = {
  id: 'm1',
  body: 'hello',
  date: new Date().toISOString(),
  roomJid: ROOM_JID,
  user: { id: 'me@example.com', name: 'Me' },
} as IMessage;

const room = {
  jid: ROOM_JID,
  name: 'room1',
  title: 'Room 1',
  usersCnt: 0,
  messages: [],
  isLoading: false,
  roomBg: null,
} as unknown as IRoom;

function renderMessage() {
  return renderWithProviders(<Message message={message} isUser={true} isReply={false} />, {
    preloadedState: {
      chatSettingStore: { user: { xmppUsername: 'me' }, config: {} } as any,
      rooms: { rooms: { [ROOM_JID]: room }, usersSet: {} } as any,
    },
  });
}

const touch = (x: number, y: number) => ({ touches: [{ clientX: x, clientY: y }] });

describe('Message long-press', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('opens the menu after holding still for 500 ms', () => {
    renderMessage();
    fireEvent.touchStart(screen.getByText('hello'), touch(100, 100));
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(screen.getByText('Delete')).toBeInTheDocument();
  });

  it('does not open the menu when the finger moves (scroll or swipe)', () => {
    renderMessage();
    const bubble = screen.getByText('hello');
    fireEvent.touchStart(bubble, touch(100, 100));
    fireEvent.touchMove(bubble, touch(100, 140));
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(screen.queryByText('Delete')).not.toBeInTheDocument();
  });

  it('keeps the long-press through a small jitter', () => {
    renderMessage();
    const bubble = screen.getByText('hello');
    fireEvent.touchStart(bubble, touch(100, 100));
    fireEvent.touchMove(bubble, touch(104, 103));
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(screen.getByText('Delete')).toBeInTheDocument();
  });

  it('cancels on touchcancel', () => {
    renderMessage();
    const bubble = screen.getByText('hello');
    fireEvent.touchStart(bubble, touch(100, 100));
    fireEvent.touchCancel(bubble);
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(screen.queryByText('Delete')).not.toBeInTheDocument();
  });
});
