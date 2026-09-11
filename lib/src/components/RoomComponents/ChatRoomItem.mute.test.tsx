import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import ChatRoomItem from './ChatRoomItem';
import { renderWithProviders } from '../../test/renderWithProviders';
import { IRoom } from '../../types/types';

const noop = () => {};

const makeRoom = (overrides: Partial<IRoom> = {}): IRoom =>
  ({
    jid: 'room1@conference.example.com',
    title: 'Room One',
    name: 'Room One',
    messages: [],
    unreadMessages: 3,
    ...overrides,
  }) as IRoom;

describe('ChatRoomItem - muted room presentation', () => {
  it('shows a bell-off icon next to the title for a muted room', () => {
    renderWithProviders(
      <ChatRoomItem
        chat={makeRoom({ muted: true })}
        isChatActive={false}
        performClick={noop}
        config={{} as never}
      />
    );

    expect(document.querySelector('svg')).not.toBeNull();
  });

  it('does not show a bell-off icon for an unmuted room', () => {
    const { container } = renderWithProviders(
      <ChatRoomItem
        chat={makeRoom({ muted: false })}
        isChatActive={false}
        performClick={noop}
        config={{} as never}
      />
    );

    // The only other <svg> a room row can render here is the unread badge
    // has none (it's a styled div, not an icon) - the room has no members
    // online (no OnlineUsersPopover) and isn't composing, so the only icon
    // in play is the bell-off one.
    expect(container.querySelector('svg')).toBeNull();
  });

  it('renders the unread badge in neutral grey (not the accent colour) for a muted room', () => {
    renderWithProviders(
      <ChatRoomItem
        chat={makeRoom({ muted: true })}
        isChatActive={false}
        performClick={noop}
        config={{ colors: { primary: '#123456' } } as never}
      />
    );

    const badge = screen.getByText('3');
    expect(badge).toHaveStyle({ backgroundColor: '#8C8C8C' });
  });

  it('renders the unread badge in the accent colour for an unmuted room', () => {
    renderWithProviders(
      <ChatRoomItem
        chat={makeRoom({ muted: false })}
        isChatActive={false}
        performClick={noop}
        config={{ colors: { primary: '#123456' } } as never}
      />
    );

    const badge = screen.getByText('3');
    expect(badge).toHaveStyle({ backgroundColor: '#123456' });
  });
});
