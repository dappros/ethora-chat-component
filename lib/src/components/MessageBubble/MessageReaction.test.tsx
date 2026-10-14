import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import { MessageReaction } from './MessageReaction';
import { Message } from './Message';
import { IAttachment, IMessage, IRoom, ReactionMessage } from '../../types/types';

vi.mock('../../context/xmppProvider', () => ({
  useXmppClient: () => ({ client: { sendMessageReactionStanza: vi.fn() } }),
}));

const ME = 'Me User';
const ROOM_JID = 'room1@conference.example.com';

/** One reaction stanza per user: `emojis` is what that user sent. */
const reactor = (
  first: string,
  last: string,
  emojis: string[]
): ReactionMessage => ({
  emoji: emojis,
  data: { senderFirstName: first, senderLastName: last } as any,
});

const renderReaction = (
  reaction: Record<string, ReactionMessage>,
  changeReaction = vi.fn()
) =>
  renderWithProviders(
    <MessageReaction
      reaction={reaction}
      color="#0052CD"
      changeReaction={changeReaction}
      userName={ME}
    />
  );

const chips = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLButtonElement>('.reaction-chip'));

describe('MessageReaction chips', () => {
  it('renders one pill per distinct emoji with its count', () => {
    const { container } = renderReaction({
      alice: reactor('Alice', 'Smith', ['+1', 'heart']),
      bob: reactor('Bob', 'Lee', ['+1']),
    });
    const [thumbs, heart] = chips(container);
    expect(chips(container)).toHaveLength(2);
    expect(thumbs.textContent).toContain('👍');
    expect(thumbs.textContent).toContain('2');
    expect(heart.textContent).toContain('❤️');
    expect(heart.textContent).toContain('1');
  });

  it('marks a reaction the current user sent as pressed with a "you reacted" label', () => {
    const { container } = renderReaction({
      me: reactor('Me', 'User', ['+1']),
      bob: reactor('Bob', 'Lee', ['+1', 'fire']),
    });
    const [thumbs, fire] = chips(container);
    expect(thumbs.getAttribute('aria-pressed')).toBe('true');
    expect(thumbs.getAttribute('aria-label')).toBe('👍 2, you reacted');
    expect(fire.getAttribute('aria-pressed')).toBe('false');
    expect(fire.getAttribute('aria-label')).toBe('🔥 1');
  });

  it('reports a chip that is not the user own as not pressed', () => {
    const { container } = renderReaction({
      bob: reactor('Bob', 'Lee', ['joy']),
    });
    const [joy] = chips(container);
    expect(joy.getAttribute('aria-pressed')).toBe('false');
    expect(joy.getAttribute('aria-label')).toBe('😂 1');
  });

  it('calls changeReaction with the emoji id when a chip is pressed', () => {
    const changeReaction = vi.fn();
    const { container } = renderReaction(
      { bob: reactor('Bob', 'Lee', ['+1']) },
      changeReaction
    );
    fireEvent.click(chips(container)[0]);
    expect(changeReaction).toHaveBeenCalledWith('+1');
  });

  it('keeps the tooltip out of the button, linked by aria-describedby', () => {
    const { container } = renderReaction({
      alice: reactor('Alice', 'Smith', ['+1']),
    });
    const [thumbs] = chips(container);
    expect(thumbs.querySelector('[role="tooltip"]')).toBeNull();
    const tooltip = container.querySelector('[role="tooltip"]');
    expect(tooltip).not.toBeNull();
    expect(thumbs.getAttribute('aria-describedby')).toBe(tooltip?.id);
  });
});

describe('MessageReaction overflow', () => {
  const eight = {
    a: reactor('A', 'One', ['joy']),
    b: reactor('B', 'Two', ['heart']),
    c: reactor('C', 'Three', ['fire']),
    d: reactor('D', 'Four', ['+1']),
    e: reactor('E', 'Five', ['smile']),
    f: reactor('F', 'Six', ['scream']),
    g: reactor('G', 'Seven', ['tada']),
    h: reactor('H', 'Eight', ['eyes']),
  };

  it('shows six distinct emojis and a +N chip for the rest', () => {
    const { container } = renderReaction(eight);
    expect(chips(container)).toHaveLength(6);
    const more = screen.getByRole('button', { name: 'Show 2 more reactions' });
    expect(more.textContent).toBe('+2');
  });

  it('expands the hidden emojis in place when the +N chip is pressed', () => {
    const { container } = renderReaction(eight);
    fireEvent.click(screen.getByRole('button', { name: 'Show 2 more reactions' }));
    expect(chips(container)).toHaveLength(8);
    expect(screen.queryByRole('button', { name: /more reactions/ })).toBeNull();
  });

  it('shows no +N chip at exactly six emojis', () => {
    renderReaction({
      a: reactor('A', 'One', ['joy']),
      b: reactor('B', 'Two', ['heart']),
      c: reactor('C', 'Three', ['fire']),
      d: reactor('D', 'Four', ['+1']),
      e: reactor('E', 'Five', ['smile']),
      f: reactor('F', 'Six', ['scream']),
    });
    expect(screen.queryByRole('button', { name: /more reactions/ })).toBeNull();
  });
});

