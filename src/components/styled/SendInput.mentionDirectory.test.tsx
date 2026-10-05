import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import SendInput from './SendInput';

vi.mock('../../hooks/usePdfThumbnail', () => ({
  usePdfThumbnail: () => ({ status: 'idle', retry: () => undefined }),
}));
vi.mock('../../networking/api-requests/rooms.api', () => ({
  getRoomByName: () => Promise.resolve(null),
}));
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

const setup = (usersCnt: number) => {
  const { container } = renderWithProviders(
    <SendInput sendMessage={vi.fn()} sendMedia={vi.fn()} isLoading={false} multiline />,
    {
      preloadedState: {
        chatSettingStore: { config: {}, user: { xmppUsername: 'me' } },
        rooms: {
          rooms: {
            [JID]: {
              jid: JID,
              name: 'Big',
              title: 'Big',
              usersCnt,
              members: [
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
  return container.querySelector('textarea') as HTMLTextAreaElement;
};

const typeAt = (ta: HTMLTextAreaElement, value: string) => {
  fireEvent.change(ta, { target: { value, selectionStart: value.length, selectionEnd: value.length } });
};

describe('SendInput @mentions in a truncated big room', () => {
  beforeEach(() => {
    dir.members = [];
    dir.state = 'idle';
    dir.ensure.mockReset();
  });

  it('does not load a directory until @ is typed', () => {
    setup(435);
    expect(dir.ensure).not.toHaveBeenCalled();
  });

  it('loads the directory on @ and shows a loading row next to known members', () => {
    dir.state = 'loading';
    const ta = setup(435);
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
    const ta = setup(435);
    typeAt(ta, '@');
    typeAt(ta, '@zed');
    expect(screen.getByText('Zed Faraway')).toBeTruthy();
  });

  it('does not load a directory for a complete room', () => {
    const ta = setup(1);
    typeAt(ta, '@');
    expect(dir.ensure).not.toHaveBeenCalled();
  });
});
