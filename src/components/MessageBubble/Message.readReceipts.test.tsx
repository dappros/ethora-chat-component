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
    messages: [makeMessage(), makeMessage({ id: 'm2' })],
    isLoading: false,
    roomBg: null,
    ...overrides,
  }) as IRoom;

function renderMessage(message: IMessage, room: IRoom) {
  return renderWithProviders(
    <Message message={message} isUser={true} isReply={false} />,
    {
      preloadedState: {
        chatSettingStore: {
          user: { xmppUsername: 'me' },
          config: {},
        } as any,
        rooms: {
          rooms: { [ROOM_JID]: room },
          usersSet: {},
        } as any,
      },
    }
  );
}

describe('Message - delivery/read tick status', () => {
  it('shows a single tick when nobody has received the message', () => {
    const { container } = renderMessage(makeMessage(), makeRoom());
    // Single tick renders one <path>, double tick renders one <path> with a
    // longer "d" (two strokes) - assert via the icon's path data length.
    const path = container.querySelector('svg path');
    expect(path?.getAttribute('d')).toBe('M4 8.5L7 11.5L12 5.5');
  });

  it('shows a gray double tick once someone has received the message', () => {
    const { container } = renderMessage(
      makeMessage({ receivedBy: { bob: Date.now() } }),
      makeRoom()
    );
    const path = container.querySelector('svg path');
    expect(path?.getAttribute('stroke')).toBe('#8C8C8C');
    expect(path?.getAttribute('d')).toContain('L14.25 5.75');
  });

  it('shows a blue double tick once another user has displayed at/after this message', () => {
    const { container } = renderMessage(
      makeMessage({ id: 'm1' }),
      makeRoom({ lastDisplayedByUser: { bob: 'm2' } })
    );
    const path = container.querySelector('svg path');
    expect(path?.getAttribute('stroke')).toBe('#0052CD');
  });

  it('renders no tick and no tick tooltip for an own message that failed to send', () => {
    const { container } = renderMessage(
      makeMessage({ failed: true }),
      makeRoom()
    );
    expect(container.querySelector('svg path')).toBeNull();
    expect(container.querySelector('.tick-tooltip')).toBeNull();
  });

  it('does not count a watermark from before this message as seen', () => {
    const { container } = renderMessage(
      makeMessage({ id: 'm2' }),
      makeRoom({ lastDisplayedByUser: { bob: 'm1' } })
    );
    const path = container.querySelector('svg path');
    expect(path?.getAttribute('stroke')).toBe('#8C8C8C');
    expect(path?.getAttribute('d')).toBe('M4 8.5L7 11.5L12 5.5');
  });
});

describe('Message - delivery/read tick status in large groups', () => {
  const BIG_ROOM_SIZE = 468;
  const bigRoom = (overrides: Partial<IRoom> = {}) =>
    makeRoom({ type: 'group', usersCnt: BIG_ROOM_SIZE, ...overrides });
  const receipts = (n: number) =>
    Object.fromEntries(
      Array.from({ length: n }, (_, i) => [`user${i}`, Date.now()])
    );
  const watermarks = (n: number, id: string) =>
    Object.fromEntries(Array.from({ length: n }, (_, i) => [`user${i}`, id]));

  it('shows a single tick when nobody has received the message', () => {
    const { container } = renderMessage(makeMessage(), bigRoom());
    const path = container.querySelector('svg path');
    expect(path?.getAttribute('d')).toBe('M4 8.5L7 11.5L12 5.5');
  });

  it('shows a gray double tick when one member has received it', () => {
    const { container } = renderMessage(
      makeMessage({ receivedBy: receipts(1) }),
      bigRoom()
    );
    const path = container.querySelector('svg path');
    expect(path?.getAttribute('stroke')).toBe('#8C8C8C');
    expect(path?.getAttribute('d')).toContain('L14.25 5.75');
  });

  it('shows a blue double tick when at least 12 members have read it', () => {
    const { container } = renderMessage(
      makeMessage({ id: 'm1', receivedBy: receipts(12) }),
      bigRoom({ lastDisplayedByUser: watermarks(12, 'm2') })
    );
    const path = container.querySelector('svg path');
    expect(path?.getAttribute('stroke')).toBe('#0052CD');
  });
});
