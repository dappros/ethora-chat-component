import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import { Message } from './Message';
import { IMessage, IRoom } from '../../types/types';

vi.mock('../../context/xmppProvider', () => ({
  useXmppClient: () => ({ client: { sendMessageReactionStanza: vi.fn() } }),
}));

const ROOM_JID = 'room1@conference.example.com';

const makeMessage = (overrides: Partial<IMessage> = {}): IMessage =>
  ({
    id: 'm1',
    body: 'hi @Bob Smith',
    date: new Date().toISOString(),
    roomJid: ROOM_JID,
    user: { id: 'me', name: 'Me' },
    mentions: [{ begin: 3, end: 13, uri: '', xmppUsername: 'bob' }],
    ...overrides,
  }) as IMessage;

const makeRoom = (overrides: Partial<IRoom> = {}): IRoom =>
  ({
    jid: ROOM_JID,
    name: 'room1',
    title: 'Room 1',
    usersCnt: 0,
    messages: [makeMessage()],
    isLoading: false,
    roomBg: null,
    ...overrides,
  }) as IRoom;

function renderMessage(
  message: IMessage,
  room: IRoom,
  usersSet: Record<string, any> = {},
  config: any = {}
) {
  const storeRef = { current: null as any };
  const utils = renderWithProviders(
    <Message message={message} isUser={false} isReply={false} />,
    {
      storeRef,
      preloadedState: {
        chatSettingStore: {
          user: { xmppUsername: 'me' },
          config,
        } as any,
        rooms: {
          rooms: { [ROOM_JID]: room },
          usersSet,
        } as any,
      },
    }
  );
  return { ...utils, storeRef };
}

describe('Message - clicking an @mention opens the mentioned user profile', () => {
  it('opens the profile modal for a known room member', () => {
    const { getByText, storeRef } = renderMessage(makeMessage(), makeRoom(), {
      bob: { xmppUsername: 'bob', firstName: 'Bob', lastName: 'Smith' },
    });

    fireEvent.click(getByText('@Bob Smith'));

    const state = storeRef.current.getState();
    expect(state.chatSettingStore.activeModal).toBe('profile');
    expect(state.chatSettingStore.selectedUser).toMatchObject({
      id: 'bob',
      xmppUsername: 'bob',
      name: 'Bob Smith',
    });
  });

  it('does nothing for an unknown ("Deleted User") mention', () => {
    const { getByText, storeRef } = renderMessage(makeMessage(), makeRoom(), {});

    fireEvent.click(getByText('@Bob Smith'));

    const state = storeRef.current.getState();
    expect(state.chatSettingStore.activeModal).toBeFalsy();
    expect(state.chatSettingStore.selectedUser).toBeFalsy();
  });

  it('does nothing when profile interactions are disabled', () => {
    const { getByText, storeRef } = renderMessage(
      makeMessage(),
      makeRoom(),
      { bob: { xmppUsername: 'bob', firstName: 'Bob', lastName: 'Smith' } },
      { disableProfilesInteractions: true }
    );

    fireEvent.click(getByText('@Bob Smith'));

    const state = storeRef.current.getState();
    expect(state.chatSettingStore.activeModal).toBeFalsy();
  });
});
