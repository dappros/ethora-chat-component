import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import { Message } from './Message';
import { IAttachment, IMessage, IRoom } from '../../types/types';
import { MessageContainer } from '../MainComponents/MessageContainer';
import {
  TIME_BASELINE_NUDGE_PX,
  REACTION_CLEAR_PX,
  REACTION_HANG_PX,
  RUN_GAP_PX,
  SENDER_GAP_PX,
} from '../styled/StyledComponents';

vi.mock('../../context/xmppProvider', () => ({
  useXmppClient: () => ({ client: { sendMessageReactionStanza: vi.fn() } }),
}));

const ROOM_JID = 'room1@conference.example.com';
const SENDER_ID = '646cc8dc96d4a4dc8f7b2f2d_6ab3a116d1f5c231da4c84fd';
const OWN_ID = '646cc8dc96d4a4dc8f7b2f2e_6ab3a116d1f5c231da4c84fe';

/** Every emitted rule, whitespace removed, so declarations match literally. */
const emittedCss = () =>
  Array.from(document.querySelectorAll('style'))
    .map((style) => style.textContent ?? '')
    .join('')
    .replace(/\s+/g, '');

const classesOf = (el: Element) =>
  el.className
    .toString()
    .split(' ')
    .filter((name) => name && !name.startsWith('sc-'));

/** Declarations of the element's own styled class (base rule only). */
const declarationsFor = (el: Element) =>
  classesOf(el)
    .flatMap((cls) =>
      Array.from(emittedCss().matchAll(new RegExp(`\\.${cls}\\{([^}]*)\\}`, 'g'))).map(
        (m) => m[1]
      )
    )
    .join(';');

/** Declarations of one pseudo-element rule of the element, e.g. '::after'. */
const pseudoFor = (el: Element, pseudo: string) =>
  classesOf(el)
    .flatMap((cls) =>
      Array.from(
        emittedCss().matchAll(new RegExp(`\\.${cls}${pseudo}\\{([^}]*)\\}`, 'g'))
      ).map((m) => m[1])
    )
    .join(';');

const image = (n: number): IAttachment => ({
  location: `https://files.example/${n}.png`,
  mimetype: 'image/png',
  originalName: `photo-${n}.png`,
  width: 1600,
  height: 900,
});

const makeMessage = (overrides: Partial<IMessage> = {}): IMessage =>
  ({
    id: 'm1',
    body: 'hello',
    date: new Date('2026-10-14T12:46:00').toISOString(),
    roomJid: ROOM_JID,
    user: { id: SENDER_ID },
    ...overrides,
  }) as IMessage;

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

const reactions = {
  bob: {
    emoji: ['+1'],
    data: { senderFirstName: 'Bob', senderLastName: 'Lee' },
  },
  ann: {
    emoji: ['heart'],
    data: { senderFirstName: 'Ann', senderLastName: 'Kim' },
  },
} as unknown as IMessage['reaction'];

const renderBubble = (message: IMessage, isUser = false, isLastInGroup?: boolean) =>
  renderWithProviders(
    <Message
      message={message}
      isUser={isUser}
      isReply={false}
      isLastInGroup={isLastInGroup}
    />,
    {
      preloadedState: {
        chatSettingStore: { user: { xmppUsername: 'me' }, config: {} } as any,
        rooms: { rooms: { [ROOM_JID]: makeRoom() }, usersSet: {} } as any,
      },
    }
  );

const bubble = () => document.querySelector('[data-ethora-bubble]') as HTMLElement;
const rowOf = () => bubble().parentElement as HTMLElement;

const timeEl = () =>
  Array.from(bubble().querySelectorAll('span')).find((el) =>
    /\d{1,2}:\d{2}/.test(el.textContent ?? '')
  ) as HTMLElement;

