import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders } from '../../test/renderWithProviders';
import { Message } from './Message';
import { IMessage, IRoom } from '../../types/types';

vi.mock('../../context/xmppProvider', () => ({
  useXmppClient: () => ({ client: { sendMessageReactionStanza: vi.fn() } }),
}));

const ROOM_JID = 'room1@conference.example.com';
const SENDER_ID = 'them@example.com';

const makeMessage = (overrides: Partial<IMessage> = {}): IMessage =>
  ({
    id: 'm1',
    body: 'hello',
    date: new Date().toISOString(),
    roomJid: ROOM_JID,
    user: { id: SENDER_ID, name: 'Them' },
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

function renderMessage(message: IMessage, usersSet: Record<string, any> = {}) {
  return renderWithProviders(
    <Message message={message} isUser={false} isReply={false} />,
    {
      preloadedState: {
        chatSettingStore: { user: { xmppUsername: 'me' }, config: {} } as any,
        rooms: {
          rooms: { [ROOM_JID]: makeRoom() },
          usersSet,
        } as any,
      },
    }
  );
}

// Reported bug: senders with a real photo (2,524 of 3,483 known users on a
// real account, measured live via usersSet) still showed a blank initials
// circle in the message bubble - the photo check only ever read
// `message.user.profileImage`, which is absent from every cache-restored
// message (see PERSISTED_MESSAGE_USER_FIELDS) and not reliably present on
// live ones either. usersSet is the store the rest of the app already
// resolves avatars (and names) through.
describe('Message - sender avatar resolves through usersSet', () => {
  it('shows the photo from usersSet even when the message itself carries none', () => {
    const { container } = renderMessage(makeMessage(), {
      them: { firstName: 'Them', lastName: '', profileImage: 'https://cdn.example.com/them.jpg' },
    });

    const img = container.querySelector('img[alt="userIcon"]') as HTMLImageElement | null;
    expect(img).toBeTruthy();
    expect(img?.src).toBe('https://cdn.example.com/them.jpg');
  });

  it('falls back to initials when neither usersSet nor the message has a photo', () => {
    const { container } = renderMessage(makeMessage(), {
      them: { firstName: 'Them', lastName: '' },
    });

    expect(container.querySelector('img[alt="userIcon"]')).toBeNull();
  });

  it("usersSet's photo wins over a stale one already on the message", () => {
    const message = makeMessage({
      user: { id: SENDER_ID, name: 'Them', profileImage: 'https://cdn.example.com/old.jpg' } as any,
    });
    const { container } = renderMessage(message, {
      them: { firstName: 'Them', lastName: '', profileImage: 'https://cdn.example.com/new.jpg' },
    });

    const img = container.querySelector('img[alt="userIcon"]') as HTMLImageElement | null;
    expect(img?.src).toBe('https://cdn.example.com/new.jpg');
  });

  it('falls back to the message-level photo for a sender usersSet has never heard of (e.g. a broadcast sender)', () => {
    const message = makeMessage({
      user: { id: SENDER_ID, name: 'Them', profileImage: 'https://cdn.example.com/only-on-message.jpg' } as any,
    });
    const { container } = renderMessage(message, {});

    const img = container.querySelector('img[alt="userIcon"]') as HTMLImageElement | null;
    expect(img?.src).toBe('https://cdn.example.com/only-on-message.jpg');
  });
});
