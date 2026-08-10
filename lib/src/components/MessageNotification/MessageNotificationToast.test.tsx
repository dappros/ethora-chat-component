import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders } from '../../test/renderWithProviders';
import MessageNotificationToast from './MessageNotificationToast';
import { IMessage } from '../../types/types';

const SENDER_ID = 'them@example.com';

const baseProps = {
  roomName: 'Room 1',
  senderName: 'Them',
  roomJID: 'room1@conference.example.com',
  timestamp: Date.now(),
  onClose: vi.fn(),
  onNavigateToMessage: vi.fn(),
  duration: 5000,
};

const makeMessage = (overrides: Partial<IMessage> = {}): IMessage =>
  ({
    id: 'm1',
    body: 'hello',
    date: new Date().toISOString(),
    roomJid: baseProps.roomJID,
    user: { id: SENDER_ID, name: 'Them' },
    ...overrides,
  }) as IMessage;

function renderToast(message: IMessage, usersSet: Record<string, any> = {}) {
  return renderWithProviders(
    <MessageNotificationToast id="n1" message={message} {...baseProps} />,
    {
      preloadedState: {
        chatSettingStore: { user: { xmppUsername: 'me' }, config: {} } as any,
        rooms: { rooms: {}, usersSet } as any,
      },
    }
  );
}

// Same gap as Message.tsx: the toast only ever read message.user's own
// photo field, which the persisted/live message frequently lacks even
// when usersSet already has a photo for that exact sender.
describe('MessageNotificationToast - avatar resolves through usersSet', () => {
  it('shows the photo from usersSet even when the message itself carries none', () => {
    renderToast(makeMessage(), {
      them: { firstName: 'Them', lastName: '', profileImage: 'https://cdn.example.com/them.jpg' },
    });

    // jsdom doesn't resolve styled-components' injected stylesheet through
    // getComputedStyle for a shorthand `background` - check the literal
    // rule styled-components wrote instead, which is what actually
    // determines what paints.
    expect(document.head.textContent).toContain('cdn.example.com/them.jpg');
  });

  it('falls back to the message-level photo field for a sender usersSet has never heard of', () => {
    const message = makeMessage({
      user: { id: SENDER_ID, name: 'Them', profileImage: 'https://cdn.example.com/only-on-message.jpg' } as any,
    });
    renderToast(message, {});

    expect(document.head.textContent).toContain(
      'cdn.example.com/only-on-message.jpg'
    );
  });
});
