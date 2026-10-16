import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders } from '../../test/renderWithProviders';
import { Message } from './Message';
import { IMessage, IRoom } from '../../types/types';

vi.mock('../../context/xmppProvider', () => ({
  useXmppClient: () => ({ client: { sendMessageReactionStanza: vi.fn() } }),
}));

const ROOM_JID = 'room1@conference.example.com';
const T0 = Date.UTC(2026, 9, 1, 10, 0, 0);
const at = (n: number) => String(T0 + n * 1000);

const makeMessage = (overrides: Partial<IMessage> = {}): IMessage =>
  ({
    id: 'm1',
    body: 'hello there',
    date: new Date(T0).toISOString(),
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
    messages: [
      makeMessage(),
      makeMessage({ id: 'm2', date: new Date(T0 + 1000).toISOString() }),
    ],
    isLoading: false,
    roomBg: null,
    ...overrides,
  }) as IRoom;

function renderOwn(message: IMessage, room: IRoom, usersSet: Record<string, any> = {}) {
  return renderWithProviders(
    <Message message={message} isUser={true} isReply={false} />,
    {
      preloadedState: {
        chatSettingStore: { user: { xmppUsername: 'me' }, config: {} } as any,
        rooms: { rooms: { [ROOM_JID]: room }, usersSet } as any,
      },
    }
  );
}

const tickStroke = (container: HTMLElement) =>
  container.querySelector('svg path')?.getAttribute('stroke');
const tickD = (container: HTMLElement) =>
  container.querySelector('svg path')?.getAttribute('d');
const tooltip = (container: HTMLElement) =>
  container.querySelector('.tick-tooltip')?.textContent;

describe('Message - delivery watermarks', () => {
  it('shows delivered when the delivery watermark is at or after this message', () => {
    const { container } = renderOwn(
      makeMessage({ id: 'm1' }),
      makeRoom({ lastReceivedByUser: { bob: 'm2' } })
    );
    expect(tickStroke(container)).toBe('#8C8C8C');
    expect(tickD(container)).toContain('L14.25 5.75');
  });

  it('shows sent when the delivery watermark is before this message', () => {
    const { container } = renderOwn(
      makeMessage({ id: 'm2' }),
      makeRoom({ lastReceivedByUser: { bob: 'm1' } })
    );
    expect(tickD(container)).toBe('M4 8.5L7 11.5L12 5.5');
  });
});

describe('Message - seen by timestamp and implicit watermarks', () => {
  it('uses the timestamp when the reader watermark id is not loaded', () => {
    const { container } = renderOwn(
      makeMessage({ id: at(5), date: new Date(T0 + 5000).toISOString() }),
      makeRoom({
        messages: [makeMessage({ id: at(5), date: new Date(T0 + 5000).toISOString() })],
        lastDisplayedByUser: { bob: at(7) },
      })
    );
    expect(tickStroke(container)).toBe('#0052CD');
  });

  it('a viewer who posted after this message has implicitly read it', () => {
    const room = makeRoom({
      messages: [
        makeMessage({ id: 'm1' }),
        makeMessage({ id: 'm2', user: { id: 'bob', name: 'Bob' }, date: new Date(T0 + 1000).toISOString() }),
      ],
    });
    const { container } = renderOwn(makeMessage({ id: 'm1' }), room);
    expect(tickStroke(container)).toBe('#0052CD');
  });
});

describe('Message - presentation is unchanged', () => {
  it('small group names the readers', () => {
    const usersSet = {
      bob: { _id: 'bob', firstName: 'Bob', lastName: 'Smith' },
    };
    const { container } = renderOwn(
      makeMessage({ id: 'm1' }),
      makeRoom({ type: 'group', usersCnt: 3, lastDisplayedByUser: { bob: 'm2' } }),
      usersSet
    );
    expect(tooltip(container)).toContain('Bob');
  });

  it('large group reports counts and never names', () => {
    const { container } = renderOwn(
      makeMessage({ id: 'm1', receivedBy: { user0: T0, user1: T0 } }),
      makeRoom({ type: 'group', usersCnt: 468 })
    );
    const text = tooltip(container) ?? '';
    expect(text).toMatch(/2/);
    expect(text).not.toContain('user0');
  });
});
