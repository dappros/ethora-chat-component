import React from 'react';
import { describe, it, expect, vi } from 'vitest';
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
    body: 'hello there',
    date: new Date().toISOString(),
    roomJid: ROOM_JID,
    user: { id: 'me', name: 'Me' },
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
  usersSet: Record<string, any> = {}
) {
  return renderWithProviders(
    <Message message={message} isUser={true} isReply={false} />,
    {
      preloadedState: {
        chatSettingStore: { user: { xmppUsername: 'me' }, config: {} } as any,
        rooms: {
          rooms: { [ROOM_JID]: room },
          usersSet,
        } as any,
      },
    }
  );
}

const tooltipText = (container: HTMLElement) =>
  container.querySelector('.tick-tooltip')?.textContent;

describe('Message - hover-only tick status tooltip', () => {
  it('shows "Sent" before anyone has received or read it', () => {
    const { container } = renderMessage(makeMessage(), makeRoom());
    expect(tooltipText(container)).toBe('Sent');
  });

  it('shows plain "Delivered" in a 1:1 room', () => {
    const { container } = renderMessage(
      makeMessage({ receivedBy: { bob: Date.now() } }),
      makeRoom({ type: 'private' })
    );
    expect(tooltipText(container)).toBe('Delivered');
  });

  it('lists names in "Delivered to ..." for a group room', () => {
    const { container } = renderMessage(
      makeMessage({ receivedBy: { bob: Date.now(), carol: Date.now() } }),
      makeRoom({ type: 'group' }),
      {
        bob: { xmppUsername: 'bob', firstName: 'Bob', lastName: 'Smith' },
        carol: { xmppUsername: 'carol', firstName: 'Carol', lastName: 'Lee' },
      }
    );
    expect(tooltipText(container)).toBe('Delivered to Bob Smith, Carol Lee');
  });

  it('shows plain "Read" in a 1:1 room', () => {
    const { container } = renderMessage(
      makeMessage({ id: 'm1' }),
      makeRoom({ type: 'private', lastDisplayedByUser: { bob: 'm1' } })
    );
    expect(tooltipText(container)).toBe('Read');
  });

  it('lists names in "Read by ..." for a group room with multiple readers', () => {
    const { container } = renderMessage(
      makeMessage({ id: 'm1' }),
      makeRoom({
        type: 'group',
        lastDisplayedByUser: { bob: 'm1', carol: 'm1' },
      }),
      {
        bob: { xmppUsername: 'bob', firstName: 'Bob', lastName: 'Smith' },
        carol: { xmppUsername: 'carol', firstName: 'Carol', lastName: 'Lee' },
      }
    );
    expect(tooltipText(container)).toBe('Read by Bob Smith, Carol Lee');
  });

  it('the tooltip is present in the DOM without any click (pure CSS hover)', () => {
    const { container } = renderMessage(makeMessage(), makeRoom());
    const tooltip = container.querySelector('.tick-tooltip');
    expect(tooltip).toBeTruthy();
    // No click handler on the wrapper - this is a hover-only affordance.
    const wrapper = tooltip?.parentElement;
    expect(wrapper?.onclick).toBeFalsy();
  });
});
