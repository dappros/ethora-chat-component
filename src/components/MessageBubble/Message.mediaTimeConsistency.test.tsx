import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders } from '../../test/renderWithProviders';
import { Message } from './Message';
import { IAttachment, IMessage, IRoom } from '../../types/types';
import { getMediaTimeLayout } from '../../helpers/mediaBubble';

vi.mock('../../context/xmppProvider', () => ({
  useXmppClient: () => ({ client: { sendMessageReactionStanza: vi.fn() } }),
}));

const ROOM_JID = 'room1@conference.example.com';
const SENDER_ID = '646cc8dc96d4a4dc8f7b2f2d_6ab3a116d1f5c231da4c84fd';
const FILES = 'https://files.example.com/files';

const emittedCss = () =>
  Array.from(document.querySelectorAll('style'))
    .map((style) => style.textContent ?? '')
    .join('')
    .replace(/\s+/g, '');

const declarationsFor = (el: Element) => {
  const classes = el.className
    .toString()
    .split(' ')
    .filter((name) => name && !name.startsWith('sc-'));
  const decls: string[] = [];
  for (const cls of classes) {
    for (const match of emittedCss().matchAll(new RegExp(`\\.${cls}\\{([^}]*)\\}`, 'g'))) {
      decls.push(match[1]);
    }
  }
  return decls.join(';');
};

const photo = (n: number): IAttachment => ({
  location: `${FILES}/${n}.png`,
  mimetype: 'image/png',
  originalName: `photo-${n}.png`,
});

const album = [photo(1), photo(2)];

const makeMessage = (overrides: Partial<IMessage> = {}): IMessage =>
  ({
    id: 'm1',
    body: 'media',
    date: new Date('2026-10-14T15:28:00').toISOString(),
    roomJid: ROOM_JID,
    user: { id: SENDER_ID, firstName: 'Admin', lastName: 'User', name: 'Admin User' },
    isMediafile: 'true',
    attachments: album,
    mimetype: 'image/png',
    location: album[0].location,
    ...overrides,
  }) as IMessage;

const room = {
  jid: ROOM_JID,
  name: 'room1',
  title: 'Room 1',
  usersCnt: 0,
  messages: [],
  isLoading: false,
  roomBg: null,
} as unknown as IRoom;

function renderBubble(message: IMessage, isUser = false, config: object = {}) {
  return renderWithProviders(
    <Message message={message} isUser={isUser} isReply={false} />,
    {
      preloadedState: {
        chatSettingStore: { user: { xmppUsername: 'me' }, config } as any,
        rooms: { rooms: { [ROOM_JID]: room }, usersSet: {} } as any,
      },
    }
  );
}

const bubble = () => document.querySelector('[data-ethora-bubble]') as HTMLElement;
const timeEl = () =>
  Array.from(bubble().querySelectorAll('span')).find((el) =>
    /\d{1,2}:\d{2}/.test(el.textContent ?? '')
  ) as HTMLElement;

/** The time is the glass pill over the media and nothing reserves a row. */
const expectOverlay = () => {
  expect(bubble().getAttribute('data-time-mode')).toBe('overlay');
  const css = declarationsFor(timeEl());
  expect(css).toContain('position:absolute');
  expect(css).not.toContain('padding:08px4px');
  expect(declarationsFor(bubble())).not.toMatch(/padding-bottom/);
  expect(bubble().querySelector('[data-testid="media-caption"]')).toBeNull();
};

const expectRow = () => {
  expect(bubble().getAttribute('data-time-mode')).toBe('row');
  expect(declarationsFor(timeEl())).not.toContain('position:absolute');
};

