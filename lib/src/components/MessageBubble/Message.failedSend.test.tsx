import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import { Message } from './Message';
import { IMessage, IRoom } from '../../types/types';

vi.mock('../../context/xmppProvider', () => ({
  useXmppClient: () => ({ client: { sendMessageReactionStanza: vi.fn() } }),
}));

const resendMessageMock = vi.fn(async () => 'm1');
vi.mock('../../utils/resendMessage', () => ({
  resendMessage: (...args: unknown[]) => (resendMessageMock as any)(...args),
}));

const ROOM_JID = 'room1@conference.example.com';

const makeMessage = (overrides: Partial<IMessage> = {}): IMessage =>
  ({
    id: 'm1',
    body: 'hello',
    date: new Date().toISOString(),
    roomJid: ROOM_JID,
    user: { id: 'me', name: 'Me' },
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

function renderMessage(message: IMessage, config: Record<string, any> = {}) {
  return renderWithProviders(
    <Message message={message} isUser isReply={false} />,
    {
      preloadedState: {
        chatSettingStore: {
          user: { xmppUsername: 'me', firstName: 'Me', lastName: 'Myself' },
          config,
        } as any,
        rooms: { rooms: { [ROOM_JID]: makeRoom() }, usersSet: {} } as any,
        roomHeapSlice: { messageHeap: [] } as any,
      },
    }
  );
}

// The retry affordance existed only as a commented-out `<button>asdasdsd`
// in this file: a send that was never acknowledged sat on "sending..."
// forever with no way out.
describe('Message - failed send state and retry', () => {
  beforeEach(() => resendMessageMock.mockClear());

  it('offers a retry control with an accessible label once a send has failed', () => {
    renderMessage(makeMessage({ pending: true, failed: true }));

    expect(screen.getByText('Not delivered')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Retry sending this message' })
    ).toBeInTheDocument();
  });

  it('shows "sending..." and no retry control while a send is still in flight', () => {
    renderMessage(makeMessage({ pending: true }));

    expect(screen.getByText(/sending/i)).toBeInTheDocument();
    expect(screen.queryByText('Not delivered')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull();
  });

  it('drops the "sending..." caption while showing the failed state', () => {
    renderMessage(makeMessage({ pending: true, failed: true }));

    expect(screen.queryByText(/sending/i)).not.toBeInTheDocument();
  });

  it('shows nothing extra on an acknowledged message', () => {
    renderMessage(makeMessage({ pending: false }));

    expect(screen.queryByText('Not delivered')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull();
  });

  it('honours disableSentLogic, which hosts use to hide all delivery state', () => {
    renderMessage(makeMessage({ pending: true, failed: true }), {
      disableSentLogic: true,
    });

    expect(screen.queryByText('Not delivered')).not.toBeInTheDocument();
  });

  it('retries through the shared utility, reusing the original message id', () => {
    renderMessage(makeMessage({ pending: true, failed: true }));

    fireEvent.click(
      screen.getByRole('button', { name: 'Retry sending this message' })
    );

    expect(resendMessageMock).toHaveBeenCalledTimes(1);
    const [payload, options] = resendMessageMock.mock.calls[0] as any[];
    expect(payload).toMatchObject({
      originalMessageId: 'm1',
      body: 'hello',
      roomJid: ROOM_JID,
    });
    // Reusing the id is what lets a late echo reconcile instead of adding a
    // second copy for the recipient.
    expect(options).toMatchObject({ preserveMessageId: true });
  });

  it('translates the failed state and the retry label', () => {
    renderMessage(makeMessage({ pending: true, failed: true }), {
      i18n: { locale: 'fr' },
    });

    expect(screen.getByText('Non envoyé')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Réessayer d’envoyer ce message' })
    ).toBeInTheDocument();
  });

  it('tints the failure notice from a token, never a hardcoded red', () => {
    const { container } = renderMessage(
      makeMessage({ pending: true, failed: true })
    );

    const notice = screen.getByText('Not delivered').parentElement;
    const styles = Array.from(container.ownerDocument.querySelectorAll('style'))
      .map((el) => el.textContent || '')
      .join('\n');
    expect(notice).toBeTruthy();
    expect(styles).toContain('var(--ethora-color-danger');
  });
});
