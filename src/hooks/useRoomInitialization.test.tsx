import { describe, expect, it, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useRoomInitialization } from './useRoomInitialization';

// Regression: on room activation, useRoomInitialization used to call
// client.presenceInRoomStanza twice for the same JID - once from the "fast
// join" effect and once again from getDefaultHistory - sending a duplicate
// MUC <presence> join over the wire. The two effects must now share a
// single in-flight join promise per activation.

const dispatchMock = vi.fn();
vi.mock('react-redux', () => ({
  useDispatch: () => dispatchMock,
}));
vi.mock('../roomStore/roomsSlice', () => ({
  setIsLoading: (payload: any) => ({ type: 'setIsLoading', payload }),
}));
vi.mock('./useGetNewArchRoom', () => ({
  default: () => vi.fn(async () => []),
}));

let mockClient: any;
vi.mock('../context/xmppProvider', () => ({
  useXmppClient: () => ({ client: mockClient }),
}));

const makeClient = () => {
  let resolveJoin: (v: boolean) => void = () => {};
  const joinPromise = new Promise<boolean>((resolve) => {
    resolveJoin = resolve;
  });
  return {
    presenceInRoomStanza: vi.fn(() => joinPromise),
    prioritizeRoomPresence: vi.fn(() => Promise.resolve(true)),
    setActiveRoomJid: vi.fn(),
    promoteRoomHistory: vi.fn(),
    getRoomInfoStanza: vi.fn(),
    getHistoryStanza: vi.fn(async () => []),
    getRoomsStanza: vi.fn(async () => {}),
    __resolveJoin: (v: boolean) => resolveJoin(v),
  };
};

describe('useRoomInitialization - duplicate presence on room switch', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    dispatchMock.mockClear();
  });

  it('joins the active room only once per activation', async () => {
    mockClient = makeClient();

    const { unmount } = renderHook(() =>
      useRoomInitialization(
        'room1@conference.example.com',
        { 'room1@conference.example.com': { messages: [] } } as any,
        {} as any,
        0
      )
    );

    // Let the microtask queue flush so both effects (and getDefaultHistory's
    // await of the shared join) have had a chance to run.
    mockClient.__resolveJoin(true);
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    expect(mockClient.presenceInRoomStanza).toHaveBeenCalledTimes(1);

    unmount();
  });
});
