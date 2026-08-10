import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../test/renderWithProviders';
import { MessageNotificationProvider } from './MessageNotificationContext';
import { messageNotificationManager } from '../utils/messageNotificationManager';
import { logout } from '../roomStore/chatSettingsSlice';

// Regression coverage for: user gets logged out (either the explicit
// Logout button, or an automatic logout from a failed token refresh) but
// keeps receiving browser/toast notifications, because this provider
// lives in <XmppProvider> above the login gate and never unmounts, and a
// still-live XMPP socket can keep delivering stanzas for a beat after
// Redux already shows the user as logged out. The callback registration
// must be gated on the current user, not just config.enabled.
describe('MessageNotificationProvider - stops notifying once logged out', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const config = { inAppNotifications: { enabled: true } };

  it('does not show a toast when there is no logged-in user', () => {
    renderWithProviders(
      <MessageNotificationProvider config={config}>
        <div>some page</div>
      </MessageNotificationProvider>,
      {
        preloadedState: {
          chatSettingStore: { config, user: undefined } as any,
          rooms: { rooms: {}, activeRoomJID: null, isChatUiVisible: false } as any,
        },
      }
    );

    act(() => {
      messageNotificationManager.showNotification(
        { id: 'logout-test-1', body: 'should not appear', roomJid: 'r1@conf' } as any,
        'Room One',
        'Alice',
        'r1@conf'
      );
    });

    expect(screen.queryByText('should not appear')).toBeNull();
  });

  it('stops showing toasts on the very next render after logout(), on a still-mounted provider', async () => {
    const { store } = renderWithProviders(
      <MessageNotificationProvider config={config}>
        <div>some page</div>
      </MessageNotificationProvider>,
      {
        preloadedState: {
          chatSettingStore: { config, user: { xmppUsername: 'me' } } as any,
          rooms: { rooms: {}, activeRoomJID: null, isChatUiVisible: false } as any,
        },
      }
    );

    act(() => {
      messageNotificationManager.showNotification(
        { id: 'logout-test-2a', body: 'while logged in', roomJid: 'r2@conf' } as any,
        'Room One',
        'Alice',
        'r2@conf'
      );
    });
    await waitFor(() => {
      expect(screen.getByText('while logged in')).toBeTruthy();
    });

    act(() => {
      store.dispatch(logout());
    });

    act(() => {
      messageNotificationManager.showNotification(
        { id: 'logout-test-2b', body: 'after logout', roomJid: 'r2@conf' } as any,
        'Room One',
        'Alice',
        'r2@conf'
      );
    });

    expect(screen.queryByText('after logout')).toBeNull();
  });
});
