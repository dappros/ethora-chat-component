import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import ChatRoomItem from './ChatRoomItem';
import { renderWithProviders } from '../../test/renderWithProviders';
import { IRoom, LastMessage } from '../../types/types';

const noop = () => {};

const makeRoom = (overrides: Partial<IRoom> = {}): IRoom =>
  ({
    jid: 'room1@conference.example.com',
    title: 'Room One',
    name: 'Room One',
    messages: [],
    ...overrides,
  }) as IRoom;

const apiSeed: LastMessage = {
  id: 'msg-1',
  roomJid: 'room1@conference.example.com',
  body: 'seeded from the API',
  date: '2026-09-16T10:00:00.000Z',
  user: { id: 'alice-id', name: 'Alice Smith' },
};

describe('ChatRoomItem - lastMessage preview seed', () => {
  it('shows the API-seeded lastMessage when the room has no loaded messages yet', () => {
    renderWithProviders(
      <ChatRoomItem
        chat={makeRoom({ messages: [], lastMessage: apiSeed })}
        isChatActive={false}
        performClick={noop}
        config={{} as never}
      />
    );

    expect(screen.getByText('seeded from the API')).not.toBeNull();
  });

  it('prefers a real loaded message over the API seed once one exists', () => {
    renderWithProviders(
      <ChatRoomItem
        chat={makeRoom({
          messages: [
            {
              id: 'live-1',
              roomJid: 'room1@conference.example.com',
              body: 'a real live message',
              date: '2026-09-16T11:00:00.000Z',
              user: { id: 'bob-id', name: 'Bob' },
            } as never,
          ],
          lastMessage: apiSeed,
        })}
        isChatActive={false}
        performClick={noop}
        config={{} as never}
      />
    );

    expect(screen.getByText('a real live message')).not.toBeNull();
    expect(screen.queryByText('seeded from the API')).toBeNull();
  });

  it('shows nothing from a stale seed once the room has messages, even if the seed is newer-looking', () => {
    // A stale API lastMessage can keep riding along on the room object
    // after real messages arrive (the reducer only refuses to erase it,
    // it doesn't clear it) - the render layer must ignore it regardless.
    renderWithProviders(
      <ChatRoomItem
        chat={makeRoom({
          messages: [
            {
              id: 'live-1',
              roomJid: 'room1@conference.example.com',
              body: 'older live message',
              date: '2026-09-16T09:00:00.000Z',
              user: { id: 'bob-id', name: 'Bob' },
            } as never,
          ],
          lastMessage: {
            ...apiSeed,
            body: 'a newer-looking but stale api seed',
            date: '2026-09-16T12:00:00.000Z',
          },
        })}
        isChatActive={false}
        performClick={noop}
        config={{} as never}
      />
    );

    expect(screen.getByText('older live message')).not.toBeNull();
    expect(
      screen.queryByText('a newer-looking but stale api seed')
    ).toBeNull();
  });

  it('does not render the API seed text when there is no seed and no live message', () => {
    renderWithProviders(
      <ChatRoomItem
        chat={makeRoom({ messages: [] })}
        isChatActive={false}
        performClick={noop}
        config={{} as never}
      />
    );

    expect(screen.queryByText('seeded from the API')).toBeNull();
  });
});
