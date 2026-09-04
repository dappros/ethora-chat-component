import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import RoomList from './RoomList';
import { IRoom } from '../../types/types';
import { getMyFiles } from '../../networking/api-requests/files.api';
import http from '../../networking/apiClient';

// RoomList reads the xmpp client via context - sidestep mounting a real
// XmppProvider, same pattern as MessageList.markRead.test.tsx.
vi.mock('../../context/xmppProvider', () => ({
  useXmppClient: () => ({ client: null, setClient: vi.fn() }),
}));

// The real Files panel fetches /v2/files and has its own tests; here we only
// care that the tab switcher mounts it.
vi.mock('../Files/FilesPanel', () => ({
  default: () => <div>files-panel-stub</div>,
}));

// files.api talks to the real apiClient http instance; mock just its get()
// so getMyFiles() can be driven to a 404 without a network layer.
vi.mock('../../networking/apiClient', () => ({
  default: { get: vi.fn(), delete: vi.fn() },
}));

const room = (overrides: Partial<IRoom> = {}): IRoom =>
  ({
    jid: 'room1@conference.example.com',
    title: 'Room One',
    name: 'Room One',
    messages: [],
    unreadMessages: 0,
    ...overrides,
  }) as IRoom;

afterEach(async () => {
  const { __resetFilesEndpointSupportForTests } = await import(
    '../../networking/api-requests/files.api'
  );
  __resetFilesEndpointSupportForTests();
});

describe('RoomList - tab switcher', () => {
  it('shows the segmented Chats/Files control by default and switches tabs', () => {
    renderWithProviders(<RoomList chats={[room()]} />);

    expect(screen.getByRole('tab', { name: 'Chats' })).toBeInTheDocument();
    const filesTab = screen.getByRole('tab', { name: 'Files' });
    expect(filesTab).toBeInTheDocument();

    // Chat rows are visible on the default "chats" tab.
    expect(screen.getByText('Room One')).toBeInTheDocument();

    fireEvent.click(filesTab);

    // Switching to "files" mounts the Files placeholder and hides the room row.
    expect(screen.getByText('files-panel-stub')).toBeInTheDocument();
    expect(screen.queryByText('Room One')).not.toBeInTheDocument();
  });

  it('hides the tab switcher when config.filesTab.enabled is false', () => {
    renderWithProviders(
      <RoomList chats={[room()]} />, // eslint-disable-line
      {
        preloadedState: {
          chatSettingStore: {
            config: { filesTab: { enabled: false } },
          } as any,
        },
      }
    );

    expect(screen.queryByRole('tab', { name: 'Files' })).not.toBeInTheDocument();
    expect(screen.getByText('Room One')).toBeInTheDocument();
  });

  it('hides the Files tab once the backend proves /v2/files is unsupported (404)', async () => {
    // config.filesTab.enabled is left unset (auto-detect). Drive the module-
    // level support state the same way a real 404 response would: through
    // getMyFiles() itself, so this exercises the actual detection path
    // rather than a hook mock.
    const axios404 = Object.assign(new Error('Not Found'), {
      response: { status: 404 },
    });
    vi.mocked(http.get).mockRejectedValueOnce(axios404);
    await expect(getMyFiles({ limit: 50, offset: 0 })).rejects.toBe(axios404);

    renderWithProviders(<RoomList chats={[room()]} />);

    await waitFor(() =>
      expect(
        screen.queryByRole('tab', { name: 'Files' })
      ).not.toBeInTheDocument()
    );
    // Falls back to the chats view (the only view left) rather than a
    // blank/dead panel.
    expect(screen.getByText('Room One')).toBeInTheDocument();
  });
});

