import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from '@testing-library/react';
import { renderWithProviders } from '../test/renderWithProviders';

vi.mock('../utils/firebasePushNotifications', () => ({
  initPushNotifications: vi.fn(async () => null),
  listenForForegroundMessages: vi.fn(() => () => {}),
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

// A tap on a push used to open the room and scroll once, 200ms after a history
// fetch, to whatever [data-message-id] happened to be mounted. It now raises a
// jump request for the room, with every id the payload carries.
describe('usePushNotifications - push tap jumps to the message', () => {
  let swHandler: ((event: any) => void) | null = null;

  beforeEach(() => {
    swHandler = null;
    localStorage.clear();
    (navigator as any).serviceWorker = {
      addEventListener: (_: string, cb: any) => {
        swHandler = cb;
      },
      removeEventListener: () => {},
    };
  });

  const setup = () => {
    const storeRef: { current: any } = { current: null };
    const config = { xmppSettings: { conference: 'conference.test' } };
    renderWithProviders(<Harness />, {
      storeRef,
      preloadedState: {
        chatSettingStore: { config, user: { xmppUsername: 'me', token: '' } } as any,
        rooms: { rooms: {}, activeRoomJID: null } as any,
      },
    });
    return storeRef;
  };

  it('requests a jump with the msg, message and stanza ids', async () => {
    const storeRef = setup();
    await act(async () => {
      swHandler?.({
        data: {
          type: 'PUSH_NOTIFICATION_CLICK',
          data: { jid: 'room1', msgID: 'client-1', messageId: 'client-1', stanzaId: '1729' },
        },
      });
    });
    const rooms = storeRef.current.getState().rooms;
    expect(rooms.activeRoomJID).toBe('room1@conference.test');
    expect(rooms.pendingJump).toMatchObject({
      roomJID: 'room1@conference.test',
      ids: ['client-1', '1729'],
    });
  });

  it('just opens the room when the push names no message', async () => {
    const storeRef = setup();
    await act(async () => {
      swHandler?.({
        data: { type: 'PUSH_NOTIFICATION_CLICK', data: { jid: 'room2' } },
      });
    });
    const rooms = storeRef.current.getState().rooms;
    expect(rooms.activeRoomJID).toBe('room2@conference.test');
    expect(rooms.pendingJump ?? null).toBeNull();
  });
});
