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

describe('Message - tick tooltip in large groups (count-based)', () => {
  const bigRoom = (overrides: Partial<IRoom> = {}) =>
    makeRoom({ type: 'group', usersCnt: 468, ...overrides });
  const receipts = (n: number) =>
    Object.fromEntries(
      Array.from({ length: n }, (_, i) => [`user${i}`, Date.now()])
    );
  const watermarks = (n: number, id: string) =>
    Object.fromEntries(Array.from({ length: n }, (_, i) => [`user${i}`, id]));
  const lineTexts = (container: HTMLElement) =>
    Array.from(container.querySelectorAll('.tick-tooltip > span')).map(
      (el) => el.textContent
    );

  it('shows "Sent" with no receipts yet', () => {
    const { container } = renderMessage(makeMessage(), bigRoom());
    expect(lineTexts(container)).toEqual(['Sent']);
    expect(tooltipText(container)).toBe('Sent');
  });

  it('counts a single delivery against the other members', () => {
    const { container } = renderMessage(
      makeMessage({ receivedBy: receipts(1) }),
      bigRoom()
    );
    expect(lineTexts(container)).toEqual(['Delivered to 1 of 467']);
  });

  it('shows read and delivered count lines when 12 members have read it', () => {
    const { container } = renderMessage(
      makeMessage({ id: 'm1', receivedBy: receipts(12) }),
      bigRoom({ lastDisplayedByUser: watermarks(12, 'm1') })
    );
    expect(lineTexts(container)).toEqual([
      'Read by 12 of 467',
      'Delivered to 12 of 467',
    ]);
  });

  it('never names readers in a large group, even when there are four', () => {
    const { container } = renderMessage(
      makeMessage({ id: 'm1', receivedBy: receipts(4) }),
      bigRoom({ lastDisplayedByUser: watermarks(4, 'm1') }),
      {
        user0: { xmppUsername: 'user0', firstName: 'Anna', lastName: 'A' },
        user1: { xmppUsername: 'user1', firstName: 'Bob', lastName: 'B' },
        user2: { xmppUsername: 'user2', firstName: 'Carl', lastName: 'C' },
        user3: { xmppUsername: 'user3', firstName: 'Dana', lastName: 'D' },
      }
    );
    const text = tooltipText(container) ?? '';
    expect(lineTexts(container)).toEqual([
      'Read by 4 of 467',
      'Delivered to 4 of 467',
    ]);
    for (const name of ['Anna', 'Bob', 'Carl', 'Dana']) {
      expect(text).not.toContain(name);
    }
  });

  it('keeps names for a group of exactly five other members', () => {
    const { container } = renderMessage(
      makeMessage({ receivedBy: { bob: Date.now() } }),
      makeRoom({ type: 'group', usersCnt: 6 }),
      {
        bob: { xmppUsername: 'bob', firstName: 'Bob', lastName: 'Smith' },
      }
    );
    expect(lineTexts(container)).toEqual(['Delivered to Bob Smith']);
  });

  it('switches to counts once there are more than five other members', () => {
    const { container } = renderMessage(
      makeMessage({ receivedBy: { bob: Date.now() } }),
      makeRoom({ type: 'group', usersCnt: 7 }),
      {
        bob: { xmppUsername: 'bob', firstName: 'Bob', lastName: 'Smith' },
      }
    );
    expect(lineTexts(container)).toEqual(['Delivered to 1 of 6']);
  });

  it('keeps the plain 1:1 wording even if a usersCnt is present', () => {
    const { container } = renderMessage(
      makeMessage({ receivedBy: { bob: Date.now() } }),
      makeRoom({ type: 'private', usersCnt: 2 })
    );
    expect(tooltipText(container)).toBe('Delivered');
  });
});