describe('one time rule for media-only bubbles', () => {
  const shapes: Array<[string, Partial<IMessage>]> = [
    ['current multi-attachment format', {}],
    [
      'body is the file URL (legacy echo, the preview-card trigger)',
      { body: `${FILES}/1.png` },
    ],
    [
      'body is a URL with a query string for the same file',
      { body: `${FILES}/1.png?token=abc123` },
    ],
    ['body is the file name', { body: 'photo-1.png' }],
    ['body is the sender name', { body: 'Admin User' }],
    ['body is whitespace', { body: '   ' }],
    ['body is empty', { body: '' }],
    ['body is "Media" in another case', { body: 'Media' }],
    [
      'legacy comma separated flat fields',
      {
        attachments: undefined,
        location: `${FILES}/a.jpg,${FILES}/b.png`,
        locationPreview: `${FILES}/a-s.jpg,${FILES}/b-s.png`,
        mimetype: 'image/jpeg,image/png',
        originalName: 'a.jpg,b.png',
      },
    ],
    [
      'attachments without a mimetype (kind read from the name)',
      {
        attachments: [
          { location: `${FILES}/a.jpg`, originalName: 'a.jpg' },
          { location: `${FILES}/b.png`, originalName: 'b.png' },
        ] as IAttachment[],
      },
    ],
    [
      'octet-stream mimetype on named pictures',
      {
        attachments: [
          { location: `${FILES}/a.jpg`, mimetype: 'application/octet-stream' },
          { location: `${FILES}/b.png`, mimetype: 'application/octet-stream' },
        ] as IAttachment[],
      },
    ],
    [
      'with reactions',
      { reaction: { u1: { emoji: ['👍'], data: { firstName: 'A', lastName: 'B' } } } as any },
    ],
    ['edited', { isEdited: true } as any],
    ['solo picture', { attachments: [photo(1)] }],
  ];

  for (const isUser of [false, true]) {
    for (const [name, overrides] of shapes) {
      it(`${isUser ? 'own' : 'others'}: ${name}`, () => {
        renderBubble(makeMessage(overrides), isUser);
        expectOverlay();
      });
    }
  }

  it('group chat with the sender header still overlays', () => {
    renderBubble(makeMessage(), false);
    expect(bubble().textContent).toContain('Admin User');
    expectOverlay();
  });

  it('shows no URL preview card from a body that merely echoes the file', () => {
    renderBubble(makeMessage({ body: `${FILES}/1.png` }), false);
    expect(bubble().querySelector('a[href^="https://files.example.com"]')).toBeNull();
    expectOverlay();
  });

  it('manual translate mode adds no row to a caption-less album', () => {
    renderBubble(makeMessage(), false, {
      translates: { enabled: true, mode: 'manual' },
    });
    expectOverlay();
  });

  it('optimistic upload then delivered: the same overlay both times', () => {
    const optimistic = makeMessage({
      id: 'local-1',
      attachments: album.map((a) => ({
        ...a,
        location: '',
        localUrl: 'blob:http://localhost/x',
        uploadStatus: 'uploading',
        uploadProgress: 40,
      })) as IAttachment[],
      pending: true,
    } as any);
    const view = renderBubble(optimistic, true);
    expectOverlay();
    view.unmount();
    renderBubble(makeMessage({ id: 'local-1' }), true);
    expectOverlay();
  });
});

describe('everything else keeps the normal bottom right row', () => {
  it('a caption', () => {
    renderBubble(makeMessage({ caption: 'Look at this' }), false);
    expectRow();
  });

  it('a legacy body caption', () => {
    renderBubble(makeMessage({ body: 'two shots' }), false);
    expectRow();
  });

  it('a file card', () => {
    renderBubble(
      makeMessage({
        attachments: [
          ...album,
          { location: `${FILES}/d.pdf`, mimetype: 'application/pdf', originalName: 'd.pdf' },
        ],
      }),
      false
    );
    expectRow();
  });

  it('a voice note', () => {
    renderBubble(
      makeMessage({
        attachments: [
          ...album,
          { location: `${FILES}/v.mp3`, mimetype: 'audio/mpeg', originalName: 'v.mp3' },
        ],
      }),
      false
    );
    expectRow();
  });

  it('a failed own message', () => {
    renderBubble(makeMessage({ failed: true } as any), true, {});
    expect(bubble().getAttribute('data-time-mode')).toBe('row');
  });
});

describe('getMediaTimeLayout', () => {
  const base = { attachments: album, hasCaption: false };
  it('is the single rule: media-only overlays, any blocker or text means row', () => {
    expect(getMediaTimeLayout(base)).toEqual({ mediaOnly: true, mode: 'overlay' });
    expect(getMediaTimeLayout({ ...base, hasCaption: true }).mode).toBe('row');
    expect(getMediaTimeLayout({ ...base, failed: true }).mode).toBe('row');
    expect(getMediaTimeLayout({ ...base, hasQuickReplies: true }).mode).toBe('row');
    expect(getMediaTimeLayout({ ...base, hasUrlPreview: true }).mode).toBe('row');
    expect(getMediaTimeLayout({ ...base, hasTranslateRow: true }).mode).toBe('row');
    expect(getMediaTimeLayout({ attachments: [], hasCaption: false }).mode).toBe('row');
  });
});
