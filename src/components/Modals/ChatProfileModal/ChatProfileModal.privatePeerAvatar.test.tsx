import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../../test/renderWithProviders';

// A 1:1 room carries no icon of its own on the server, so without a
// peer-avatar fallback the hero circle painted the hashed initials even
// for peers who had a real profile photo set. Mirrors the fix landed in
// ChatHeader (header circle) and ChatRoomItem (list row).

vi.mock('../../../context/xmppProvider', () => ({
  useXmppClient: () => ({
    client: { setRoomImageStanza: vi.fn() },
    setClient: vi.fn(),
  }),
}));

import ChatProfileModal from './ChatProfileModal';

const ROOM_JID = 'dm1@conference.example.com';
const PEER_AVATAR = 'https://files.chat.ethora.com/peer.jpg';
const ROOM_ICON = 'https://files.chat.ethora.com/room.jpg';

const renderPanel = (
  roomOverrides: Record<string, unknown> = {},
  usersSet: Record<string, unknown> = {}
) =>
  renderWithProviders(<ChatProfileModal handleCloseModal={vi.fn()} />, {
    preloadedState: {
      chatSettingStore: {
        config: {},
        user: { xmppUsername: 'me', fileToken: '' },
      },
      rooms: {
        rooms: {
          [ROOM_JID]: {
            jid: ROOM_JID,
            name: 'Peer Name',
            title: 'Peer Name',
            type: 'private',
            role: 'participant',
            usersCnt: 2,
            members: [
              { xmppUsername: 'me', _id: 'me', firstName: 'Me', lastName: '' },
              {
                xmppUsername: 'peer',
                _id: 'peer',
                firstName: 'Peer',
                lastName: 'Name',
              },
            ],
            messages: [],
            ...roomOverrides,
          },
        },
        activeRoomJID: ROOM_JID,
        usersSet,
        presenceByRoom: {},
      },
    } as never,
  });

// The hero avatar is the big (96px) one on the panel; member rows render
// their own 40px avatars, which would collide with a plain getByRole('img')
// whenever a peer has a profile photo set. The size prop is forwarded to
// the <img> as an attribute (see AvatarImage), so filter on that.
const heroImg = () =>
  document.querySelector('img[size="96"]') as HTMLImageElement | null;

describe('ChatProfileModal - private peer avatar fallback', () => {
  it('uses the peer profileImage from members when the room has no icon', () => {
    renderPanel({
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
    });

    expect(heroImg()?.getAttribute('src')).toBe(PEER_AVATAR);
  });

  it('falls back to the usersSet profileImage when the room member entry has none', () => {
    renderPanel(
      {},
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

    expect(heroImg()?.getAttribute('src')).toBe(PEER_AVATAR);
  });

  it('prefers an explicit room icon over the peer avatar', () => {
    renderPanel({
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
    });

    expect(heroImg()?.getAttribute('src')).toBe(ROOM_ICON);
  });

  it('does not use the peer avatar for group rooms', () => {
    renderPanel({
      name: 'Group Room',
      title: 'Group Room',
      type: 'group',
      role: 'moderator',
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
    });

    // No room icon, no fallback - the hero circle paints the hashed
    // initials, exactly like a group chat with no icon set should. Member
    // rows still get their own 40px avatars (that is correct - each
    // member's own photo). Only the hero circle is the subject here.
    expect(heroImg()).toBeNull();
  });
});
