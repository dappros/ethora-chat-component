import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from '@testing-library/react';
import { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { renderWithProviders } from '../test/renderWithProviders';
import { localStorageConstants } from '../helpers/constants/LOCAL_STORAGE';
import { setCurrentRoom } from '../roomStore/roomsSlice';

const requestPendingPushClick = vi.fn(async (..._args: unknown[]) => true);

vi.mock('../utils/firebasePushNotifications', () => ({
  initPushNotifications: vi.fn(async () => null),
  listenForForegroundMessages: vi.fn(() => () => {}),
  requestPendingPushClick: (...args: unknown[]) => requestPendingPushClick(...args),
}));
vi.mock('../networking/api-requests/push.api', () => ({
  registerPushToken: vi.fn(),
}));
vi.mock('../utils/clientRegistry', () => ({
  getGlobalXmppClient: () => null,
}));

import usePushNotifications from './usePushNotifications';
import { useQRCodeChat } from './useQRCodeChatHandler';

const CONF = 'conference.test';
const ROOM_B = `app_b@${CONF}`;
const ROOM_C = `app_c@${CONF}`;
const PARKED = localStorageConstants.ETHORA_QR_CHAT_ID;

// The same two hooks ChatWrapper mounts: the push hook (through XmppProvider)
// and the URL / QR deep-link hook that re-asserts the room named by the url.
const Harness = ({ onClick }: { onClick?: () => void }) => {
  const dispatch = useDispatch();
  const rooms = useSelector((s: any) => s.rooms.rooms);
  const activeRoomJID = useSelector((s: any) => s.rooms.activeRoomJID);
  usePushNotifications({ enabled: true, onClick });
  useQRCodeChat(
    useCallback((params: { roomJID: string }) => dispatch(setCurrentRoom(params)), [dispatch]),
    CONF,
    { rooms, activeRoomJID, isReady: Object.keys(rooms || {}).length > 0 }
  );
  return null;
};

describe('usePushNotifications - push room vs room named by the landing url', () => {
  let swHandler: ((event: any) => void) | null = null;

  beforeEach(() => {
    swHandler = null;
    requestPendingPushClick.mockClear();
    localStorage.clear();
    window.history.replaceState({}, '', '/');
    (navigator as any).serviceWorker = {
      addEventListener: (_: string, cb: any) => {
        swHandler = cb;
      },
      removeEventListener: () => {},
    };
  });
  afterEach(() => {
    window.history.replaceState({}, '', '/');
  });

  const setup = (extra: Record<string, unknown> = {}, username = 'me') => {
    const storeRef: { current: any } = { current: null };
    renderWithProviders(<Harness />, {
      storeRef,
      preloadedState: {
        chatSettingStore: {
          config: { xmppSettings: { conference: CONF } },
          user: { xmppUsername: username, token: 'tok' },
        } as any,
        rooms: {
          rooms: { [ROOM_B]: { jid: ROOM_B, messages: [] }, [ROOM_C]: { jid: ROOM_C, messages: [] } },
          activeRoomJID: null,
          ...extra,
        } as any,
      },
    });
    return storeRef;
  };

  const tap = async (data: Record<string, unknown>) => {
    await act(async () => {
      swHandler?.({
        data: { type: 'PUSH_NOTIFICATION_CLICK', data, notification: { title: 'A', body: 'b' } },
      });
    });
  };

  // Settle effects and any re-assertion the url hook would still make.
  const settle = async () => {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
  };

  it('cold start on /chat?chatId=<B>: the pushed room C wins and stays', async () => {
    window.history.replaceState({}, '', '/chat?chatId=app_b');
    const storeRef = setup();
    await settle();
    // the url hook parked B and selected it
    expect(storeRef.current.getState().rooms.activeRoomJID).toBe(ROOM_B);

    await tap({ jid: ROOM_C, msgID: 'm-1' });
    await settle();

    expect(storeRef.current.getState().rooms.activeRoomJID).toBe(ROOM_C);
    expect(new URL(window.location.href).searchParams.get('chatId')).toBe('app_c');
    expect(window.location.pathname).toBe('/chat');
    expect(localStorage.getItem(PARKED)).toBeNull();
  });

  it('the push arriving before the url hook parked anything also sticks', async () => {
    window.history.replaceState({}, '', '/chat?chatId=app_b');
    const storeRef = setup();
    // no settle: the tap lands in the same tick the page mounted
    await tap({ jid: ROOM_C, msgID: 'm-1' });
    await settle();
    expect(storeRef.current.getState().rooms.activeRoomJID).toBe(ROOM_C);
  });

  it('leaves a url without a chat id alone', async () => {
    window.history.replaceState({}, '', '/chat?tab=2');
    const storeRef = setup();
    await tap({ jid: ROOM_C, msgID: 'm-1' });
    await settle();
    expect(storeRef.current.getState().rooms.activeRoomJID).toBe(ROOM_C);
    expect(window.location.search).toBe('?tab=2');
  });

  it('a page opened with fromPush=1 applies the click from the url once and has the pending copy dropped', async () => {
    window.history.replaceState({}, '', '/app/chat?fromPush=1&chatId=app_c&messageId=m-1');
    const storeRef = setup();
    await settle();

    expect(storeRef.current.getState().rooms.activeRoomJID).toBe(ROOM_C);
    expect(requestPendingPushClick).toHaveBeenCalledTimes(1);
    expect(requestPendingPushClick.mock.calls[0][1]).toEqual({ discard: true });
    expect(new URL(window.location.href).searchParams.has('fromPush')).toBe(false);

    // The worker's own reply for the same tap (it carries another url) is the
    // same click: it must not be applied a second time.
    const jumps: unknown[] = [];
    const unsubscribe = storeRef.current.subscribe(() => {
      jumps.push(storeRef.current.getState().rooms.pendingJump);
    });
    await tap({ jid: ROOM_C, msgID: 'm-1', url: 'https://app.test/app/chat' });
    unsubscribe();
    expect(jumps).toHaveLength(0);
  });

  it('a plain cold start (no fromPush) asks for the pending click, not to drop it', async () => {
    setup();
    await settle();
    expect(requestPendingPushClick).toHaveBeenCalledTimes(1);
    expect(requestPendingPushClick.mock.calls[0][1]).toEqual({ discard: false });
  });
});

describe('usePushNotifications - a pending click made for another user', () => {
  let swHandler: ((event: any) => void) | null = null;

  beforeEach(() => {
    swHandler = null;
    localStorage.clear();
    window.history.replaceState({}, '', '/');
    (navigator as any).serviceWorker = {
      addEventListener: (_: string, cb: any) => {
        swHandler = cb;
      },
      removeEventListener: () => {},
    };
  });

  const run = async (username: string, data: Record<string, unknown>) => {
    const storeRef: { current: any } = { current: null };
    renderWithProviders(<Harness />, {
      storeRef,
      preloadedState: {
        chatSettingStore: {
          config: { xmppSettings: { conference: CONF } },
          user: { xmppUsername: username, token: 'tok' },
        } as any,
        rooms: { rooms: { [ROOM_C]: { jid: ROOM_C, messages: [] } }, activeRoomJID: null } as any,
      },
    });
    await act(async () => {
      swHandler?.({ data: { type: 'PUSH_NOTIFICATION_CLICK', data, notification: {} } });
    });
    return storeRef.current.getState().rooms.activeRoomJID;
  };

  it('ignores a click addressed to someone else', async () => {
    expect(await run('app_bob@xmpp.test', { jid: ROOM_C, msgID: 'm-1', userJid: 'app_alice@xmpp.test' })).toBeNull();
  });

  it('applies it for the addressed user, comparing local parts only', async () => {
    expect(await run('app_alice', { jid: ROOM_C, msgID: 'm-2', userJid: 'app_alice@xmpp.test' })).toBe(ROOM_C);
  });

  it('applies a click that names no recipient', async () => {
    expect(await run('app_bob@xmpp.test', { jid: ROOM_C, msgID: 'm-3' })).toBe(ROOM_C);
  });
});
