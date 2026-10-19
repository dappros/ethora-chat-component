import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

import chatSettingsSlice from '../../roomStore/chatSettingsSlice';
import roomsSlice from '../../roomStore/roomsSlice';
import roomHeapSlice from '../../roomStore/roomHeapSlice';
import callSlice from '../../roomStore/callSlice';
import { ToastProvider } from '../../context/ToastContext';
import { IRoom } from '../../types/types';

// A 1:1 room never carries an icon of its own on the server, so without a
// peer-avatar fallback the header painted the hashed-initials circle even
// for peers who have a real profile photo set. Mirrors the fix landed in
// ChatRoomItem (list row) - the same two sources: the room's `members`
// entry first (bare affiliations often have profileImage blank), then the
// enriched usersSet record keyed by xmppUsername.

vi.mock('../../context/xmppProvider', () => ({
  useXmppClient: () => ({
    client: { leaveTheRoomStanza: vi.fn() },
    setClient: vi.fn(),
  }),
}));

import ChatHeader from './ChatHeader';

const ROOM_JID = 'dm1@conference.example.com';
const PEER_AVATAR = 'https://files.chat.ethora.com/peer.jpg';
const ROOM_ICON = 'https://files.chat.ethora.com/room.jpg';

const room = (overrides: Partial<IRoom> = {}): IRoom =>
  ({
    jid: ROOM_JID,
    name: 'Peer Name',
    title: 'Peer Name',
    type: 'private',
    usersCnt: 2,
    members: [],
    messages: [],
    isLoading: false,
    ...overrides,
  }) as unknown as IRoom;

const renderHeader = (
  currentRoom: IRoom,
  usersSet: Record<string, unknown> = {}
) => {
  const store = configureStore({
    reducer: {
      chatSettingStore: chatSettingsSlice,
      rooms: roomsSlice,
      roomHeapSlice,
      call: callSlice,
    },
    preloadedState: {
      chatSettingStore: {
        config: {},
        user: { xmppUsername: 'me', fileToken: '' },
      },
      rooms: {
        rooms: { [ROOM_JID]: currentRoom },
        activeRoomJID: ROOM_JID,
        presenceByRoom: {},
        usersSet,
      },
    } as never,
    middleware: (getDefault) =>
      getDefault({ serializableCheck: false, immutableCheck: false }),
  });

  return render(
    <Provider store={store}>
      <ToastProvider>
        <ChatHeader currentRoom={currentRoom} />
      </ToastProvider>
    </Provider>
  );
};

describe('ChatHeader - private peer avatar fallback', () => {
  it('uses the peer profileImage from members when the room has no icon', () => {
    renderHeader(
      room({
        members: [
          { xmppUsername: 'me', _id: 'me', firstName: 'Me', lastName: '' },
          {
            xmppUsername: 'peer',
            _id: 'peer',
            firstName: 'Peer',
            lastName: 'Name',
            profileImage: PEER_AVATAR,
          },
        ],
      } as Partial<IRoom>)
    );

    const img = screen.getByRole('img') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe(PEER_AVATAR);
  });

  it('falls back to the usersSet profileImage when the room member entry has none', () => {
    renderHeader(
      room({
        members: [
          { xmppUsername: 'me', _id: 'me', firstName: 'Me', lastName: '' },
          // Bare affiliation entry - no profileImage on the member.
          { xmppUsername: 'peer', _id: 'peer', firstName: '', lastName: '' },
        ],
      } as Partial<IRoom>),
      {
        peer: {
          _id: 'peer',
          xmppUsername: 'peer',
          firstName: 'Peer',
          lastName: 'Name',
          profileImage: PEER_AVATAR,
        },
      }
    );

    const img = screen.getByRole('img') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe(PEER_AVATAR);
  });

  it('prefers an explicit room icon over the peer avatar', () => {
    renderHeader(
      room({
        icon: ROOM_ICON,
        members: [
          { xmppUsername: 'me', _id: 'me', firstName: 'Me', lastName: '' },
          {
            xmppUsername: 'peer',
            _id: 'peer',
            firstName: 'Peer',
            lastName: 'Name',
            profileImage: PEER_AVATAR,
          },
        ],
      } as Partial<IRoom>)
    );

    const img = screen.getByRole('img') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe(ROOM_ICON);
  });

  it('does not use the peer avatar for group rooms', () => {
    renderHeader(
      room({
        title: 'Group Room',
        name: 'Group Room',
        type: 'group',
        members: [
          { xmppUsername: 'me', _id: 'me', firstName: 'Me', lastName: '' },
          {
            xmppUsername: 'peer',
            _id: 'peer',
            firstName: 'Peer',
            lastName: 'Name',
            profileImage: PEER_AVATAR,
          },
        ],
      } as Partial<IRoom>)
    );

    // No real icon, no fallback - the hashed-initials circle stays, exactly
    // like a group chat with no icon set should.
    expect(screen.queryByRole('img')).toBeNull();
  });
});