describe('Message time side (bottom right for every bubble)', () => {
  it('puts the time at the end of a short own text, on the same line', () => {
    renderBubble(makeMessage(), true);
    const css = declarationsFor(timeEl());
    expect(css).toContain('align-self:flex-end');
    expect(css).toContain('margin-left:auto');
    expect(css).not.toContain('flex-start');
  });

  it('puts the time at the end of a short text from someone else, on the same line', () => {
    renderBubble(makeMessage(), false);
    const css = declarationsFor(timeEl());
    expect(css).toContain('align-self:flex-end');
    expect(css).toContain('margin-left:auto');
  });

  it('keeps the time inline with a short own text inside the text row', () => {
    renderBubble(makeMessage(), true);
    const row = timeEl().parentElement as HTMLElement;
    expect(row.getAttribute('style') ?? '').toContain('flex-wrap: wrap');
  });

  it('floats the glass pill on the bottom right of an own media-only picture', () => {
    renderBubble(
      makeMessage({ isMediafile: 'true', attachments: [image(1)], body: 'media' }),
      true
    );
    const css = declarationsFor(timeEl());
    expect(css).toContain('position:absolute');
    expect(css).toContain('right:14px');
    expect(css).not.toContain('left:14px');
  });

  it('puts the pill 13px in from the right for someone else (1px border)', () => {
    renderBubble(
      makeMessage({ isMediafile: 'true', attachments: [image(1)], body: 'media' }),
      false
    );
    const css = declarationsFor(timeEl());
    expect(css).toContain('right:13px');
  });
});

describe('Message time row alignment', () => {
  it('centres the time on one line box, with the tick in the same row', () => {
    renderBubble(makeMessage(), true);
    const css = declarationsFor(timeEl());
    expect(css).toContain('line-height:1');
    expect(css).toContain('align-items:center');
    expect(css).toContain(`margin-bottom:${TIME_BASELINE_NUDGE_PX}px`);
  });

  it('lifts the time only 2px, so it sits low in the bubble like Telegram/WhatsApp', () => {
    expect(TIME_BASELINE_NUDGE_PX).toBe(2);
  });

  it('gives a caption time row 2px of bottom padding (was 4px)', () => {
    renderBubble(
      makeMessage({ isMediafile: 'true', attachments: [image(1)], body: 'caption' }),
      true
    );
    const css = declarationsFor(timeEl());
    expect(css).toContain('padding:08px2px');
    expect(css).not.toContain('padding:08px4px');
  });

  it('sets the text row to flex-end so the time sits on the bottom line of the text', () => {
    renderBubble(makeMessage(), true);
    const row = timeEl().parentElement as HTMLElement;
    expect(row.getAttribute('style') ?? '').toContain('align-items: flex-end');
    expect(row.getAttribute('style') ?? '').not.toContain('last baseline');
  });

  it('draws the read tick at 14px for an own message', () => {
    renderBubble(makeMessage(), true);
    const ticks = Array.from(timeEl().querySelectorAll('svg'));
    expect(ticks.length).toBeGreaterThan(0);
    for (const tick of ticks) {
      expect(tick.getAttribute('width')).toBe('14');
      expect(tick.getAttribute('height')).toBe('14');
    }
  });
});

