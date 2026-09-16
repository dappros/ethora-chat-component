import { describe, expect, it, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

// Entering a room by link (QR code, shared URL, push deep link) when the
// user is not a member yet. The MUC presence join is what registers the
// membership server-side, so the room list refetch has to happen AFTER the
// join settles, and it has to bypass the 60s /chats/my cache - otherwise the
// room only shows up after a full page reload.

const dispatchMock = vi.fn();
vi.mock('react-redux', () => ({
  useDispatch: () => dispatchMock,
}));
vi.mock('../roomStore/roomsSlice', () => ({
  setIsLoading: (payload: any) => ({ type: 'setIsLoading', payload }),
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
  dispatchMock.mockClear();
  syncRoomsMock.mockClear();
  order.length = 0;
  syncRoomsResult = [];
});

describe('useRoomInitialization - entering a room by link', () => {
  it('refetches the room list only after the MUC join settles', async () => {
    mockClient = makeClient();

    const { unmount } = renderHook(() =>
      useRoomInitialization(UNKNOWN_JID, {} as any, {} as any, 0)
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
      useRoomInitialization(UNKNOWN_JID, {} as any, {} as any, 0)
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
      useRoomInitialization(UNKNOWN_JID, {} as any, {} as any, 0)
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
      useRoomInitialization(UNKNOWN_JID, {} as any, {} as any, 0)
    );
    await flush();

    expect(syncRoomsMock).toHaveBeenCalledTimes(1);

    unmount();
  });

  it('does not refetch the room list for a room already in the list', async () => {
    mockClient = makeClient();

    const { unmount } = renderHook(() =>
      useRoomInitialization(
        KNOWN_JID,
        { [KNOWN_JID]: { messages: [] } } as any,
        {} as any,
        0
      )
    );
    await flush();

    expect(syncRoomsMock).not.toHaveBeenCalled();

    unmount();
  });
});
