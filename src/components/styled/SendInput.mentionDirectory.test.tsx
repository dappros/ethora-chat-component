import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import { setUser } from '../../roomStore/chatSettingsSlice';
import SendInput from './SendInput';

vi.mock('../../hooks/usePdfThumbnail', () => ({
  usePdfThumbnail: () => ({ status: 'idle', retry: () => undefined }),
}));
const getRoom = vi.hoisted(() => vi.fn().mockResolvedValue(null));
vi.mock('../../networking/api-requests/rooms.api', () => ({ getRoomByName: getRoom }));
const dir = vi.hoisted(() => ({
  members: [] as any[],
  state: 'idle' as string,
  ensure: vi.fn(),
}));
vi.mock('../../helpers/userResolver', () => ({
  ensureRoomDirectory: (...a: unknown[]) => dir.ensure(...a),
  getRoomDirectoryMembers: () => dir.members,
  getRoomDirectoryState: () => dir.state,
  subscribeUserResolver: () => () => {},
}));

const JID = 'big@conference.example.com';

const setup = (usersCnt: number, options: { token?: string; empty?: boolean } = {}) => {
  const sendMessage = vi.fn();
  const { container, store } = renderWithProviders(
    <SendInput sendMessage={sendMessage} sendMedia={vi.fn()} isLoading={false} multiline />,
    {
      preloadedState: {
        chatSettingStore: { config: {}, user: { xmppUsername: 'me', token: options.token } },
        rooms: {
          rooms: {
            [JID]: {
              jid: JID,
              name: 'Big',
              title: 'Big',
              usersCnt,
              members: options.empty ? [] : [
                { _id: '1', firstName: 'Ann', lastName: 'Known', xmppUsername: 'ann' },
              ],
              messages: [],
              isLoading: false,
              roomBg: null,
            },
          },
          activeRoomJID: JID,
          drafts: {},
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
  return { textarea: container.querySelector('textarea') as HTMLTextAreaElement, store, sendMessage };
};

const typeAt = (ta: HTMLTextAreaElement, value: string) => {
  fireEvent.change(ta, { target: { value, selectionStart: value.length, selectionEnd: value.length } });
};

describe('SendInput @mentions in a truncated big room', () => {
  beforeEach(() => {
    dir.members = [];
    dir.state = 'idle';
    dir.ensure.mockReset();
    getRoom.mockClear();
  });

  it('does not load a directory until @ is typed', () => {
    setup(435);
    expect(dir.ensure).not.toHaveBeenCalled();
  });

  it('loads the directory on @ and shows a loading row next to known members', () => {
    dir.state = 'loading';
    const { textarea: ta } = setup(435);
    typeAt(ta, '@');
    expect(dir.ensure).toHaveBeenCalledWith(JID);
    expect(screen.getByText('Ann Known')).toBeTruthy();
    expect(screen.getByText('Loading more people...')).toBeTruthy();
  });

  it('finds directory users beyond the first members', () => {
    dir.state = 'done';
    dir.members = [
      { _id: '9', firstName: 'Zed', lastName: 'Faraway', xmppUsername: 'zed' },
    ];
    const { textarea: ta } = setup(435);
    typeAt(ta, '@');
    typeAt(ta, '@zed');
    expect(screen.getByText('Zed Faraway')).toBeTruthy();
  });

  it('does not load a directory for a complete room', () => {
    const { textarea: ta } = setup(1);
    typeAt(ta, '@');
    expect(dir.ensure).not.toHaveBeenCalled();
  });
});

describe('SendInput member lookup authentication', () => {
  beforeEach(() => { getRoom.mockReset().mockResolvedValue(null); });

  it('does not request room members without an API token', () => {
    setup(0, { empty: true });
    expect(getRoom).not.toHaveBeenCalled();
  });

  it('requests members when a token becomes available', async () => {
    const { store } = setup(0, { empty: true });
    expect(getRoom).not.toHaveBeenCalled();
    act(() => { store.dispatch(setUser({ xmppUsername: 'me', token: 'valid-token' } as never)); });
    await waitFor(() => expect(getRoom).toHaveBeenCalledTimes(1));
    expect(getRoom).toHaveBeenCalledWith('big');
  });

  it('loads a member with a token and sends a selected mention', async () => {
    getRoom.mockResolvedValue({ members: [
      { _id: '1', firstName: 'Ann', lastName: 'Known', xmppUsername: 'ann' },
    ] });
    const { textarea, sendMessage } = setup(0, { token: 'valid-token', empty: true });
    await waitFor(() => expect(getRoom).toHaveBeenCalledWith('big'));
    typeAt(textarea, '@');
    fireEvent.mouseDown(await screen.findByText('Ann Known'));
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1));
    expect(sendMessage.mock.calls[0][0]).toContain('@Ann Known');
    expect(sendMessage.mock.calls[0][1]).toEqual(expect.arrayContaining([
      expect.objectContaining({ jid: expect.stringContaining('ann') }),
    ]));
  });
});
