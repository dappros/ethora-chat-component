import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../../../test/renderWithProviders';
import ChatProfileModal from './ChatProfileModal';
import { RoomMember } from '../../../types/types';

vi.mock('../../../context/xmppProvider', () => ({
  useXmppClient: () => ({ client: {} }),
}));
vi.mock('../../../networking/api-requests/files.api', () => ({
  getMyFiles: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  deleteMyFile: vi.fn().mockResolvedValue(undefined),
  getFilesEndpointSupport: () => 'unknown',
  subscribeFilesEndpointSupport: () => () => {},
}));

const dir = vi.hoisted(() => ({
  members: [] as any[],
  state: 'idle' as string,
  ensure: vi.fn(),
}));
vi.mock('../../../helpers/userResolver', () => ({
  ensureRoomDirectory: (...a: unknown[]) => dir.ensure(...a),
  getRoomDirectoryMembers: () => dir.members,
  getRoomDirectoryState: () => dir.state,
  subscribeUserResolver: () => () => {},
}));

const JID = 'room1@conference.example.com';
const mk = (from: number, to: number): RoomMember[] =>
  Array.from({ length: to - from }, (_, i) => ({
    _id: `id${from + i}`,
    firstName: `First${from + i}`,
    lastName: `Last${from + i}`,
    xmppUsername: `user${from + i}`,
  }));

const renderModal = async (members: RoomMember[], usersCnt: number) => {
  const r = renderWithProviders(<ChatProfileModal handleCloseModal={() => {}} />, {
    preloadedState: {
      chatSettingStore: {
        config: {},
        user: { xmppUsername: 'me', token: 't', fileToken: '' },
      } as any,
      rooms: {
        rooms: {
          [JID]: {
            jid: JID,
            name: 'Big Room',
            title: 'Big Room',
            type: 'public',
            role: 'participant',
            members,
            messages: [],
            isLoading: false,
            roomBg: '',
            usersCnt,
          },
        },
        activeRoomJID: JID,
        usersSet: {},
        presenceByRoom: {},
      } as any,
    },
  });
  await act(async () => {
    await Promise.resolve();
  });
  return r;
};

describe('ChatProfileModal on a truncated big room', () => {
  beforeEach(() => {
    dir.members = [];
    dir.state = 'idle';
    dir.ensure.mockReset();
  });

  it('shows usersCnt in the member count and loads the directory', async () => {
    dir.state = 'loading';
    await renderModal(mk(0, 30), 435);
    expect(screen.getByText(/435/)).toBeTruthy();
    expect(dir.ensure).toHaveBeenCalledWith(JID);
    expect(screen.getByText('Loading all members...')).toBeTruthy();
  });

  it('lists directory members after the known ones, deduplicated, windowed', async () => {
    // directory repeats the first 30 and adds 405 more
    dir.members = mk(0, 435);
    dir.state = 'done';
    await renderModal(mk(0, 30), 435);
    expect(screen.getByText('First0 Last0')).toBeTruthy();
    expect(screen.getAllByText('First0 Last0')).toHaveLength(1);
    expect(screen.getByText('First149 Last149')).toBeTruthy();
    // 435 rows never mount at once
    expect(screen.queryByText('First150 Last150')).toBeNull();
    fireEvent.click(screen.getByText(/Show \d+ more/));
    expect(screen.getByText('First150 Last150')).toBeTruthy();
  });

  it('search runs over the directory, beyond the first 30', async () => {
    dir.members = mk(0, 435);
    dir.state = 'done';
    await renderModal(mk(0, 30), 435);
    fireEvent.change(screen.getByPlaceholderText('Search members'), {
      target: { value: 'First400' },
    });
    expect(screen.getByText('First400 Last400')).toBeTruthy();
    expect(screen.queryByText('First0 Last0')).toBeNull();
  });

  it('renders unique rows with no key warning for a duplicated directory, search has no ghost rows', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // real shape: 435 unique + repeats of the first rows
    dir.members = [...mk(0, 435), ...mk(0, 11), ...mk(0, 3), ...mk(0, 1)];
    dir.state = 'done';
    await renderModal(mk(0, 30), 435);
    const rowCount = () => screen.queryAllByText(/^First\d+ Last\d+$/).length;
    for (let i = 0; i < 6 && screen.queryByText(/Show \d+ more/); i++) {
      fireEvent.click(screen.getByText(/Show \d+ more/));
    }
    expect(rowCount()).toBe(435);
    const search = screen.getByPlaceholderText('Search members');
    fireEvent.change(search, { target: { value: 'zzzzqq' } });
    expect(rowCount()).toBe(0);
    fireEvent.change(search, { target: { value: 'First434' } });
    expect(rowCount()).toBe(1);
    fireEvent.change(search, { target: { value: '' } });
    for (let i = 0; i < 6 && screen.queryByText(/Show \d+ more/); i++) {
      fireEvent.click(screen.getByText(/Show \d+ more/));
    }
    expect(rowCount()).toBe(435);
    const keyWarn = errSpy.mock.calls.some((c) =>
      String(c[0]).includes('same key')
    );
    errSpy.mockRestore();
    expect(keyWarn).toBe(false);
  });

  it('does not load a directory for a complete room', async () => {
    await renderModal(mk(0, 5), 5);
    expect(dir.ensure).not.toHaveBeenCalled();
  });
});
