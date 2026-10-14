import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import { Message } from './Message';
import { IAttachment, IMessage, IRoom } from '../../types/types';

vi.mock('../../context/xmppProvider', () => ({
  useXmppClient: () => ({ client: { sendMessageReactionStanza: vi.fn() } }),
}));

const ROOM_JID = 'room1@conference.example.com';
const SENDER_ID = '646cc8dc96d4a4dc8f7b2f2d_6ab3a116d1f5c231da4c84fd';
const OWN_ID = '646cc8dc96d4a4dc8f7b2f2e_6ab3a116d1f5c231da4c84fe';

const emittedCss = () =>
  Array.from(document.querySelectorAll('style'))
    .map((style) => style.textContent ?? '')
    .join('')
    .replace(/\s+/g, '');

/** Declarations of every styled class carried by `el`, joined for matching. */
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

const image = (n: number): IAttachment => ({
  location: `https://files.example/${n}.png`,
  mimetype: 'image/png',
  originalName: `photo-${n}.png`,
  width: 1600,
  height: 900,
});
const video: IAttachment = {
  location: 'https://files.example/v.mp4',
  mimetype: 'video/mp4',
  originalName: 'clip.mp4',
};
const pdf: IAttachment = {
  location: 'https://files.example/doc.pdf',
  mimetype: 'application/pdf',
  originalName: 'doc.pdf',
  size: '331469',
};

const makeMessage = (overrides: Partial<IMessage> = {}): IMessage =>
  ({
    id: 'm1',
    body: 'hello',
    date: new Date('2026-10-14T12:53:00').toISOString(),
    roomJid: ROOM_JID,
    user: { id: SENDER_ID },
    ...overrides,
  }) as IMessage;

const mediaMessage = (attachments: IAttachment[], overrides: Partial<IMessage> = {}) =>
  makeMessage({
    isMediafile: 'true',
    attachments,
    mimetype: attachments[0]?.mimetype,
    location: attachments[0]?.location,
    ...overrides,
  });

const makeRoom = (): IRoom =>
  ({
    jid: ROOM_JID,
    name: 'room1',
    title: 'Room 1',
    usersCnt: 0,
    messages: [],
    isLoading: false,
    roomBg: null,
  }) as IRoom;

function renderBubble(message: IMessage, isUser = false) {
  return renderWithProviders(
    <Message message={message} isUser={isUser} isReply={false} />,
    {
      preloadedState: {
        chatSettingStore: { user: { xmppUsername: 'me' }, config: {} } as any,
        rooms: { rooms: { [ROOM_JID]: makeRoom() }, usersSet: {} } as any,
      },
    }
  );
}

const bubble = () => document.querySelector('[data-ethora-bubble]') as HTMLElement;

/** The time element: the innermost span that carries the clock text. */
const timeEl = () =>
  Array.from(bubble().querySelectorAll('span')).find((el) =>
    /\d{1,2}:\d{2}/.test(el.textContent ?? '')
  ) as HTMLElement;

describe('Message bubble padding', () => {
  it('gives a text bubble one visual inset on every side (own: 10px)', () => {
    renderBubble(makeMessage(), true);
    expect(declarationsFor(bubble())).toContain('padding:10px');
  });

  it('nets the 1px border off a text bubble from someone else, keeping 10px visual', () => {
    renderBubble(makeMessage(), false);
    const css = declarationsFor(bubble());
    expect(css).toContain('padding:9px');
    expect(css).toContain('border:1pxsolid');
  });

  it('uses the compact 6px inset on every side of a media bubble (own)', () => {
    renderBubble(mediaMessage([image(1)]), true);
    expect(declarationsFor(bubble())).toContain('padding:6px');
  });

  it('keeps the media bubble inset at 6px visual from someone else (5px + 1px border)', () => {
    renderBubble(mediaMessage([image(1), image(2)]), false);
    const css = declarationsFor(bubble());
    expect(css).toContain('padding:5px');
    expect(css).not.toContain('padding:6px');
  });

  it('never uses the old horizontal 16px padding on a media bubble', () => {
    renderBubble(mediaMessage([image(1), pdf]), false);
    expect(declarationsFor(bubble())).not.toMatch(/padding:\d+px 16px/);
  });
});

describe('Message bubble time placement', () => {
  it('floats the time as a glass pill over a media-only solo picture', () => {
    renderBubble(mediaMessage([image(1)]), true);
    expect(declarationsFor(timeEl())).toContain('position:absolute');
    expect(declarationsFor(timeEl())).toContain('rgba(0,0,0,0.45)');
    expect(declarationsFor(bubble())).toContain('width:fit-content');
  });

  it('floats the time over an album of pictures with no caption or cards', () => {
    renderBubble(mediaMessage([image(1), image(2), video]), true);
    expect(declarationsFor(timeEl())).toContain('position:absolute');
  });

  it('keeps the normal bottom row when the bubble has file cards', () => {
    renderBubble(mediaMessage([image(1), pdf]), true);
    const css = declarationsFor(timeEl());
    expect(css).not.toContain('position:absolute');
    expect(css).toContain('margin-top:4px');
  });

  it('keeps the normal bottom row for a lone document', () => {
    renderBubble(mediaMessage([pdf]), true);
    expect(declarationsFor(timeEl())).not.toContain('position:absolute');
  });
});

describe('Message media bubble and the PDF card', () => {
  it('shows the PDF size without any page count', () => {
    renderBubble(mediaMessage([pdf]), true);
    expect(screen.getByText('323.7 KB')).toBeTruthy();
    expect(screen.queryByText(/\bpages?\b/i)).toBeNull();
  });
});
