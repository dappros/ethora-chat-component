import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import callSlice, { CallState } from '../../roomStore/callSlice';
import chatSettingsSlice from '../../roomStore/chatSettingsSlice';
import roomsSlice from '../../roomStore/roomsSlice';
import { ToastProvider } from '../../context/ToastContext';
import { VideoCallOverlay } from './VideoCallOverlay';

// Regression coverage for two fixes:
// 1. VideoCallOverlay now lives in <XmppProvider> (not <ChatWrapper>), so it
//    must render purely from Redux + config state - no chat-page-specific
//    context required. This test mounts it standalone to prove that.
// 2. An incoming call-token is intercepted before the normal message/push
//    notification pipeline ever sees it (see callTokenStanza.ts), so a call
//    ringing while the tab is genuinely not visible previously had NO
//    notification at all. The new effect must fire a browser Notification
//    in exactly that case, and NOT when the tab is visible (the ring
//    modal itself already covers that case).

const baseCallState: CallState = {
  phase: 'ringing-incoming',
  direction: 'incoming',
  kind: 'audio',
  roomJid: 'peer@conf.example.com',
  roomName: 'Ada Lovelace',
  roomBareName: 'peer',
  callId: 'call-123',
  peerXmppUsername: 'peer',
  token: null,
  error: null,
  startedAt: Date.now(),
  connectedAt: null,
};

function renderOverlay(
  callState: CallState,
  chatSettingOverrides: Record<string, unknown> = {}
) {
  const store = configureStore({
    reducer: {
      call: callSlice,
      chatSettingStore: chatSettingsSlice,
      rooms: roomsSlice,
    },
    preloadedState: {
      call: callState,
      chatSettingStore: {
        config: { videoCalls: { enabled: true } },
        user: { xmppUsername: 'me' },
        ...chatSettingOverrides,
      } as any,
    },
    middleware: (getDefault) =>
      getDefault({ serializableCheck: false, immutableCheck: false }),
  });

  return render(
    <Provider store={store}>
      <ToastProvider>
        <VideoCallOverlay />
      </ToastProvider>
    </Provider>
  );
}

describe('VideoCallOverlay - incoming call browser notification', () => {
  let notificationSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    notificationSpy = vi.fn();
    (window as any).Notification = function (title: string, options: any) {
      notificationSpy(title, options);
      return { onclick: null, close() {} };
    };
    (window as any).Notification.permission = 'granted';
  });

  afterEach(() => {
    delete (window as any).Notification;
    vi.restoreAllMocks();
  });

  it('shows the ring modal regardless of surrounding page (no chat context needed)', () => {
    const { getAllByText, getByRole } = renderOverlay(baseCallState);
    expect(getAllByText(/Incoming audio call/i).length).toBeGreaterThan(0);
    expect(getByRole('dialog', { name: /Incoming audio call/i })).toBeTruthy();
  });

  it('fires a call-styled browser Notification when the tab is hidden', async () => {
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    });
    Object.defineProperty(document, 'hidden', {
      value: true,
      configurable: true,
    });

    await act(async () => {
      renderOverlay(baseCallState);
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
    });

    expect(notificationSpy).toHaveBeenCalledTimes(1);
    const [title, options] = notificationSpy.mock.calls[0];
    expect(title).toMatch(/Incoming audio call/i);
    expect(title).toContain('Ada Lovelace');
    expect(options.requireInteraction).toBe(true);
    expect(options.tag).toBe('call:call-123');
  });

  it('does NOT fire a browser Notification when the tab is visible (the modal already covers it)', async () => {
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    });
    Object.defineProperty(document, 'hidden', {
      value: false,
      configurable: true,
    });

    await act(async () => {
      renderOverlay(baseCallState);
      await Promise.resolve();
    });

    expect(notificationSpy).not.toHaveBeenCalled();
  });

  it('does not fire for an outgoing call (only incoming should notify)', async () => {
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    });
    Object.defineProperty(document, 'hidden', {
      value: true,
      configurable: true,
    });

    await act(async () => {
      renderOverlay({
        ...baseCallState,
        direction: 'outgoing',
        phase: 'requesting',
      });
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
    });

    expect(notificationSpy).not.toHaveBeenCalled();
  });

  it('does not fire when there is no logged-in user (e.g. after logout, while the socket is still live)', async () => {
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    });
    Object.defineProperty(document, 'hidden', {
      value: true,
      configurable: true,
    });

    await act(async () => {
      renderOverlay(baseCallState, { user: undefined });
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
    });

    expect(notificationSpy).not.toHaveBeenCalled();
  });
});
