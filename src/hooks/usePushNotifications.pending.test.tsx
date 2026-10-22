import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from '@testing-library/react';
import { renderWithProviders } from '../test/renderWithProviders';

const order: string[] = [];
const requestPendingPushClick = vi.fn(async () => {
  order.push('request');
  return true;
});

vi.mock('../utils/firebasePushNotifications', () => ({
  initPushNotifications: vi.fn(async () => null),
  listenForForegroundMessages: vi.fn(() => () => {}),
  requestPendingPushClick: () => requestPendingPushClick(),
}));
vi.mock('../networking/api-requests/push.api', () => ({
  registerPushToken: vi.fn(),
}));
vi.mock('../utils/clientRegistry', () => ({
  getGlobalXmppClient: () => null,
}));

import usePushNotifications from './usePushNotifications';

const Harness = () => {
  usePushNotifications({ enabled: true });
  return null;
};

// A tap on a push with the app closed is kept by the service worker; the page
// asks for it once its message listener is attached and the user is logged in,
// and the answer takes the same path as a warm tap.
describe('usePushNotifications - cold-start pending click', () => {
  let swHandler: ((event: any) => void) | null = null;

  beforeEach(() => {
    swHandler = null;
    order.length = 0;
    requestPendingPushClick.mockClear();
    localStorage.clear();
    (navigator as any).serviceWorker = {
      addEventListener: (_: string, cb: any) => {
        order.push('listen');
        swHandler = cb;
      },
      removeEventListener: () => {},
    };
  });

  const setup = (token: string) => {
    const storeRef: { current: any } = { current: null };
    renderWithProviders(<Harness />, {
      storeRef,
      preloadedState: {
        chatSettingStore: {
          config: { xmppSettings: { conference: 'conference.test' } },
          user: { xmppUsername: 'me', token },
        } as any,
        rooms: { rooms: {}, activeRoomJID: null } as any,
      },
    });
    return storeRef;
  };

  it('asks the worker for a pending click after attaching the listener', async () => {
    setup('tok');
    expect(requestPendingPushClick).toHaveBeenCalled();
    expect(order.indexOf('listen')).toBeGreaterThanOrEqual(0);
    expect(order.indexOf('listen')).toBeLessThan(order.indexOf('request'));
  });

  it('waits for a logged-in user', () => {
    setup('');
    expect(requestPendingPushClick).not.toHaveBeenCalled();
  });

  it('opens the room at the message from the worker reply', async () => {
    const storeRef = setup('tok');
    await act(async () => {
      swHandler?.({
        data: {
          type: 'PUSH_NOTIFICATION_CLICK',
          data: { jid: 'room1', msgID: 'm-9', type: 'reaction' },
          notification: { title: 'Bob', body: 'reacted' },
        },
      });
    });
    const rooms = storeRef.current.getState().rooms;
    expect(rooms.activeRoomJID).toBe('room1@conference.test');
    expect(rooms.pendingJump).toMatchObject({ roomJID: 'room1@conference.test', ids: ['m-9'] });
  });
});