describe('RoomList - entrance animation', () => {
  // filteredChats is sorted by activity, so one room getting a new message
  // shifts every other room's array index - and AnimatedRow's $delay used
  // to be computed straight from that index. styled-components regenerates
  // an element's class whenever a prop it's keyed on changes, and swapping
  // an element's class re-declares the `animation` shorthand, which the CSS
  // spec restarts from the beginning even if it's the same keyframe - so a
  // single resort used to replay the fade-in-up on every row whose index
  // merely shifted, not just the row that changed. RoomList now assigns the
  // stagger delay once per jid (first render only) and renders every later
  // occurrence with $skipAnimation, so this asserts the fix at the DOM
  // level: the AnimatedRow wrapper's class for a settled row must stay
  // byte-for-byte identical across a resort.
  const roomRowWrapperClass = (title: string) =>
    screen.getByRole('button', { name: title }).parentElement?.className;

  it('does not re-trigger the entrance class on a resort, but still animates a genuinely new row', () => {
    const roomA = room({
      jid: 'a@conference.example.com',
      title: 'Room A',
      messages: [{ id: '1', date: '2024-01-01T00:00:00.000Z' } as any],
    });
    const roomB = room({
      jid: 'b@conference.example.com',
      title: 'Room B',
      messages: [{ id: '2', date: '2024-01-02T00:00:00.000Z' } as any],
    });

    const { rerender } = renderWithProviders(
      <RoomList chats={[roomA, roomB]} />
    );

    // Render #1 (mount): both rows are seen for the very first time, so
    // both legitimately play the entrance animation here - that's the
    // intended one-time behavior, not the bug under test.

    // Render #2: same rooms, unchanged order/content. Both jids are
    // already recorded, so both settle into their non-animating class.
    // This is the "already played" state every subsequent render must
    // preserve - captured here rather than at mount, since mount-to-settled
    // is the expected one-time transition, not a replay.
    rerender(<RoomList chats={[roomA, roomB]} />);
    const settledClassA = roomRowWrapperClass('Room A');
    const settledClassB = roomRowWrapperClass('Room B');

    // Render #3: Room A gets a new (later) message and resorts to the top.
    // Room B's content is untouched - only its index shifted. Neither
    // should replay the entrance animation.
    const roomANewMessage = room({
      jid: 'a@conference.example.com',
      title: 'Room A',
      messages: [{ id: '3', date: '2024-01-03T00:00:00.000Z' } as any],
    });
    rerender(<RoomList chats={[roomANewMessage, roomB]} />);

    expect(roomRowWrapperClass('Room A')).toBe(settledClassA);
    expect(roomRowWrapperClass('Room B')).toBe(settledClassB);

    // Render #4: a genuinely new room (never rendered before) is added.
    // It must still get the entrance treatment - a fresh, non-settled
    // class distinct from the already-settled rows.
    const roomC = room({
      jid: 'c@conference.example.com',
      title: 'Room C',
      messages: [{ id: '4', date: '2024-01-04T00:00:00.000Z' } as any],
    });
    rerender(<RoomList chats={[roomC, roomANewMessage, roomB]} />);

    expect(roomRowWrapperClass('Room A')).toBe(settledClassA);
    expect(roomRowWrapperClass('Room B')).toBe(settledClassB);
    expect(roomRowWrapperClass('Room C')).not.toBe(settledClassA);

    // Render #5: Room C, having now been seen once, settles too and stays
    // stable through a further resort - same guarantee applied to it.
    const roomCNewMessage = room({
      jid: 'c@conference.example.com',
      title: 'Room C',
      messages: [{ id: '5', date: '2024-01-05T00:00:00.000Z' } as any],
    });
    rerender(<RoomList chats={[roomCNewMessage, roomANewMessage, roomB]} />);
    const settledClassC = roomRowWrapperClass('Room C');

    rerender(<RoomList chats={[roomB, roomANewMessage, roomCNewMessage]} />);
    expect(roomRowWrapperClass('Room A')).toBe(settledClassA);
    expect(roomRowWrapperClass('Room B')).toBe(settledClassB);
    expect(roomRowWrapperClass('Room C')).toBe(settledClassC);
  });

  it('does not re-animate a row that search filtering temporarily hid and then re-showed', () => {
    const roomA = room({
      jid: 'a@conference.example.com',
      title: 'Room A',
      messages: [{ id: '1', date: '2024-01-01T00:00:00.000Z' } as any],
    });
    const roomB = room({
      jid: 'b@conference.example.com',
      title: 'Room B',
      messages: [{ id: '2', date: '2024-01-02T00:00:00.000Z' } as any],
    });

    renderWithProviders(<RoomList chats={[roomA, roomB]} />);

    // Settle both rows the same way as above.
    fireEvent.change(screen.getByTestId('rooms_search_input'), {
      target: { value: 'zzz-no-match' },
    });
    expect(screen.queryByText('Room A')).not.toBeInTheDocument();

    fireEvent.change(screen.getByTestId('rooms_search_input'), {
      target: { value: '' },
    });
    const settledClassA = roomRowWrapperClass('Room A');
    const settledClassB = roomRowWrapperClass('Room B');

    // Filter Room A out again, then back in - it was already in the DOM
    // once before, so re-showing it must not replay the entrance.
    fireEvent.change(screen.getByTestId('rooms_search_input'), {
      target: { value: 'Room B' },
    });
    expect(screen.queryByText('Room A')).not.toBeInTheDocument();

    fireEvent.change(screen.getByTestId('rooms_search_input'), {
      target: { value: '' },
    });

    expect(roomRowWrapperClass('Room A')).toBe(settledClassA);
    expect(roomRowWrapperClass('Room B')).toBe(settledClassB);
  });
});

describe('RoomList - loading skeleton', () => {
  it('renders skeleton rows instead of an empty list while rooms are loading', () => {
    renderWithProviders(<RoomList chats={[]} />, {
      preloadedState: {
        rooms: { isLoading: true, rooms: {}, activeRoomJID: null } as any,
      },
    });

    // Exactly SKELETON_ROW_COUNT placeholder rows, not just "some children" -
    // a regression that rendered zero, one, or the wrong shape of skeleton
    // markup would previously still pass this assertion.
    expect(screen.getByTestId('rooms_list').children).toHaveLength(6);
    expect(screen.queryByText('Room One')).not.toBeInTheDocument();
  });
});
