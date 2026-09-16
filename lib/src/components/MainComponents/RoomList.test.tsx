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

describe('RoomList - FLIP reposition on resort', () => {
  // jsdom has no real layout engine - getBoundingClientRect() always
  // reports zeros - so this can't assert real pixel positions or a visible
  // slide the way a browser test could. Instead it stubs
  // getBoundingClientRect() per row (keyed by the row's own text) to stand
  // in for "the row moved on screen", and asserts the FLIP code path
  // actually runs: an already-settled row that changes position gets an
  // inverted transform applied synchronously (no transition) during the
  // resort's layout effect, then - once the rAF callback fires - the
  // transform is released with a transition so the browser can animate it
  // back to rest. This guards the mechanism (measure -> invert -> play)
  // without depending on jsdom producing real coordinates.
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const rowWrapper = (title: string) =>
    screen.getByRole('button', { name: title }).parentElement as HTMLElement;

  it('inverts then releases a transform on a row that resorts, and leaves a freshly-mounted row alone', () => {
    const tops: Record<string, number> = { 'Room A': 64, 'Room B': 0 };
    vi.spyOn(
      HTMLElement.prototype,
      'getBoundingClientRect'
    ).mockImplementation(function (this: HTMLElement) {
      const label = this.textContent?.includes('Room A')
        ? 'Room A'
        : this.textContent?.includes('Room B')
          ? 'Room B'
          : 'other';
      return {
        top: tops[label] ?? 0,
        bottom: 0,
        left: 0,
        right: 0,
        width: 0,
        height: 0,
        x: 0,
        y: 0,
        toJSON: () => {},
      } as DOMRect;
    });

    const rafCallbacks: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    });
    const flushRaf = () => {
      const pending = rafCallbacks.splice(0, rafCallbacks.length);
      pending.forEach((cb) => cb(0));
    };

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

    // Mount: Room B is newer, so it sorts first (top:0), Room A second
    // (top:64) - matches the `tops` stub above. The mount render only
    // records these as the baseline; it must not apply a FLIP transform
    // (there's nothing to FLIP from yet).
    const { rerender } = renderWithProviders(
      <RoomList chats={[roomB, roomA]} />
    );
    expect(rowWrapper('Room A').style.transform).toBe('');
    expect(rowWrapper('Room B').style.transform).toBe('');

    // Room A gets a newer message and resorts to the top, swapping places
    // with Room B - simulate the resulting layout shift via the stub.
    const roomANewMessage = room({
      jid: 'a@conference.example.com',
      title: 'Room A',
      messages: [{ id: '3', date: '2024-01-03T00:00:00.000Z' } as any],
    });
    tops['Room A'] = 0;
    tops['Room B'] = 64;

    rerender(<RoomList chats={[roomANewMessage, roomB]} />);

    // Both rows moved (A: 64 -> 0, B: 0 -> 64), so the layout effect should
    // have inverted each one back to its old visual spot with no
    // transition, ready to be released into an animated return on the next
    // frame.
    expect(rowWrapper('Room A').style.transition).toBe('none');
    expect(rowWrapper('Room A').style.transform).toBe('translateY(64px)');
    expect(rowWrapper('Room B').style.transition).toBe('none');
    expect(rowWrapper('Room B').style.transform).toBe('translateY(-64px)');

    flushRaf();

    // Released: transform cleared and a transition declared so the browser
    // animates the row back to rest instead of snapping.
    expect(rowWrapper('Room A').style.transform).toBe('');
    expect(rowWrapper('Room A').style.transition).toContain('transform');
    expect(rowWrapper('Room B').style.transform).toBe('');
    expect(rowWrapper('Room B').style.transition).toContain('transform');
  });

  it('does not FLIP a genuinely new row (no previous position to invert from)', () => {
    const tops: Record<string, number> = { 'Room A': 0 };
    vi.spyOn(
      HTMLElement.prototype,
      'getBoundingClientRect'
    ).mockImplementation(function (this: HTMLElement) {
      const label = this.textContent?.includes('Room A')
        ? 'Room A'
        : this.textContent?.includes('Room C')
          ? 'Room C'
          : 'other';
      return {
        top: tops[label] ?? 0,
        bottom: 0,
        left: 0,
        right: 0,
        width: 0,
        height: 0,
        x: 0,
        y: 0,
        toJSON: () => {},
      } as DOMRect;
    });

    const roomA = room({
      jid: 'a@conference.example.com',
      title: 'Room A',
      messages: [{ id: '1', date: '2024-01-01T00:00:00.000Z' } as any],
    });

    const { rerender } = renderWithProviders(<RoomList chats={[roomA]} />);

    // A brand-new room joins the top of the list, pushing Room A down. Room
    // C has no entry in `rowPositionsRef` from a prior render, so it must
    // not receive a FLIP transform - it plays its entrance animation
    // instead (covered by the entrance-animation describe block above).
    const roomC = room({
      jid: 'c@conference.example.com',
      title: 'Room C',
      messages: [{ id: '2', date: '2024-01-02T00:00:00.000Z' } as any],
    });
    tops['Room A'] = 64;
    tops['Room C'] = 0;

    rerender(<RoomList chats={[roomC, roomA]} />);

    expect(rowWrapper('Room C').style.transform).toBe('');
    // Room A did move (0 -> 64) and was already on screen, so it still
    // gets FLIPped even though a new row was inserted above it.
    expect(rowWrapper('Room A').style.transition).toBe('none');
    expect(rowWrapper('Room A').style.transform).toBe('translateY(-64px)');
  });
});

