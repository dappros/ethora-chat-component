import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import ChatRoomItem from './ChatRoomItem';
import { renderWithProviders } from '../../test/renderWithProviders';
import { IRoom } from '../../types/types';

const noop = () => {};

// A 1:1 private room never carries an icon of its own on the server, so
// without a peer-avatar fallback every row in the list painted the
// hashed-initials circle even for peers who had a real profile photo set.
// The fallback has two sources - the peer's `profileImage` on the room's
// `members` entry, and the enriched usersSet record keyed by xmppUsername
// (bare affiliation members usually have profileImage blank; usersSet
// carries the real avatar). Group rooms with no icon continue to show
// initials, which is correct - they have no 1:1 peer to borrow from.

const PEER_AVATAR = 'https://files.chat.ethora.com/peer.jpg';

const makeRoom = (overrides: Partial<IRoom> = {}): IRoom =>
  ({
    jid: 'dm1@conference.example.com',
    title: 'Peer Name',
    name: 'Peer Name',
    messages: [],
    type: 'private',
    ...overrides,
  }) as IRoom;

describe('ChatRoomItem - private peer avatar fallback', () => {
  it('uses the peer profileImage from members when the room has no icon', () => {
    renderWithProviders(
      <ChatRoomItem
        chat={makeRoom({
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
        })}
        isChatActive={false}
        performClick={noop}
        config={{} as never}
      />,
      {
        preloadedState: {
          chatSettingStore: {
            user: { xmppUsername: 'me' },
            config: {},
          },
          rooms: { rooms: {}, usersSet: {} },
        } as never,
      }
    );

    const img = screen.getByRole('img') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe(PEER_AVATAR);
  });

  it('falls back to the usersSet profileImage when the room member entry has none', () => {
    renderWithProviders(
      <ChatRoomItem
        chat={makeRoom({
          members: [
            { xmppUsername: 'me', _id: 'me', firstName: 'Me', lastName: '' },
            // Bare affiliation entry - no profileImage on the member.
            {
              xmppUsername: 'peer',
              _id: 'peer',
              firstName: '',
              lastName: '',
            },
          ],
        })}
        isChatActive={false}
        performClick={noop}
        config={{} as never}
      />,
      {
        preloadedState: {
          chatSettingStore: {
            user: { xmppUsername: 'me' },
            config: {},
          },
          rooms: {
            rooms: {},
            usersSet: {
              peer: {
                _id: 'peer',
                xmppUsername: 'peer',
                firstName: 'Peer',
                lastName: 'Name',
                profileImage: PEER_AVATAR,
              },
            },
          },
        } as never,
      }
    );

    const img = screen.getByRole('img') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe(PEER_AVATAR);
  });

  it('prefers an explicit room icon over the peer avatar', () => {
    const ROOM_ICON = 'https://files.chat.ethora.com/room.jpg';
    renderWithProviders(
      <ChatRoomItem
        chat={makeRoom({
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
        })}
        isChatActive={false}
        performClick={noop}
        config={{} as never}
      />,
      {
        preloadedState: {
          chatSettingStore: {
            user: { xmppUsername: 'me' },
            config: {},
          },
          rooms: { rooms: {}, usersSet: {} },
        } as never,
      }
    );

    const img = screen.getByRole('img') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe(ROOM_ICON);
  });

  it('does not use the peer avatar for group rooms', () => {
    renderWithProviders(
      <ChatRoomItem
        chat={makeRoom({
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
        })}
        isChatActive={false}
        performClick={noop}
        config={{} as never}
      />,
      {
        preloadedState: {
          chatSettingStore: {
            user: { xmppUsername: 'me' },
            config: {},
          },
          rooms: { rooms: {}, usersSet: {} },
        } as never,
      }
    );

    // No real icon, no fallback - the hashed-initials circle stays, exactly
    // like a group chat with no icon set should.
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('GR')).toBeTruthy();
  });
});