describe('Message bubble tail', () => {
  it('gives the last bubble of a run an own tail on the bottom right', () => {
    renderBubble(makeMessage(), true, true);
    const after = pseudoFor(bubble(), '::after');
    expect(after).toContain('right:-13px');
    expect(after).toContain('width:13px');
    expect(after).toContain('height:16px');
    expect(after).toContain('mask-image:url("data:image/svg+xml,');
    expect(after).toContain('-webkit-mask-image:');
    expect(after).toContain('mask-size:100%100%');
    expect(after).not.toContain('clip-path');
    expect(pseudoFor(bubble(), '::before')).toBe('');
    // The tail corner is square, so the tail grows out of the straight edge.
    expect(declarationsFor(bubble())).toContain('border-radius:18px18px0px18px');
  });

  it('gives the last bubble of a run from someone else a tail on the bottom left, with a border ring', () => {
    renderBubble(makeMessage(), false, true);
    const after = pseudoFor(bubble(), '::after');
    expect(after).toContain('left:-13px');
    expect(after).toContain('width:13px');
    expect(after).toContain('height:16px');
    expect(after).toContain('mask-image:url("data:image/svg+xml,');
    expect(after).not.toContain('clip-path');
    // The fill mask is a plain silhouette: no stroke in it.
    expect(after).not.toContain('stroke');
    // The outline is a second mask behind the fill: a stroke, 1px outside the fill edge.
    const ring = pseudoFor(bubble(), '::before');
    expect(ring).toContain('left:-14px');
    expect(ring).toContain('bottom:-2px');
    expect(ring).toContain('mask-image:url("data:image/svg+xml,');
    expect(ring).toContain('width:14px');
    expect(ring).toContain('height:18px');
    // Stroke only, never the whole silhouette: the wall side stays open.
    expect(ring).toContain('stroke-width');
    expect(ring).toContain('fill%3D%22none%22');
    expect(ring).not.toContain('clip-path');
    expect(declarationsFor(bubble())).toContain('border-radius:18px18px18px0px');
  });

  it('gives no tail to a bubble that is followed by the same sender', () => {
    renderBubble(makeMessage(), false, false);
    expect(pseudoFor(bubble(), '::after')).toBe('');
    expect(declarationsFor(bubble())).toContain('border-radius:18px18px18pxvar(--ethora-radius-sm,8px)');
  });

  it('gives no tail to a media-only picture, the picture would clash with it', () => {
    renderBubble(
      makeMessage({ isMediafile: 'true', attachments: [image(1)], body: 'media' }),
      false,
      true
    );
    expect(pseudoFor(bubble(), '::after')).toBe('');
  });

  it('keeps the tail on a bubble with a caption', () => {
    renderBubble(
      makeMessage({
        isMediafile: 'true',
        attachments: [image(1)],
        body: 'media',
        caption: 'hello',
      } as Partial<IMessage>),
      false,
      true
    );
    expect(pseudoFor(bubble(), '::after')).toContain('left:-13px');
  });

  it('gives no tail to a deleted tombstone', () => {
    renderBubble(makeMessage({ isDeleted: true } as Partial<IMessage>), false, true);
    expect(pseudoFor(bubble(), '::after')).toBe('');
  });

  it('gives no tail to a call log row, which is not a bubble', () => {
    renderBubble(
      makeMessage({ callLog: { status: 'missed' } as any } as Partial<IMessage>),
      false,
      true
    );
    expect(pseudoFor(bubble(), '::after')).toBe('');
  });

  it('keeps the reaction row on the left side, inset 8px, away from the tail', () => {
    renderBubble(makeMessage({ reaction: reactions } as Partial<IMessage>), true, true);
    expect(emittedCss()).toMatch(/\.[\w-]+>\.reaction-row\{[^}]*left:8px/);
    expect(emittedCss()).not.toMatch(/\.[\w-]+>\.reaction-row\{[^}]*right:8px/);
  });
});

