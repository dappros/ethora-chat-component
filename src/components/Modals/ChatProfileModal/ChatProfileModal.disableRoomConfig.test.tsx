import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../../test/renderWithProviders';

// The panel only needs a client for the avatar stanzas, which this test
// never triggers.
vi.mock('../../../context/xmppProvider', () => ({
  useXmppClient: () => ({
    client: { setRoomImageStanza: vi.fn() },
    setClient: vi.fn(),
  }),
}));

import ChatProfileModal from './ChatProfileModal';

const ROOM_JID = 'room_1@conference.example.com';

const MEMBERS = [
  { xmppUsername: 'me_1', firstName: 'Ada', lastName: 'Lovelace', role: 'moderator' },
  { xmppUsername: 'peer_1', firstName: 'Alan', lastName: 'Turing', role: 'participant' },
];

const renderPanel = (config: Record<string, unknown>) =>
  renderWithProviders(<ChatProfileModal handleCloseModal={vi.fn()} />, {
    preloadedState: {
      chatSettingStore: {
        config,
        user: { xmppUsername: 'me_1', fileToken: '' },
      },
      rooms: {
        rooms: {
          [ROOM_JID]: {
            jid: ROOM_JID,
            name: 'Design team',
            title: 'Design team',
            type: 'group',
            role: 'moderator',
            icon: 'https://acme.test/room.png',
            usersCnt: 2,
            members: MEMBERS,
            messages: [],
          },
        },
        activeRoomJID: ROOM_JID,
        usersSet: {},
        presenceByRoom: {},
      },
    } as any,
  });

// The avatar's edit affordance is the hidden <input type="file"> that the
// overlay clicks; the remove affordance is the "x" button on the avatar.
const avatarUploadInput = () =>
  document.querySelector('#avatar-file-input');

describe('ChatProfileModal with config.disableRoomConfig', () => {
  it('offers every room-mutating control by default', () => {
    renderPanel({});

    expect(avatarUploadInput()).toBeTruthy();
    expect(screen.getAllByText('Add more Users').length).toBeGreaterThan(0);
    expect(screen.getAllByText('More Options').length).toBeGreaterThan(0);
  });

  it('hides the room avatar upload when set', () => {
    renderPanel({ disableRoomConfig: true });

    expect(avatarUploadInput()).toBeNull();
  });

  it('hides the add-members action when set', () => {
    renderPanel({ disableRoomConfig: true });

    expect(screen.queryByText('Add more Users')).toBeNull();
  });

  it('hides the per-member moderator menu when set', () => {
    renderPanel({ disableRoomConfig: true });

    expect(screen.queryByText('More Options')).toBeNull();
  });

  it('keeps the read-only room details visible', () => {
    renderPanel({ disableRoomConfig: true });

    expect(screen.getAllByText('Design team').length).toBeGreaterThan(0);
    expect(screen.getByText('Alan Turing')).toBeTruthy();
  });
});