describe('MessageReaction tooltip', () => {
  const tooltipOf = (container: HTMLElement, emoji: string) => {
    const chip = chips(container).find((c) => c.textContent?.includes(emoji));
    const id = chip?.getAttribute('aria-describedby');
    return container.querySelector(`[id="${id}"]`)?.textContent;
  };

  it('names a single reactor', () => {
    const { container } = renderReaction({
      alice: reactor('Alice', 'Smith', ['+1']),
    });
    expect(tooltipOf(container, '👍')).toBe('Alice Smith reacted with 👍');
  });

  it('joins two reactors with "and"', () => {
    const { container } = renderReaction({
      alice: reactor('Alice', 'Smith', ['+1']),
      bob: reactor('Bob', 'Lee', ['+1']),
    });
    expect(tooltipOf(container, '👍')).toBe(
      'Alice Smith and Bob Lee reacted with 👍'
    );
  });

  it('names the first two and counts the rest, as "Alice, Bob and 2 others"', () => {
    const { container } = renderReaction({
      alice: reactor('Alice', 'Smith', ['+1']),
      bob: reactor('Bob', 'Lee', ['+1']),
      carol: reactor('Carol', 'Wu', ['+1']),
      dan: reactor('Dan', 'Fox', ['+1']),
    });
    expect(tooltipOf(container, '👍')).toBe(
      'Alice Smith, Bob Lee and 2 others reacted with 👍'
    );
  });

  it('uses the singular "other" for exactly one more reactor', () => {
    const { container } = renderReaction({
      alice: reactor('Alice', 'Smith', ['+1']),
      bob: reactor('Bob', 'Lee', ['+1']),
      carol: reactor('Carol', 'Wu', ['+1']),
    });
    expect(tooltipOf(container, '👍')).toBe(
      'Alice Smith, Bob Lee and 1 other reacted with 👍'
    );
  });
});

describe('Message reaction placement', () => {
  const SENDER_ID = '646cc8dc96d4a4dc8f7b2f2d_6ab3a116d1f5c231da4c84fd';

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

  const renderMessage = (message: IMessage) =>
    renderWithProviders(<Message message={message} isUser={false} isReply={false} />, {
      preloadedState: {
        chatSettingStore: {
          user: { xmppUsername: 'me', firstName: 'Me', lastName: 'User' },
          config: {},
        } as any,
        rooms: {
          rooms: { [ROOM_JID]: makeRoom() },
          usersSet: {},
        } as any,
      },
    });

  const base = {
    id: 'm1',
    date: new Date('2026-10-14T12:53:00').toISOString(),
    roomJid: ROOM_JID,
    user: { id: SENDER_ID },
    reaction: { bob: reactor('Bob', 'Lee', ['+1']) },
  };

  const image: IAttachment = {
    location: 'https://files.example/1.png',
    mimetype: 'image/png',
    originalName: 'photo.png',
    width: 1600,
    height: 900,
  };

  it('sits inside the text bubble, after the text', () => {
    const { container } = renderMessage({
      ...base,
      body: 'hello there',
    } as IMessage);
    const bubble = container.querySelector('[data-ethora-bubble]') as HTMLElement;
    const chip = within(bubble).getByRole('button', { name: '👍 1' });
    const text = within(bubble).getByText('hello there');
    expect(text.compareDocumentPosition(chip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('makes the reaction row a direct child of the bubble so it can straddle its bottom edge', () => {
    const { container } = renderMessage({
      ...base,
      body: 'hello there',
    } as IMessage);
    const bubble = container.querySelector('[data-ethora-bubble]') as HTMLElement;
    const row = within(bubble).getByRole('button', { name: '👍 1' }).closest('.reaction-row');
    expect(row?.parentElement).toBe(bubble);
  });

  it('renders under a media-only bubble inside the bubble, after the media', () => {
    const { container } = renderMessage({
      ...base,
      body: 'media',
      isMediafile: 'true',
      attachments: [image],
      mimetype: image.mimetype,
      location: image.location,
    } as IMessage);
    const bubble = container.querySelector('[data-ethora-bubble]') as HTMLElement;
    const chip = within(bubble).getByRole('button', { name: '👍 1' });
    const media = within(bubble).getByTestId('media-block');
    expect(media.compareDocumentPosition(chip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('renders the reaction row after the caption of a media bubble', () => {
    const { container } = renderMessage({
      ...base,
      body: 'a caption',
      isMediafile: 'true',
      attachments: [image],
      mimetype: image.mimetype,
      location: image.location,
    } as IMessage);
    const bubble = container.querySelector('[data-ethora-bubble]') as HTMLElement;
    const chip = within(bubble).getByRole('button', { name: '👍 1' });
    const caption = within(bubble).getByText('a caption');
    expect(caption.compareDocumentPosition(chip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
