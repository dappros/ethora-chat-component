import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import { Message } from './Message';
import { IMessage, IRoom } from '../../types/types';
import { resetAnsweredQuickReplies } from '../../helpers/quickReplies';

vi.mock('../../context/xmppProvider', () => ({
  useXmppClient: () => ({ client: { sendMessageReactionStanza: vi.fn() } }),
}));

const sendMessageMock = vi.fn();
vi.mock('../../hooks/useSendMessage', () => ({
  useSendMessage: () => ({ sendMessage: sendMessageMock }),
  shouldTagOutgoingTranslateSource: () => false,
}));

const onQuickReply = vi.fn();

const ROOM_JID = 'room1@conference.example.com';

const makeMessage = (overrides: Partial<IMessage> = {}): IMessage =>
  ({
    id: 'bot-msg-1',
    body: 'Would you like to take the quiz?',
    date: new Date().toISOString(),
    roomJid: ROOM_JID,
    user: { id: 'bot', name: 'Assistant' },
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

function renderMessage(message: IMessage, isUser = false) {
  return renderWithProviders(
    <Message message={message} isUser={isUser} isReply={false} />,
    {
      preloadedState: {
        chatSettingStore: {
          user: { xmppUsername: 'me', firstName: 'Me', lastName: 'Myself' },
          config: { eventHandlers: { onQuickReply } },
        } as any,
        rooms: { rooms: { [ROOM_JID]: makeRoom() }, usersSet: {} } as any,
        roomHeapSlice: { messageHeap: [] } as any,
      },
    }
  );
}

const BUTTONS = [
  { name: 'Take Quiz', value: 'Take Quiz', questionId: 'start' },
  { name: 'Not now', value: 'Not now' },
];

describe('Message - bot quick replies', () => {
  beforeEach(() => {
    sendMessageMock.mockClear();
    onQuickReply.mockClear();
    resetAnsweredQuickReplies();
  });

  it('renders a chip per button, from the raw JSON the bots already send', () => {
    renderMessage(makeMessage({ quickReplies: JSON.stringify(BUTTONS) }));

    expect(screen.getByRole('button', { name: 'Take Quiz' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Not now' })).toBeInTheDocument();
  });

  it('sends the answer into the room as an ordinary message on tap', () => {
    renderMessage(makeMessage({ quickReplies: BUTTONS }));

    fireEvent.click(screen.getByRole('button', { name: 'Take Quiz' }));

    expect(sendMessageMock).toHaveBeenCalledWith('Take Quiz', ROOM_JID);
  });

  // What a host-scripted flow (the 5-question quiz) hangs off.
  it('notifies the host of the answer, after the send', () => {
    renderMessage(makeMessage({ quickReplies: BUTTONS }));

    fireEvent.click(screen.getByRole('button', { name: 'Take Quiz' }));

    expect(onQuickReply).toHaveBeenCalledWith({
      messageId: 'bot-msg-1',
      roomJID: ROOM_JID,
      questionId: 'start',
      reply: { name: 'Take Quiz', value: 'Take Quiz', questionId: 'start' },
    });
  });

  // A host handler is untrusted code running mid-click; the answer is
  // already sent by then and must not be undone by its failure.
  it('survives a host handler that throws', () => {
    onQuickReply.mockImplementationOnce(() => {
      throw new Error('host blew up');
    });
    renderMessage(makeMessage({ quickReplies: BUTTONS }));

    expect(() =>
      fireEvent.click(screen.getByRole('button', { name: 'Take Quiz' }))
    ).not.toThrow();
    expect(sendMessageMock).toHaveBeenCalledWith('Take Quiz', ROOM_JID);
  });

  // Without a questionId the button's position is the question identity -
  // otherwise every answer of a buttonless-id bot would collide on the same
  // /quiz/<messageId>- path.
  it('falls back to the button index when the bot sends no questionId', () => {
    renderMessage(makeMessage({ quickReplies: BUTTONS }));

    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));

    expect(onQuickReply).toHaveBeenCalledWith(
      expect.objectContaining({ questionId: '1' })
    );
  });

  // A double tap used to be the obvious way to submit two answers to one
  // question. The row is removed rather than disabled, so there is nothing
  // left to tap.
  it('removes every chip after the first answer', () => {
    renderMessage(makeMessage({ quickReplies: BUTTONS }));

    fireEvent.click(screen.getByRole('button', { name: 'Take Quiz' }));

    expect(screen.queryByRole('button', { name: 'Take Quiz' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Not now' })).toBeNull();
    expect(sendMessageMock).toHaveBeenCalledTimes(1);
    expect(onQuickReply).toHaveBeenCalledTimes(1);
  });

  // The render window unmounts rows as you scroll, and a reload re-renders
  // the whole transcript - neither may re-offer a closed question.
  it('stays gone for a message answered earlier', () => {
    const { unmount } = renderMessage(makeMessage({ quickReplies: BUTTONS }));
    fireEvent.click(screen.getByRole('button', { name: 'Take Quiz' }));
    unmount();

    renderMessage(makeMessage({ quickReplies: BUTTONS }));

    expect(screen.queryByRole('button', { name: 'Take Quiz' })).toBeNull();
  });

  it('never shows buttons on the visitor own bubble', () => {
    renderMessage(makeMessage({ quickReplies: BUTTONS }), true);

    expect(screen.queryByRole('button', { name: 'Take Quiz' })).toBeNull();
  });

  it('ignores the empty quickReplies attribute legacy senders stamp everywhere', () => {
    const { container } = renderMessage(makeMessage({ quickReplies: '' }));

    expect(container.querySelector('[aria-label="Quick replies"]')).toBeNull();
  });
});

// An LLM agent can't set stanza attributes, so it writes the buttons into its
// reply text instead (see helpers/botMarkup.ts). They must behave exactly
// like attribute buttons, and the markup must never reach the reader.
describe('Message - buttons written into the reply text', () => {
  beforeEach(() => {
    sendMessageMock.mockClear();
    onQuickReply.mockClear();
    resetAnsweredQuickReplies();
  });

  const AGENT_BODY =
    '<xml>\n<bot-data type="buttons">[Accept],[Reject]</bot-data>\n<body>Choose one please</body>\n</xml>';

  it('renders the buttons and shows only the body text', async () => {
    const { container } = renderMessage(
      makeMessage({ id: 'agent-1', body: AGENT_BODY })
    );

    expect(screen.getByRole('button', { name: 'Accept' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument();
    expect(await screen.findByText('Choose one please')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/bot-data|<xml>|<body>/);
  });

  it('sends the tapped label into the room and removes the buttons', () => {
    renderMessage(makeMessage({ id: 'agent-2', body: AGENT_BODY }));

    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));

    expect(sendMessageMock).toHaveBeenCalledWith('Accept', ROOM_JID);
    expect(screen.queryByRole('button', { name: 'Reject' })).toBeNull();
  });

  it("leaves the visitor's own message alone", () => {
    renderMessage(makeMessage({ id: 'mine-1', body: AGENT_BODY }), true);

    expect(screen.queryByRole('button', { name: 'Accept' })).toBeNull();
  });
});
