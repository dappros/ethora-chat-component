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
    unreadMessages: 2,
    ...overrides,
  }) as IRoom;

const renderRoom = (chat: IRoom) =>
  renderWithProviders(
    <ChatRoomItem
      chat={chat}
      isChatActive={false}
      performClick={noop}
      config={{} as never}
    />
  );

describe('ChatRoomItem unread badge', () => {
  it.each(['idle', 'loading', 'partial', 'done'] as const)(
    'shows the stored count in every history state (%s), never hidden mid-load',
    (state) => {
      renderRoom(makeRoom({ historyPreloadState: state }));
      expect(screen.getByText('2')).toBeTruthy();
    }
  );

  it('shows nothing for a zero count', () => {
    renderRoom(makeRoom({ unreadMessages: 0, historyPreloadState: 'loading' }));
    expect(screen.queryByText('0')).toBeNull();
  });
});
