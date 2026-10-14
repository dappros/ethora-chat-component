import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import { Message } from './Message';
import { IMessage, IRoom } from '../../types/types';
import {
  registerMediaRetry,
  unregisterMediaRetry,
} from '../../helpers/mediaSendRetry';

vi.mock('../../context/xmppProvider', () => ({
  useXmppClient: () => ({ client: { sendMessageReactionStanza: vi.fn() } }),
}));

const resendMessageMock = vi.fn(async () => 'm1');
vi.mock('../../utils/resendMessage', () => ({
  resendMessage: (...args: unknown[]) => (resendMessageMock as any)(...args),
}));

const ROOM_JID = 'room1@conference.example.com';
const MESSAGE_ID = 'send-media-message:m1';

const makeMessage = (overrides: Partial<IMessage> = {}): IMessage =>
  ({
    id: MESSAGE_ID,
    body: '',
    date: new Date().toISOString(),
    roomJid: ROOM_JID,
    user: { id: 'me', name: 'Me' },
    isMediafile: 'true',
    attachments: [],
    pending: true,
    failed: true,
    ...overrides,
  }) as IMessage;

const makeRoom = (messages: IMessage[]): IRoom =>
  ({
    jid: ROOM_JID,
    name: 'room1',
    title: 'Room 1',
    usersCnt: 0,
    messages,
    isLoading: false,
    roomBg: null,
  }) as IRoom;

function renderMessage(message: IMessage) {
  const storeRef: { current: any } = { current: null };
  const utils = renderWithProviders(
    <Message message={message} isUser isReply={false} />,
    {
      storeRef,
      preloadedState: {
        chatSettingStore: {
          user: { xmppUsername: 'me', firstName: 'Me', lastName: 'Myself' },
          config: {},
        } as any,
        rooms: {
          rooms: { [ROOM_JID]: makeRoom([message]) },
          usersSet: {},
        } as any,
        roomHeapSlice: { messageHeap: [] } as any,
      },
    }
  );
  return { ...utils, storeRef };
}

// A failed media send keeps its retry runner in memory only. These cover the
// bubble's choice between Retry (runner alive, same session) and Remove
// (runner gone, e.g. after a page reload).
describe('Message - failed media send after a reload', () => {
  beforeEach(() => resendMessageMock.mockClear());
  afterEach(() => unregisterMediaRetry(MESSAGE_ID));

  it('runner present: shows Retry, not Remove, and Retry re-runs the uploads', () => {
    const runner = vi.fn(async () => true);
    registerMediaRetry(MESSAGE_ID, runner);
    renderMessage(makeMessage());

    expect(screen.getByText('Not delivered')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Remove this message' })
    ).toBeNull();
    expect(screen.queryByText(/files were lost on reload/i)).toBeNull();

    fireEvent.click(
      screen.getByRole('button', { name: 'Retry sending this message' })
    );

    expect(runner).toHaveBeenCalledTimes(1);
    expect(resendMessageMock).not.toHaveBeenCalled();
  });

  it('runner absent: shows Remove with a lost-files note and hides Retry', () => {
    renderMessage(makeMessage());

    expect(screen.getByText('Not delivered')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Remove this message' })
    ).toBeInTheDocument();
    expect(screen.getByText(/files were lost on reload/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull();
  });

  it('runner absent: Remove deletes the optimistic message from the room', () => {
    const { storeRef } = renderMessage(makeMessage());

    fireEvent.click(
      screen.getByRole('button', { name: 'Remove this message' })
    );

    const messages = storeRef.current.getState().rooms.rooms[ROOM_JID].messages;
    expect(messages.find((m: IMessage) => m.id === MESSAGE_ID)).toBeUndefined();
  });

  it('a text message with no runner keeps its Retry (it resends from the body)', () => {
    renderMessage(makeMessage({ isMediafile: 'false', body: 'hello' }));

    expect(
      screen.getByRole('button', { name: 'Retry sending this message' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Remove this message' })
    ).toBeNull();
  });
});
