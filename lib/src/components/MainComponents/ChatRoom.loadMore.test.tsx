import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import { updateRoom } from '../../roomStore/roomsSlice';
import ChatRoom from './ChatRoom';

const ROOM = 'room-a@conference.example.com';
const SELF = 'me_1234@example.com';

const captured: { load: any } = { load: null };
vi.mock('./MessageList', () => ({
  default: (props: any) => {
    captured.load = props.loadMoreMessages;
    return null;
  },
}));

const getHistoryStanza = vi.fn();
const clientMock = {
  client: {
    getHistoryStanza: (...a: any[]) => getHistoryStanza(...a),
    setActiveRoomJid: () => undefined,
    actionSetTimestampToPrivateStoreStanza: () => Promise.resolve(),
  },
  providerBootstrapStatus: 'ready',
  initMode: 'chat',
};
vi.mock('../../context/xmppProvider', () => ({
  useXmppClient: () => clientMock,
}));
vi.mock('../../context/xmppProvider.tsx', () => ({
  useXmppClient: () => clientMock,
}));
vi.mock('../../hooks/useRoomInitialization.tsx', () => ({
  useRoomInitialization: () => undefined,
}));

const m = (id: number) => ({
  id: String(id),
  body: 'm' + id,
  date: new Date(id).toISOString(),
  roomJid: ROOM,
  user: { id: 'peer_1@example.com', name: 'Peer' },
});

const setup = (messages: any[], historyComplete = false) => {
  const storeRef = { current: null as any };
  renderWithProviders(<ChatRoom />, {
    storeRef,
    preloadedState: {
      chatSettingStore: {
        user: { xmppUsername: SELF, firstName: 'Me', lastName: 'U' },
        config: { disableHeader: true },
      } as any,
      rooms: {
        rooms: {
          [ROOM]: {
            jid: ROOM,
            name: 'Room',
            title: 'Room',
            usersCnt: 2,
            messages,
            isLoading: false,
            roomBg: null,
            historyPreloadState: 'idle',
            historyComplete,
          },
        },
        activeRoomJID: ROOM,
        isChatUiVisible: true,
        editAction: { isEdit: false },
        isLoading: false,
        usersSet: {},
        presenceByRoom: {},
        reportRoom: { isOpen: false },
        subscribedRooms: [],
        pushSubscriptionStatus: {},
        drafts: {},
      } as any,
    },
  });
  return storeRef;
};

describe('ChatRoom loadMoreMessages', () => {
  beforeEach(() => {
    getHistoryStanza.mockReset();
    captured.load = null;
  });

  it('reads the latest historyComplete from the store, not a stale render', async () => {
    getHistoryStanza.mockResolvedValue(undefined);
    const storeRef = setup([m(100), m(200), m(300)]);
    const stale = captured.load;
    await act(async () => {
      storeRef.current.dispatch(
        updateRoom({ jid: ROOM, updates: { historyComplete: true } })
      );
    });
    await stale(ROOM, 20, 100);
    expect(getHistoryStanza).not.toHaveBeenCalled();
  });

  it('requests with the given cursor and the active source', async () => {
    getHistoryStanza.mockResolvedValue(undefined);
    setup([m(100), m(200)]);
    await captured.load(ROOM, 20, 150);
    expect(getHistoryStanza).toHaveBeenCalledWith(ROOM, 20, 150, undefined, {
      source: 'active',
    });
  });

  it('does not overlap requests for the same room', async () => {
    let resolve!: () => void;
    getHistoryStanza.mockImplementation(
      () => new Promise<void>((r) => (resolve = r))
    );
    setup([m(100), m(200)]);
    const first = captured.load(ROOM, 20, 100);
    const second = captured.load(ROOM, 20, 100);
    await second;
    expect(getHistoryStanza).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolve();
      await first;
    });
    getHistoryStanza.mockResolvedValue(undefined);
    await captured.load(ROOM, 20, 100);
    expect(getHistoryStanza).toHaveBeenCalledTimes(2);
  });

  it('settles on error and frees the room for the next request', async () => {
    getHistoryStanza.mockRejectedValueOnce(new Error('boom'));
    setup([m(100), m(200)]);
    await expect(captured.load(ROOM, 20, 100)).resolves.toBeUndefined();
    getHistoryStanza.mockResolvedValue(undefined);
    await captured.load(ROOM, 20, 100);
    expect(getHistoryStanza).toHaveBeenCalledTimes(2);
  });

  it('falls back to the second-to-last message id', async () => {
    getHistoryStanza.mockResolvedValue(undefined);
    setup([m(100), m(200), m(300)]);
    await captured.load(ROOM, 20);
    expect(getHistoryStanza.mock.calls[0][2]).toBe(200);
  });

  it('fallback with one message uses it', async () => {
    getHistoryStanza.mockResolvedValue(undefined);
    setup([m(100)]);
    await captured.load(ROOM, 20);
    expect(getHistoryStanza.mock.calls[0][2]).toBe(100);
  });

  it('fallback with no messages does not throw', async () => {
    getHistoryStanza.mockResolvedValue(undefined);
    // MessageList is not mounted for an empty room: take the callback while a
    // message exists, then empty the room.
    const storeRef = setup([m(100)]);
    await act(async () => {
      storeRef.current.dispatch(
        updateRoom({ jid: ROOM, updates: { messages: [] } })
      );
    });
    await expect(captured.load(ROOM, 20)).resolves.toBeUndefined();
    expect(getHistoryStanza.mock.calls[0][2]).toBeUndefined();
  });
});