describe('RoomList - sort order (API lastMessage as an activity signal)', () => {
  // Order-in-the-DOM helper: each room row is a button whose accessible
  // name is the room title (same pattern the animation tests above use).
  // getAllByRole returns elements in document order, so filtering it down
  // to just the titles under test reads back the actual sort order the
  // comparator produced, not an assumed array index.
  const renderedOrder = (titles: string[]) =>
    screen
      .getAllByRole('button')
      .map((el) => el.getAttribute('aria-label') ?? el.textContent ?? '')
      .filter((name) => titles.some((title) => name.includes(title)));

  it('sorts a room with no loaded history by its API lastMessage.createdAt instead of sinking to the bottom', () => {
    const roomWithOldHistory = room({
      jid: 'old@conference.example.com',
      title: 'Old Loaded Room',
      messages: [{ id: '1', date: '2024-01-01T00:00:00.000Z' } as any],
    });
    // No messages loaded yet, but the API told us this room had recent
    // activity - it must not be treated as having no signal at all.
    const roomWithApiSeedOnly = room({
      jid: 'seed@conference.example.com',
      title: 'Api Seeded Room',
      messages: [],
      lastMessage: { body: 'hi', date: '2024-06-01T00:00:00.000Z' } as any,
    });

    renderWithProviders(
      <RoomList chats={[roomWithOldHistory, roomWithApiSeedOnly]} />
    );

    expect(
      renderedOrder(['Old Loaded Room', 'Api Seeded Room'])
    ).toEqual(['Api Seeded Room', 'Old Loaded Room']);
  });

  it('lets a live loaded message outrank a stale-by-comparison API lastMessage seed on the same room', () => {
    // roomLive carries an API lastMessage seed dated well after roomOther's
    // only loaded message - if the seed were still consulted once real
    // history exists, roomLive would incorrectly rank first.
    const roomLive = room({
      jid: 'live@conference.example.com',
      title: 'Live History Room',
      messages: [{ id: '1', date: '2024-01-01T00:00:00.000Z' } as any],
      lastMessage: { body: 'stale seed', date: '2024-06-01T00:00:00.000Z' } as any,
    });
    const roomOther = room({
      jid: 'other@conference.example.com',
      title: 'Other Room',
      messages: [{ id: '2', date: '2024-03-01T00:00:00.000Z' } as any],
    });

    renderWithProviders(<RoomList chats={[roomLive, roomOther]} />);

    // roomLive's real message (Jan) is older than roomOther's (Mar), so the
    // live signal - not the newer-looking API seed - must decide the order.
    expect(
      renderedOrder(['Live History Room', 'Other Room'])
    ).toEqual(['Other Room', 'Live History Room']);
  });

  it('orders rooms with no lastMessage at all exactly as before (unaffected by the new fallback step)', () => {
    const roomNewer = room({
      jid: 'newer@conference.example.com',
      title: 'Newer Room',
      messages: [{ id: '1', date: '2024-05-01T00:00:00.000Z' } as any],
    });
    const roomOlder = room({
      jid: 'older@conference.example.com',
      title: 'Older Room',
      messages: [{ id: '2', date: '2024-01-01T00:00:00.000Z' } as any],
    });

    renderWithProviders(<RoomList chats={[roomOlder, roomNewer]} />);

    expect(
      renderedOrder(['Newer Room', 'Older Room'])
    ).toEqual(['Newer Room', 'Older Room']);
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
