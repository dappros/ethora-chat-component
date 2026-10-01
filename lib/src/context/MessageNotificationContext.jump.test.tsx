import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../test/renderWithProviders';
import { MessageNotificationProvider } from './MessageNotificationContext';
import { messageNotificationManager } from '../utils/messageNotificationManager';

// Tapping a toast used to setCurrentRoom, wait 100ms and querySelector the
// message once: a message that was not mounted (older than the render window,
// or not loaded at all) was silently not found and the tap looked dead. It now
// raises a jump request that the mounted room fulfils.
describe('MessageNotificationProvider - toast tap jumps to the message', () => {
  beforeEach(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  });

  const setup = (config: any) => {
    const storeRef: { current: any } = { current: null };
    renderWithProviders(
      <MessageNotificationProvider config={config}>
        <div>other page</div>
      </MessageNotificationProvider>,
      {
        storeRef,
        preloadedState: {
          chatSettingStore: { config, user: { xmppUsername: 'me' } } as any,
          rooms: { rooms: {}, activeRoomJID: null, isChatUiVisible: false } as any,
        },
      }
    );
    return storeRef;
  };

  it('requests a jump carrying the message id and the xmpp id', async () => {
    const storeRef = setup({ inAppNotifications: { enabled: true } });
    act(() => {
      messageNotificationManager.showNotification(
        { id: '1729', xmppId: 'client-uuid', body: 'tap me please', roomJid: 'r1@conf' } as any,
        'Room One',
        'Alice',
        'r1@conf'
      );
    });
    fireEvent.click(await screen.findByText('tap me please'));

    await waitFor(() =>
      expect(storeRef.current.getState().rooms.activeRoomJID).toBe('r1@conf')
    );
    const rooms = storeRef.current.getState().rooms;
    expect(rooms.pendingJump).toMatchObject({
      roomJID: 'r1@conf',
      ids: ['1729', 'client-uuid'],
    });
  });

  it('keeps config.customNotification style onClick handlers in charge', async () => {
    const onClick = vi.fn();
    const storeRef = setup({ inAppNotifications: { enabled: true, onClick } });
    act(() => {
      messageNotificationManager.showNotification(
        { id: '5', body: 'custom handler', roomJid: 'r2@conf' } as any,
        'Room Two',
        'Bob',
        'r2@conf'
      );
    });
    fireEvent.click(await screen.findByText('custom handler'));
    await waitFor(() => expect(onClick).toHaveBeenCalled());
    expect(storeRef.current.getState().rooms.pendingJump ?? null).toBeNull();
    expect(storeRef.current.getState().rooms.activeRoomJID).toBeNull();
  });
});
