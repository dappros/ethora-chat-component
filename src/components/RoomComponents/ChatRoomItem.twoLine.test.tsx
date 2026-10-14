import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import ChatRoomItem from './ChatRoomItem';
import { renderWithProviders } from '../../test/renderWithProviders';
import { IRoom } from '../../types/types';

const ROOM_JID = 'abc_room@conference.xmpp.example.com';

const msg = (over: Record<string, unknown> = {}) => ({
  id: 'm1',
  roomJid: ROOM_JID,
  body: 'see you at nine',
  date: '2026-10-14T08:09:04.464Z',
  user: { id: 'u1_peer', name: 'Alice Smith' },
  ...over,
});

const room = (last: unknown): IRoom =>
  ({
    jid: ROOM_JID,
    title: 'Team',
    name: 'Team',
    messages: [],
    lastMessage: last,
  }) as unknown as IRoom;

const draw = (last: unknown) =>
  renderWithProviders(
    <ChatRoomItem
      chat={room(last)}
      isChatActive={false}
      performClick={() => {}}
      config={{} as never}
    />,
    {
      preloadedState: {
        chatSettingStore: {
          user: { xmppUsername: 'me_self', fileToken: 'TOK' },
          config: {},
        },
      } as never,
    }
  );

describe('ChatRoomItem two-line last message', () => {
  it('renders the sender on line 1 and the message on line 2', () => {
    draw(msg());
    const block = screen.getByTestId('last-message-block');
    expect(within(block).getByTestId('last-message-name').textContent).toBe(
      'Alice Smith'
    );
    expect(within(block).getByTestId('last-message-line').textContent).toBe(
      'see you at nine'
    );
    const kids = Array.from(block.children);
    expect(kids.map((k) => k.getAttribute('data-testid'))).toEqual([
      'last-message-name',
      'last-message-line',
    ]);
  });

  it('a long sender name stays on one line and truncates with an ellipsis', () => {
    const long = 'Bartholomew Maximilian Featherstonehaugh-Cholmondeley';
    draw(msg({ user: { id: 'u1_peer', name: long } }));
    const name = screen.getByTestId('last-message-name');
    expect(name.textContent).toBe(long);
    const css = getComputedStyle(name);
    expect(css.whiteSpace).toBe('nowrap');
    expect(css.overflow).toBe('hidden');
    expect(css.textOverflow).toBe('ellipsis');
  });

  it('shows "You" for the viewer own message', () => {
    draw(msg({ user: { id: 'me_self@xmpp.example.com', name: 'Me Myself' } }));
    expect(screen.getByTestId('last-message-name').textContent).toBe('You');
  });

  it('omits line 1 when the sender is unknown (opaque id only)', () => {
    draw(
      msg({
        user: {
          id: '646cc8dc96d4a4dc8f7b2f2d_6ab3bdf50708e7041e0f8b96',
          name: '',
        },
      })
    );
    expect(screen.queryByTestId('last-message-name')).toBeNull();
    expect(screen.getByTestId('last-message-line').textContent).toBe(
      'see you at nine'
    );
  });

  it('uses the part before @ when only an email is known', () => {
    draw(msg({ user: { id: 'u1_peer', name: 'randomroman@gmail.com' } }));
    expect(screen.getByTestId('last-message-name').textContent).toBe(
      'randomroman'
    );
  });

  it('media preview sits on line 2 under the sender', () => {
    draw(
      msg({
        body: 'media',
        isMediafile: 'true',
        mimetype: 'audio/mp4',
        originalName: 'voice.m4a',
        location: 'https://files.example.com/v.m4a',
      })
    );
    const block = screen.getByTestId('last-message-media');
    expect(within(block).getByTestId('last-message-name').textContent).toBe(
      'Alice Smith'
    );
    expect(
      within(block).getByTestId('last-message-line').textContent
    ).toContain('Voice message');
  });

  it('deleted message: name on line 1, italic "Message deleted" on line 2', () => {
    draw(msg({ isDeleted: true }));
    expect(screen.getByTestId('last-message-name').textContent).toBe(
      'Alice Smith'
    );
    const line = screen.getByTestId('last-message-line');
    expect(line.textContent).toBe('Message deleted');
    expect(getComputedStyle(line).fontStyle).toBe('italic');
  });

  it('every kind of last message gets the same card, block and line height', () => {
    const kinds: Record<string, unknown> = {
      text: msg(),
      emoji: msg({ emoji: '1f600', body: 'x' }),
      photo: msg({
        body: 'media',
        isMediafile: 'true',
        mimetype: 'image/png',
        originalName: 'a.png',
        location: 'https://files.example.com/a.png',
        locationPreview: 'https://files.example.com/a-s.png',
      }),
      video: msg({
        body: 'media',
        isMediafile: 'true',
        mimetype: 'video/mp4',
        originalName: 'a.mp4',
        location: 'https://files.example.com/a.mp4',
      }),
      voice: msg({
        body: 'media',
        isMediafile: 'true',
        mimetype: 'audio/mp4',
        originalName: 'voice.m4a',
        location: 'https://files.example.com/v.m4a',
      }),
      deleted: msg({ isDeleted: true }),
      noSender: msg({ user: { id: '646cc8dc96d4a4dc8f7b2f2d_6ab3bdf50708e7041e0f8b96', name: '' } }),
    };
    const seen = new Set<string>();
    for (const [kind, last] of Object.entries(kinds)) {
      const { unmount } = draw(last);
      const row = screen.getByTestId('room_row');
      const block = row.querySelector(
        '[data-testid="last-message-block"], [data-testid="last-message-media"]'
      ) as HTMLElement;
      const lineEl = row.querySelector('[data-testid="last-message-line"]') as HTMLElement;
      seen.add(
        [
          getComputedStyle(row).height,
          getComputedStyle(block).height,
          kind === 'photo' || kind === 'video' || kind === 'voice'
            ? getComputedStyle(lineEl).height
            : getComputedStyle(lineEl).lineHeight,
        ].join('|')
      );
      unmount();
    }
    expect(seen.size).toBe(1);
    expect(Array.from(seen)[0].startsWith('76px|36px|18px')).toBe(true);
  });
});
