import { describe, expect, it, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

// Entering a room by link (QR code, shared URL, push deep link) when the
// user is not a member yet. The MUC presence join is what registers the
// membership server-side, so the room list refetch has to happen AFTER the
// join settles, and it has to bypass the 60s /chats/my cache - otherwise the
// room only shows up after a full page reload.

const dispatchMock = vi.fn();
// The hook reads the rooms map from the store at effect time. Tests set
// `mockRooms` to the room list they want the hook to see.
let mockRooms: Record<string, any> = {};
vi.mock('react-redux', () => {
  const getState = () => ({ rooms: { rooms: mockRooms } });
  return {
    useDispatch: () => dispatchMock,
    useStore: () => ({ getState }),
    useSelector: (selector: (state: unknown) => unknown) => selector(getState()),
  };
});
vi.mock('../roomStore/roomsSlice', () => ({
  setIsLoading: (payload: any) => ({ type: 'setIsLoading', payload }),
  setJoiningRoom: (payload: any) => ({ type: 'setJoiningRoom', payload }),
  clearJoiningRoom: (payload: any) => ({ type: 'clearJoiningRoom', payload }),
  addRoomViaApi: (payload: any) => ({ type: 'addRoomViaApi', payload }),
}));

// GET /chats/my/<name>: rejects (404) until a test says the membership exists.
let roomByNameResult: any = null;
const getRoomByNameMock = vi.fn(async (_name: string) => {
  if (!roomByNameResult) throw new Error('404');
  return roomByNameResult;
});
vi.mock('../networking/api-requests/rooms.api', () => ({
  getRoomByName: (name: string) => getRoomByNameMock(name),
}));
vi.mock('../helpers/createRoomFromApi', () => ({
  createRoomFromApi: (room: any, service: string) =>
    room?.name && service ? { jid: `${room.name}@${service}`, title: room.title } : null,
}));

const order: string[] = [];
let syncRoomsResult: any[] = [];
const syncRoomsMock = vi.fn(async (_c: any, _cfg: any, _opts?: any) => {
  order.push('syncRooms');
  return syncRoomsResult;
});
vi.mock('./useGetNewArchRoom', () => ({
  default: () => syncRoomsMock,
}));

let mockClient: any;
vi.mock('../context/xmppProvider', () => ({
  useXmppClient: () => ({ client: mockClient }),
}));

import { useRoomInitialization } from './useRoomInitialization';

const UNKNOWN_JID = 'app1_newroom@conference.example.com';
const KNOWN_JID = 'app1_known@conference.example.com';

const makeClient = () => ({
  presenceInRoomStanza: vi.fn(
    (_jid: string, _a: number, _b: number, fast: boolean) =>
      new Promise<boolean>((resolve) =>
        setTimeout(() => {
          if (!fast) order.push('join');
          resolve(true);
        }, 0)
      )
  ),
  prioritizeRoomPresence: vi.fn(() => Promise.resolve(true)),
  setActiveRoomJid: vi.fn(),
  promoteRoomHistory: vi.fn(),
  getRoomInfoStanza: vi.fn(),
  getHistoryStanza: vi.fn(async () => []),
  getRoomsStanza: vi.fn(async () => {}),
});

const flush = async () => {
  for (let i = 0; i < 12; i += 1) {
    await new Promise((r) => setTimeout(r, 0));
  }
};

afterEach(() => {
  mockRooms = {};
  dispatchMock.mockClear();
  syncRoomsMock.mockClear();
  order.length = 0;
  syncRoomsResult = [];
  roomByNameResult = null;
  getRoomByNameMock.mockClear();
});

describe('useRoomInitialization - entering a room by link', () => {
  it('refetches the room list only after the MUC join settles', async () => {
    mockClient = makeClient();

    const { unmount } = renderHook(() =>
      useRoomInitialization(UNKNOWN_JID, {} as any, 0)
    );
    await flush();

    expect(order).toContain('join');
    expect(order).toContain('syncRooms');
    expect(order.indexOf('join')).toBeLessThan(order.indexOf('syncRooms'));

    unmount();
  });

  it('bypasses the rooms cache for that refetch', async () => {
    mockClient = makeClient();

    const { unmount } = renderHook(() =>
      useRoomInitialization(UNKNOWN_JID, {} as any, 0)
    );
    await flush();

    expect(syncRoomsMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      { force: true }
    );

    unmount();
  });

  it('retries the refetch until the freshly joined room shows up', async () => {
    // The backend can register the membership a beat after the presence
    // call returns. A single refetch then misses the room and the user is
    // stuck looking at an empty pane until they reload the page.
    mockClient = makeClient();
    syncRoomsResult = [];

    const { unmount } = renderHook(() =>
      useRoomInitialization(UNKNOWN_JID, {} as any, 0)
    );
    // Real delay: the retry deliberately waits for the backend, so this
    // has to outlast the first backoff step.
    await new Promise((r) => setTimeout(r, 1400));

    expect(syncRoomsMock.mock.calls.length).toBeGreaterThan(1);

    unmount();
  });

  it('stops retrying as soon as the room is in the response', async () => {
    mockClient = makeClient();
    syncRoomsResult = [{ name: UNKNOWN_JID.split('@')[0] }];

    const { unmount } = renderHook(() =>
      useRoomInitialization(UNKNOWN_JID, {} as any, 0)
    );
    await flush();

    expect(syncRoomsMock).toHaveBeenCalledTimes(1);

    unmount();
  });

  it('does not refetch the room list for a room already in the list', async () => {
    mockClient = makeClient();
    mockRooms = { [KNOWN_JID]: { messages: [] } };

    const { unmount } = renderHook(() =>
      useRoomInitialization(KNOWN_JID, {} as any, 0)
    );
    await flush();

    expect(syncRoomsMock).not.toHaveBeenCalled();

    unmount();
  });

  it('raises the joining flag for the room, and clears it once the room is in the response', async () => {
    mockClient = makeClient();
    syncRoomsResult = [{ name: UNKNOWN_JID.split('@')[0] }];

    const { unmount } = renderHook(() =>
      useRoomInitialization(UNKNOWN_JID, {} as any, 0)
    );
    await flush();

    const types = dispatchMock.mock.calls
      .map(([a]) => a)
      .filter((a) => a.type === 'setJoiningRoom' || a.type === 'clearJoiningRoom');
    expect(types).toEqual([
      { type: 'setJoiningRoom', payload: UNKNOWN_JID },
      { type: 'clearJoiningRoom', payload: UNKNOWN_JID },
    ]);

    unmount();
  });

  it('keeps the joining flag through the retries and clears it when they run out', async () => {
    // A room that does not exist never shows up: the flag must not outlive
    // the retry schedule, or the pane would spin forever.
    vi.useFakeTimers();
    try {
      mockClient = makeClient();
      syncRoomsResult = [];

      const { unmount } = renderHook(() =>
        useRoomInitialization(UNKNOWN_JID, {} as any, 0)
      );
      const joiningCalls = () =>
        dispatchMock.mock.calls
          .map(([a]) => a)
          .filter(
            (a) => a.type === 'setJoiningRoom' || a.type === 'clearJoiningRoom'
          )
          .map((a) => a.type);

      await vi.advanceTimersByTimeAsync(2000);
      expect(joiningCalls()).toEqual(['setJoiningRoom']);

      await vi.advanceTimersByTimeAsync(20000);
      expect(joiningCalls()).toEqual(['setJoiningRoom', 'clearJoiningRoom']);
      // initial sync + one per retry step
      expect(syncRoomsMock).toHaveBeenCalledTimes(5);

      unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it('adds the room from GET /chats/my/<name> when the cached list still misses it', async () => {
    // /chats/my is cached server-side for 60s and a join does not drop that
    // cache, so the list keeps missing the room while the membership exists.
    mockClient = makeClient();
    syncRoomsResult = [];
    roomByNameResult = { result: { title: 'Public room', type: 'public' } };

    const { unmount } = renderHook(() =>
      useRoomInitialization(
        UNKNOWN_JID,
        { xmppSettings: { conference: 'conference.example.com' } } as any,
        0
      )
    );
    await flush();

    expect(getRoomByNameMock).toHaveBeenCalledWith(UNKNOWN_JID.split('@')[0]);
    const added = dispatchMock.mock.calls.map(([a]) => a).find((a) => a?.type === 'addRoomViaApi');
    expect(added?.payload.room).toEqual({ jid: UNKNOWN_JID, title: 'Public room' });
    expect(syncRoomsMock).toHaveBeenCalledTimes(1);

    unmount();
  });
});
