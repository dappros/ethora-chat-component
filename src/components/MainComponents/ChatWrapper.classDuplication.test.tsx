import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/renderWithProviders';

// ChatWrapper's "shell" branch renders TWO <ChatWrapperBox>-shaped elements
// (an outer layout box and an inner one for the room-list/chat-room row).
// Both used to be the SAME styled component, which carries the
// `ethora-chat-root` class (see styled/ChatWrapperBox.tsx) and applies the
// design-token inline style - so a single mounted <Chat> produced TWO
// `.ethora-chat-root` elements instead of one. A host scoping CSS on that
// class, or `document.querySelector('.ethora-chat-root')`, would only ever
// reliably see/affect the outer one.
//
// Everything below is stubbed out so the test isolates just the DOM shape
// of ChatWrapper's own render, not the real XMPP/room stack.
vi.mock('../../hooks/useChatWrapperInit.ts', () => ({
  default: () => ({
    client: { promoteRoomHistory: vi.fn(), getHistoryStanza: vi.fn() },
    inited: true,
    isRetrying: false,
    showModal: false,
    setShowModal: vi.fn(),
    isConnectionLost: false,
  }),
}));
vi.mock('../../hooks/useQRCodeChatHandler', () => ({
  useQRCodeChat: () => ({ wasAutoSelected: false }),
}));
vi.mock('./RoomList', () => ({
  default: () => <div data-testid="room-list-stub" />,
}));
vi.mock('./ChatRoom', () => ({
  default: () => <div data-testid="chat-room-stub" />,
}));
vi.mock('../Modals/Modal/Modal', () => ({
  default: () => null,
}));

import { ChatWrapper } from './ChatWrapper';

const USER = {
  xmppUsername: 'appid_alice',
  xmppPassword: 'secret',
} as any;

const ROOMS = {
  'room1@conference.example.com': {
    jid: 'room1@conference.example.com',
    title: 'Room One',
    name: 'Room One',
    messages: [],
    unreadMessages: 0,
  },
} as any;

describe('ChatWrapper - exactly one .ethora-chat-root per instance', () => {
  it('renders a single ethora-chat-root element in the main shell branch', () => {
    const { container } = renderWithProviders(<ChatWrapper config={{} as any} />, {
      preloadedState: {
        chatSettingStore: { user: USER, config: {} } as any,
        rooms: { rooms: ROOMS, activeRoomJID: null, isLoading: false } as any,
      },
    });

    expect(
      container.querySelectorAll('.ethora-chat-root').length
    ).toBe(1);
  });
});
