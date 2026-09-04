import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../../../test/renderWithProviders';
import ChatProfileModal from './ChatProfileModal';
import { RoomMember } from '../../../types/types';

vi.mock('../../../context/xmppProvider', () => ({
  useXmppClient: () => ({ client: {} }),
}));

// Avoid a real network call from useMyFiles (the Files section below the
// member list) - it's unrelated to what these tests exercise.
vi.mock('../../../networking/api-requests/files.api', () => ({
  getMyFiles: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  deleteMyFile: vi.fn().mockResolvedValue(undefined),
  getFilesEndpointSupport: () => 'unknown',
  subscribeFilesEndpointSupport: () => () => {},
}));

const makeMembers = (count: number): RoomMember[] =>
  Array.from({ length: count }, (_, i) => ({
    _id: `id${i}`,
    firstName: `First${i}`,
    lastName: `Last${i}`,
    xmppUsername: `user${i}@example.com`,
  }));

// useMyFiles kicks off an async fetch on mount (mocked above to resolve
// immediately); flushing it before assertions keeps these tests free of
// "not wrapped in act" noise from that unrelated Files section.
const renderModal = async (members: RoomMember[]) => {
  const result = renderWithProviders(<ChatProfileModal handleCloseModal={() => {}} />, {
    preloadedState: {
      chatSettingStore: {
        config: {},
        user: { xmppUsername: 'me', token: 't', fileToken: '' },
      } as any,
      rooms: {
        rooms: {
          'room1@conference.example.com': {
            jid: 'room1@conference.example.com',
            name: 'Big Room',
            title: 'Big Room',
            type: 'group',
            role: 'participant',
            members,
            messages: [],
            isLoading: false,
            roomBg: '',
            usersCnt: members.length,
          },
        },
        activeRoomJID: 'room1@conference.example.com',
        usersSet: {},
        presenceByRoom: {},
      } as any,
    },
  });
  await act(async () => {
    await Promise.resolve();
  });
  return result;
};

describe('ChatProfileModal - member list windowing', () => {
  it('only mounts the first window of member rows, not all ~3,000', async () => {
    await renderModal(makeMembers(3000));

    expect(screen.getByText('First0 Last0')).toBeTruthy();
    // The 150th row (index 149) is inside the initial window; the 151st
    // (index 150) is not mounted yet.
    expect(screen.getByText('First149 Last149')).toBeTruthy();
    expect(screen.queryByText('First150 Last150')).toBeNull();
  });

  it('"show more" grows the window without re-mounting the whole list at once', async () => {
    await renderModal(makeMembers(3000));

    expect(screen.queryByText('First150 Last150')).toBeNull();

    fireEvent.click(screen.getByText(/Show \d+ more/));

    expect(screen.getByText('First150 Last150')).toBeTruthy();
    expect(screen.getByText('First299 Last299')).toBeTruthy();
    expect(screen.queryByText('First300 Last300')).toBeNull();
  });
});

describe('ChatProfileModal - member search', () => {
  it('filters the full member list by name, not just the currently-windowed slice', async () => {
    // First199 only exists past the initial 150-row window - proves the
    // filter runs over the whole list, not visibleMembers.
    await renderModal(makeMembers(3000));

    fireEvent.change(screen.getByPlaceholderText('Search members'), {
      target: { value: 'First199' },
    });

    expect(screen.getByText('First199 Last199')).toBeTruthy();
    expect(screen.queryByText('First0 Last0')).toBeNull();
    expect(screen.queryByText('First150 Last150')).toBeNull();
  });

  it('is case-insensitive and matches on last name too', async () => {
    await renderModal(makeMembers(5));

    fireEvent.change(screen.getByPlaceholderText('Search members'), {
      target: { value: 'last3' },
    });

    expect(screen.getByText('First3 Last3')).toBeTruthy();
    expect(screen.queryByText('First0 Last0')).toBeNull();
  });

  it('resets the visible window when the query changes', async () => {
    await renderModal(makeMembers(3000));

    fireEvent.click(screen.getByText(/Show \d+ more/));
    expect(screen.getByText('First150 Last150')).toBeTruthy();

    // Narrow the query down to a single match - the stale 300-row window
    // from before must not leak into the filtered result. (2999 is the
    // highest index in this 3000-member fixture, so this substring is
    // unique - unlike e.g. "First1", which also matches First10, First100,
    // First1000, etc.)
    fireEvent.change(screen.getByPlaceholderText('Search members'), {
      target: { value: 'First2999' },
    });

    expect(screen.getByText('First2999 Last2999')).toBeTruthy();
    expect(screen.queryByText(/Show \d+ more/)).toBeNull();
  });
});