describe('Message bottom spacing', () => {
  it('leaves an 8px gap under the last message before a different sender', () => {
    renderBubble(makeMessage(), false, true);
    expect(declarationsFor(rowOf())).toContain(`margin-bottom:${SENDER_GAP_PX}px`);
    expect(SENDER_GAP_PX).toBe(8);
  });

  it('leaves a 2px gap under a message that the same sender continues', () => {
    renderBubble(makeMessage(), false, false);
    expect(declarationsFor(rowOf())).toContain(`margin-bottom:${RUN_GAP_PX}px`);
    expect(RUN_GAP_PX).toBe(2);
  });

  it('has no top margin on the message row', () => {
    renderBubble(makeMessage(), false, true);
    expect(declarationsFor(rowOf())).toContain('margin:0');
  });

  it('reserves the 12px hang plus a 4px clear gap below a row with reactions', () => {
    renderBubble(makeMessage({ reaction: reactions } as Partial<IMessage>), false, true);
    expect(REACTION_HANG_PX).toBe(12);
    expect(REACTION_CLEAR_PX).toBe(4);
    expect(declarationsFor(rowOf())).toContain('margin-bottom:16px');
    expect(declarationsFor(rowOf())).not.toContain('margin-bottom:12px');
    expect(declarationsFor(bubble())).not.toContain('padding-bottom');
  });

  it('reserves 16px with reactions inside a run too, not the 2px run gap', () => {
    renderBubble(makeMessage({ reaction: reactions } as Partial<IMessage>), false, false);
    expect(declarationsFor(rowOf())).toContain('margin-bottom:16px');
    expect(declarationsFor(rowOf())).not.toContain(`margin-bottom:${RUN_GAP_PX}px`);
  });

  it('keeps the 8px sender gap and the 2px run gap when there are no reactions', () => {
    renderBubble(makeMessage(), false, true);
    expect(declarationsFor(rowOf())).toContain('margin-bottom:8px');
    expect(declarationsFor(rowOf())).not.toContain('z-index:1');
    cleanup();
    renderBubble(makeMessage(), false, false);
    expect(declarationsFor(rowOf())).toContain('margin-bottom:2px');
  });

  it('paints a row with reactions above the rows after it', () => {
    renderBubble(makeMessage({ reaction: reactions } as Partial<IMessage>), false, true);
    expect(declarationsFor(rowOf())).toContain('position:relative');
    expect(declarationsFor(rowOf())).toContain('z-index:1');
  });

  it('grows the reserve with the measured height of wrapped chip rows', () => {
    // Two chip rows: 24px + 4px gap + 24px = 52px tall, 40px hang below the bubble.
    const spy = vi
      .spyOn(HTMLElement.prototype, 'offsetHeight', 'get')
      .mockImplementation(function (this: HTMLElement) {
        return this.classList.contains('reaction-row') ? 52 : 0;
      });
    try {
      renderBubble(makeMessage({ reaction: reactions } as Partial<IMessage>), false, true);
      expect(declarationsFor(rowOf())).toContain('margin-bottom:44px');
    } finally {
      spy.mockRestore();
    }
  });

  it('gives the row a 6px side gutter so the tail is not clipped', () => {
    renderBubble(makeMessage(), true, true);
    // Host-tunable through --ethora-message-row-gutter; the default stays 6px.
    expect(declarationsFor(rowOf())).toContain('padding:0var(--ethora-message-row-gutter,6px)');
  });

  it('keeps 70% as the default text bubble width and 40px as the avatar size', () => {
    renderBubble(makeMessage(), false, true);
    expect(emittedCss()).toContain('max-width:var(--ethora-message-bubble-max-width,70%)');
    expect(emittedCss()).toContain('width:var(--ethora-message-avatar-size,40px)');
  });

  it('keeps the 5px avatar gap as the default of its variable', () => {
    renderBubble(makeMessage(), true, true);
    expect(declarationsFor(rowOf())).toContain('gap:var(--ethora-message-avatar-gap,5px)');
  });

  it('keeps the caption bottom padding at 2px', () => {
    renderBubble(
      makeMessage({
        isMediafile: 'true',
        attachments: [image(1), { ...image(2), mimetype: 'application/pdf', originalName: 'a.pdf' }],
        body: 'media',
        caption: 'hello',
      } as Partial<IMessage>),
      false
    );
    const caption = document.querySelector('[data-testid="media-caption"]') as HTMLElement;
    expect(declarationsFor(caption)).toContain('padding:8px10px2px');
  });
});

describe('MessageContainer run plumbing', () => {
  it('passes isLastInGroup down to the bubble row', () => {
    renderWithProviders(
      <MessageContainer
        CustomMessage={Message as any}
        message={makeMessage({ id: 'x' })}
        activeMessage={undefined as any}
        config={{} as any}
        xmppUsername={OWN_ID}
        isReply={false}
        showDateLabel={false}
        isLastInGroup={false}
      />,
      {
        preloadedState: {
          chatSettingStore: { user: { xmppUsername: OWN_ID }, config: {} } as any,
          rooms: { rooms: { [ROOM_JID]: makeRoom() }, usersSet: {} } as any,
        },
      }
    );
    expect(declarationsFor(rowOf())).toContain(`margin-bottom:${RUN_GAP_PX}px`);
  });
});
