import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import { Message } from './Message';
import { IMessage, IRoom } from '../../types/types';
import {
  ALIAS_STANZAS,
  N1_STANZA,
  PLAIN_MEDIA_STANZA,
  toMessage,
} from '../../test/legacyMediaFixtures';

vi.mock('../../context/xmppProvider', () => ({
  useXmppClient: () => ({ client: { sendMessageReactionStanza: vi.fn() } }),
}));

const ROOM_JID = 'app1_room1@conference.xmpp.example.com';

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

const renderBubble = (message: IMessage, isUser = false) =>
  renderWithProviders(
    <Message message={message} isUser={isUser} isReply={false} />,
    {
      preloadedState: {
        chatSettingStore: { user: { xmppUsername: 'me' }, config: {} } as any,
        rooms: { rooms: { [ROOM_JID]: makeRoom() }, usersSet: {} } as any,
      },
    }
  );

const bubbles = () => document.querySelectorAll('[data-ethora-bubble]');
const bubble = () => bubbles()[0] as HTMLElement;
const countOf = (text: string) =>
  (bubble().textContent ?? '').split(text).length - 1;

afterEach(() => vi.restoreAllMocks());

describe('a legacy media message with text in its body', () => {
  it('is ONE bubble: the picture, the caption below it, and the time', async () => {
    const message = await toMessage(N1_STANZA);
    message.user = { id: 'app1_user1', name: 'etest etest' };
    renderBubble(message);

    expect(bubbles()).toHaveLength(1);
    const caption = bubble().querySelector('[data-testid="media-caption"]');
    expect(caption).toHaveTextContent('hello');
    // The media block comes before the caption, inside the same bubble.
    const block = bubble().querySelector('[data-testid="media-block"]');
    expect(block).not.toBeNull();
    expect(block).toHaveAttribute('data-mode', 'solo');
    expect(
      block!.compareDocumentPosition(caption!) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(bubble().textContent).toMatch(/\d{1,2}:\d{2}/);
  });

  it('shows the text once, never as the caption and as body text', async () => {
    const message = await toMessage(N1_STANZA);
    message.user = { id: 'app1_user1', name: 'etest etest' };
    renderBubble(message);
    expect(document.querySelectorAll('[data-testid="media-caption"]')).toHaveLength(1);
    expect(countOf('hello')).toBe(1);
  });

  it('keeps the time under the caption, not as a glass pill over the picture', async () => {
    const message = await toMessage(N1_STANZA);
    message.user = { id: 'app1_user1', name: 'etest etest' };
    renderBubble(message);
    const caption = bubble().querySelector('[data-testid="media-caption"]')!;
    const time = Array.from(bubble().querySelectorAll('span')).find((el) =>
      /^\d{1,2}:\d{2}/.test((el.textContent ?? '').trim())
    )!;
    expect(
      caption.compareDocumentPosition(time) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it.each(ALIAS_STANZAS)('renders the "%s" alias as the caption', async (_key, xml) => {
    const message = await toMessage(xml);
    renderBubble(message);
    expect(bubbles()).toHaveLength(1);
    expect(screen.getByTestId('media-caption')).toHaveTextContent('from the alias');
  });

  it('copies the caption, not "media"', async () => {
    const writeText = vi.fn();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const message = await toMessage(N1_STANZA);
    message.user = { id: 'me@example.com', name: 'Me' };
    renderBubble(message, true);

    fireEvent.contextMenu(screen.getByTestId('media-caption'), { clientX: 10, clientY: 10 });
    await waitFor(() => expect(screen.getByText('Copy')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Copy'));
    expect(writeText).toHaveBeenCalledWith('hello');
  });
});

describe('a media message with nothing to say', () => {
  it('has no caption block for the "media" placeholder', async () => {
    const message = await toMessage(PLAIN_MEDIA_STANZA);
    renderBubble(message);
    expect(bubbles()).toHaveLength(1);
    expect(screen.queryByTestId('media-caption')).toBeNull();
  });

  it('has none when the body is the file name', async () => {
    const message = await toMessage(N1_STANZA);
    message.body = 'daria-k-FU3IdARAdbI-unsplash.jpg';
    renderBubble(message);
    expect(screen.queryByTestId('media-caption')).toBeNull();
  });

  it('has none when the body is the sender name', async () => {
    const message = await toMessage(N1_STANZA);
    message.body = 'etest etest';
    message.user = { id: 'app1_user1', name: 'etest etest' };
    renderBubble(message);
    expect(screen.queryByTestId('media-caption')).toBeNull();
  });
});
