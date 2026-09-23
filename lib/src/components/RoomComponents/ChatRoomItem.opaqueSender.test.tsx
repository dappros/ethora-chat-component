import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import ChatRoomItem from './ChatRoomItem';
import { renderWithProviders } from '../../test/renderWithProviders';
import { IRoom, LastMessage } from '../../types/types';

const noop = () => {};

const OPAQUE_ID = '646cc8dc96d4a4dc8f7b2f2d_6ab3bdf50708e7041e0f8b96';

const makeRoom = (overrides: Partial<IRoom> = {}): IRoom =>
  ({
    jid: 'room1@conference.example.com',
    title: 'Room One',
    name: 'Room One',
    messages: [],
    ...overrides,
  }) as IRoom;

// Regression: a brand-new user's profile lookup 400s for a while, so
// usersSet never gets an entry for them - the preview used to fall all the
// way through to the raw opaque xmpp id, a 50-character hex string, printed
// as the sender name (and it broke the row's fixed-width layout). It must
// render nothing for the name instead, leaving just the message body.
describe('ChatRoomItem - opaque sender id in the preview', () => {
  it('renders no sender name (and not the raw id) when nothing resolves a name', () => {
    const lastMessage: LastMessage = {
      id: 'msg-1',
      roomJid: 'room1@conference.example.com',
      body: 'hello from a brand new user',
      date: '2026-09-16T10:00:00.000Z',
      user: { id: OPAQUE_ID, name: '' },
    } as LastMessage;

    renderWithProviders(
      <ChatRoomItem
        chat={makeRoom({ messages: [], lastMessage })}
        isChatActive={false}
        performClick={noop}
        config={{} as never}
      />
    );

    expect(screen.getByText('hello from a brand new user')).not.toBeNull();
    expect(screen.queryByText(OPAQUE_ID, { exact: false })).toBeNull();
  });

  it('renders the name once the API seed carries senderFirstName/senderLastName (composed into user.name)', () => {
    const lastMessage: LastMessage = {
      id: 'msg-2',
      roomJid: 'room1@conference.example.com',
      body: 'hello again',
      date: '2026-09-16T10:05:00.000Z',
      user: { id: OPAQUE_ID, name: 'фів фів' },
    } as LastMessage;

    renderWithProviders(
      <ChatRoomItem
        chat={makeRoom({ messages: [], lastMessage })}
        isChatActive={false}
        performClick={noop}
        config={{} as never}
      />
    );

    expect(screen.getByText('фів фів')).not.toBeNull();
    expect(screen.getByText('hello again')).not.toBeNull();
  });
});
