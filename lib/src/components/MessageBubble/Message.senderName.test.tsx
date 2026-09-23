import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders } from '../../test/renderWithProviders';
import { Message } from './Message';
import { IMessage, IRoom } from '../../types/types';

vi.mock('../../context/xmppProvider', () => ({
  useXmppClient: () => ({ client: { sendMessageReactionStanza: vi.fn() } }),
}));

const ROOM_JID = 'room1@conference.example.com';
const SENDER_ID = '646cc8dc96d4a4dc8f7b2f2d_6ab3a116d1f5c231da4c84fd';

const makeMessage = (overrides: Partial<IMessage> = {}): IMessage =>
  ({
    id: 'm1',
    body: 'hello',
    date: new Date().toISOString(),
    roomJid: ROOM_JID,
    user: { id: SENDER_ID },
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

// Reported bug: a brand-new user's message renders with their raw xmpp id
// as the sender name in the bubble instead of their real name, and it stays
// that way for the rest of the session (only a reload fixes it). This is
// a real hit in usersSet (a member row was added for them, e.g. from a
// room-members refresh) whose firstName/lastName just haven't propagated
// yet - not a genuine miss. The old code trusted any usersSet entry's
// (possibly blank) name over the name already resolved onto the message
// itself (message.user.name, set by enrichMessageAuthor/
// resolveSenderDisplayName at insert time from the sender's own stanza).
describe('Message - sender display name does not regress to the raw xmpp id', () => {
  it('falls back to message.user.name when the usersSet entry has no first/last name', () => {
    const message = makeMessage({ user: { id: SENDER_ID, name: 'New User' } as any });
    const { getByText } = renderMessage(message, {
      [SENDER_ID]: { xmppUsername: SENDER_ID, firstName: '', lastName: '' },
    });

    expect(getByText('New User')).toBeTruthy();
    expect(() => getByText(SENDER_ID)).toThrow();
  });

  it('still prefers a real usersSet name over message.user.name once it resolves', () => {
    const message = makeMessage({ user: { id: SENDER_ID, name: 'Stale Name' } as any });
    const { getByText } = renderMessage(message, {
      [SENDER_ID]: { xmppUsername: SENDER_ID, firstName: 'Fresh', lastName: 'Name' },
    });

    expect(getByText('Fresh Name')).toBeTruthy();
  });

  // SENDER_ID here is an opaque machine-generated id (<24 hex>_<24 hex>),
  // not a human-readable handle - see isOpaqueXmppUserId. Printing a
  // 50-character hex string as someone's name is itself a bug, so the
  // fallback chain drops straight through to the existing 'Unknown' literal
  // instead of the raw id.
  it('falls back to "Unknown" rather than the raw opaque id when nothing else resolves at all', () => {
    const message = makeMessage({ user: { id: SENDER_ID } as any });
    const { getByText } = renderMessage(message, {
      [SENDER_ID]: { xmppUsername: SENDER_ID, firstName: '', lastName: '' },
    });

    expect(getByText('Unknown')).toBeTruthy();
    expect(() => getByText(SENDER_ID)).toThrow();
  });
});
