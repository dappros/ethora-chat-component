import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../test/renderWithProviders';
import { MessageNotificationProvider } from './MessageNotificationContext';
import { messageNotificationManager } from '../utils/messageNotificationManager';

// Regression coverage for moving the notification system out of <Chat> (see
// ReduxWrapper.tsx) and into the persistent <XmppProvider>: toasts must now
// gate on isChatUiVisible (is the chat PAGE mounted at all), not on whether
// a specific room happens to be "active". Previously this provider only
// existed while <Chat> itself was mounted, so toasts never showed on other
// app pages at all - the config here is irrelevant to that bug, only the
// isChatUiVisible-driven show/hide decision is under test.
describe('MessageNotificationProvider - chat UI visibility gating', () => {
  beforeEach(() => {
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      value: false,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const config = { inAppNotifications: { enabled: true } };

  it('shows a toast when the chat UI is not mounted (e.g. on another app page)', async () => {
    renderWithProviders(
      <MessageNotificationProvider config={config}>
        <div>some other page</div>
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
        { id: 'm1', body: 'hello from elsewhere', roomJid: 'r1@conf' } as any,
        'Room One',
        'Alice',
        'r1@conf'
      );
    });

    await waitFor(() => {
      expect(screen.getByText('hello from elsewhere')).toBeTruthy();
    });
  });

  it('does not show a toast while the chat UI is mounted, even for a different room', async () => {
    renderWithProviders(
      <MessageNotificationProvider config={config}>
        <div>chat page</div>
      </MessageNotificationProvider>,
      {
        preloadedState: {
          chatSettingStore: { config, user: { xmppUsername: 'me' } } as any,
          rooms: {
            rooms: {},
            activeRoomJID: 'active-room@conf',
            isChatUiVisible: true,
          } as any,
        },
      }
    );

    act(() => {
      messageNotificationManager.showNotification(
        { id: 'm2', body: 'hello while on chat page', roomJid: 'other-room@conf' } as any,
        'Other Room',
        'Bob',
        'other-room@conf'
      );
    });

    // Give any (incorrect) async render path a chance, then assert absence.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByText('hello while on chat page')).toBeNull();
  });
});
