import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import callSlice, {
  CallState,
  declineIncomingCall,
} from '../../roomStore/callSlice';
import {
  markCallRaisedFromPush,
  resetCallPushState,
} from '../../helpers/incomingCallPush';
import chatSettingsSlice from '../../roomStore/chatSettingsSlice';
import roomsSlice from '../../roomStore/roomsSlice';
import { ToastProvider } from '../../context/ToastContext';
import { resetCallBroadcastForTests } from '../../utils/callBroadcast';
import { VideoCallOverlay } from './VideoCallOverlay';

const sendCallStateSignal = vi.fn();
const declineChatCall = vi.fn(async (_callId: string) => true);
vi.mock('../../networking/callTokenStanza', () => ({
  sendCallStateSignal: (...args: unknown[]) => sendCallStateSignal(...args),
}));
vi.mock('../../networking/api-requests/rooms.api', () => ({
  declineChatCall: (...args: unknown[]) => declineChatCall(args[0] as string),
}));

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
  e2eeKey: null,
  e2eeKeyCallId: null,
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

  const utils = render(
    <Provider store={store}>
      <ToastProvider>
        <VideoCallOverlay />
      </ToastProvider>
    </Provider>
  );
  return { ...utils, store };
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

const setHidden = (hidden: boolean) => {
  Object.defineProperty(document, 'visibilityState', {
    value: hidden ? 'hidden' : 'visible',
    configurable: true,
  });
  Object.defineProperty(document, 'hidden', { value: hidden, configurable: true });
};

const jwtExpiringIn = (ms: number) =>
  `h.${btoa(JSON.stringify({ exp: (Date.now() + ms) / 1000 }))}.s`;

describe('VideoCallOverlay - call push lifecycle', () => {
  let notificationSpy: ReturnType<typeof vi.fn>;
  let registration: any;
  let open: { tag: string; close: ReturnType<typeof vi.fn> }[];

  beforeEach(() => {
    resetCallPushState();
    sendCallStateSignal.mockClear();
    declineChatCall.mockClear();
    notificationSpy = vi.fn();
    (window as any).Notification = function (title: string, options: any) {
      notificationSpy(title, options);
      return { onclick: null, close() {} };
    };
    (window as any).Notification.permission = 'granted';
    open = [];
    registration = {
      active: {},
      showNotification: vi.fn(async () => undefined),
      getNotifications: vi.fn(async ({ tag }: { tag: string }) => open.filter((n) => n.tag === tag)),
    };
    (navigator as any).serviceWorker = { getRegistration: vi.fn(async () => registration) };
    setHidden(true);
  });

  afterEach(() => {
    delete (window as any).Notification;
    delete (navigator as any).serviceWorker;
    setHidden(false);
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const pushEnabled = {
    config: {
      videoCalls: { enabled: true },
      pushNotifications: { enabled: true },
    },
    user: { xmppUsername: 'me' },
  };

  it('a hidden tab shows its ring through the service worker registration, with actions and the call data', async () => {
    await act(async () => {
      renderOverlay({ ...baseCallState, token: 'jwt-token' }, pushEnabled);
      await Promise.resolve();
    });
    expect(notificationSpy).not.toHaveBeenCalled();
    expect(registration.showNotification).toHaveBeenCalledTimes(1);
    const [title, options] = registration.showNotification.mock.calls[0];
    expect(title).toContain('Incoming audio call');
    expect(options.tag).toBe('call:call-123');
    expect(options.requireInteraction).toBe(true);
    expect(options.actions).toEqual([
      { action: 'answer', title: 'Answer' },
      { action: 'decline', title: 'Decline' },
    ]);
    expect(options.data).toMatchObject({
      type: 'call',
      callId: 'call-123',
      callToken: 'jwt-token',
      room: 'peer',
      kind: 'audio',
      callerName: 'Ada Lovelace',
      callerXmppUsername: 'peer',
    });
  });

  it('shows no page notification for a ring raised from a push (the worker owns it)', async () => {
    markCallRaisedFromPush('call-123');
    await act(async () => {
      renderOverlay(baseCallState, pushEnabled);
      await Promise.resolve();
    });
    expect(registration.showNotification).not.toHaveBeenCalled();
    expect(notificationSpy).not.toHaveBeenCalled();
  });

  it.each([
    ['declined', (store: any) => store.dispatch(declineIncomingCall())],
    [
      'cancelled by the caller',
      (store: any) => store.dispatch({ type: 'call/endCall' }),
    ],
    [
      'answered',
      (store: any) => store.dispatch({ type: 'call/acceptIncomingCall' }),
    ],
  ])('closes the OS notification when the ring ends (%s)', async (_name, end) => {
    const fromWorker = { tag: 'call:call-123', close: vi.fn() };
    open.push(fromWorker);
    let store: any;
    await act(async () => {
      store = renderOverlay(baseCallState, pushEnabled).store;
      await Promise.resolve();
    });
    expect(fromWorker.close).not.toHaveBeenCalled();

    await act(async () => {
      end(store);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(registration.getNotifications).toHaveBeenCalledWith({ tag: 'call:call-123' });
    expect(fromWorker.close).toHaveBeenCalledTimes(1);
  });

  it('closes the page-made notification too when the ring times out', async () => {
    (navigator as any).serviceWorker = undefined;
    const closed = vi.fn();
    (window as any).Notification = function () {
      return { onclick: null, close: closed };
    };
    (window as any).Notification.permission = 'granted';
    let store: any;
    await act(async () => {
      store = renderOverlay(baseCallState, { ...pushEnabled, config: { videoCalls: { enabled: true } } }).store;
      await Promise.resolve();
    });
    await act(async () => {
      store.dispatch(declineIncomingCall());
      await Promise.resolve();
    });
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it('a ring raised late stops when its token expires, not after the full 45 s', async () => {
    setHidden(false);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    let store: any;
    await act(async () => {
      store = renderOverlay(
        { ...baseCallState, startedAt: Date.now(), token: jwtExpiringIn(8_000) },
        pushEnabled
      ).store;
    });
    await act(async () => {
      vi.advanceTimersByTime(7_000);
    });
    expect(store.getState().call.phase).toBe('ringing-incoming');
    await act(async () => {
      vi.advanceTimersByTime(1_500);
    });
    expect(store.getState().call.phase).toBe('idle');
  });

  it('keeps the 45 s ring for a token whose exp cannot be read', async () => {
    setHidden(false);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    let store: any;
    await act(async () => {
      store = renderOverlay({ ...baseCallState, startedAt: Date.now(), token: 'jwt' }, pushEnabled).store;
    });
    await act(async () => {
      vi.advanceTimersByTime(44_000);
    });
    expect(store.getState().call.phase).toBe('ringing-incoming');
    await act(async () => {
      vi.advanceTimersByTime(1_500);
    });
    expect(store.getState().call.phase).toBe('idle');
  });

  describe('a push the page acked, and a tab switch mid-ring', () => {
    it('the page notifies when the tab goes hidden mid-ring (the worker showed nothing)', async () => {
      setHidden(false);
      await act(async () => {
        renderOverlay({ ...baseCallState, token: 'jwt-token' }, pushEnabled);
        await Promise.resolve();
      });
      expect(registration.showNotification).not.toHaveBeenCalled();

      await act(async () => {
        setHidden(true);
        document.dispatchEvent(new Event('visibilitychange'));
        await Promise.resolve();
      });
      expect(registration.showNotification).toHaveBeenCalledTimes(1);
      expect(registration.showNotification.mock.calls[0][1].tag).toBe('call:call-123');
    });

    it('stays silent when the worker marked the ring as its own (it showed the notification)', async () => {
      setHidden(false);
      markCallRaisedFromPush('call-123');
      await act(async () => {
        renderOverlay(baseCallState, pushEnabled);
        await Promise.resolve();
      });
      await act(async () => {
        setHidden(true);
        document.dispatchEvent(new Event('visibilitychange'));
        await Promise.resolve();
      });
      expect(registration.showNotification).not.toHaveBeenCalled();
    });
  });

  describe('a ring without a callId', () => {
    const noId = { ...baseCallState, callId: null };

    it('is keyed by its room, the key the worker uses', async () => {
      await act(async () => {
        renderOverlay(noId, pushEnabled);
        await Promise.resolve();
      });
      expect(registration.showNotification.mock.calls[0][1].tag).toBe('call:room:peer');
    });

    it('is marked and closed under that key too', async () => {
      markCallRaisedFromPush('room:peer');
      let store: any;
      await act(async () => {
        store = renderOverlay(noId, pushEnabled).store;
        await Promise.resolve();
      });
      expect(registration.showNotification).not.toHaveBeenCalled();

      const fromWorker = { tag: 'call:room:peer', close: vi.fn() };
      open.push(fromWorker);
      await act(async () => {
        store.dispatch(declineIncomingCall());
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(fromWorker.close).toHaveBeenCalled();
    });
  });

  describe('a ring that times out', () => {
    const timedOut = async (hidden: boolean) => {
      setHidden(hidden);
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
      let store: any;
      await act(async () => {
        store = renderOverlay(
          { ...baseCallState, startedAt: Date.now(), token: jwtExpiringIn(8_000) },
          pushEnabled
        ).store;
        await Promise.resolve();
      });
      registration.showNotification.mockClear();
      await act(async () => {
        vi.advanceTimersByTime(8_500);
        await Promise.resolve();
        await Promise.resolve();
      });
      return store;
    };

    it('shows "Missed call" itself in a hidden tab, with the worker\'s tag and data', async () => {
      const store = await timedOut(true);
      expect(store.getState().call.phase).toBe('idle');
      expect(registration.showNotification).toHaveBeenCalledTimes(1);
      const [title, options] = registration.showNotification.mock.calls[0];
      expect(title).toBe('Missed audio call · Ada Lovelace');
      expect(options.tag).toBe('missed-call:peer');
      expect(options.requireInteraction).toBe(false);
      expect(options.actions).toBeUndefined();
      expect(options.data).toMatchObject({
        type: 'missed-call',
        jid: 'peer',
        callerName: 'Ada Lovelace',
        missedCallId: 'call-123',
      });
      expect(options.data.callId).toBeUndefined();
    });

    it('does not show it twice when the worker already showed the same missed call', async () => {
      open.push({ tag: 'missed-call:peer', close: vi.fn(), data: { missedCallId: 'call-123' } } as any);
      await timedOut(true);
      expect(registration.showNotification).not.toHaveBeenCalled();
    });

    it('shows nothing in a visible tab (the ring was on screen, the call log lands in the chat)', async () => {
      const store = await timedOut(false);
      expect(store.getState().call.phase).toBe('idle');
      expect(registration.showNotification).not.toHaveBeenCalled();
      expect(notificationSpy).not.toHaveBeenCalled();
    });

    it('shows nothing once the user is gone', async () => {
      setHidden(true);
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
      await act(async () => {
        renderOverlay(
          { ...baseCallState, startedAt: Date.now(), token: jwtExpiringIn(8_000) },
          { ...pushEnabled, user: { xmppUsername: undefined } }
        );
        await Promise.resolve();
      });
      await act(async () => {
        vi.advanceTimersByTime(8_500);
        await Promise.resolve();
      });
      expect(registration.showNotification).not.toHaveBeenCalled();
    });

    it.each([
      ['declined', (store: any) => store.dispatch(declineIncomingCall())],
      ['cancelled by the caller', (store: any) => store.dispatch({ type: 'call/endCall' })],
      ['answered', (store: any) => store.dispatch({ type: 'call/acceptIncomingCall' })],
    ])('is not a missed call when the ring ended %s', async (_name, end) => {
      setHidden(true);
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
      let store: any;
      await act(async () => {
        store = renderOverlay(
          { ...baseCallState, startedAt: Date.now(), token: jwtExpiringIn(8_000) },
          pushEnabled
        ).store;
        await Promise.resolve();
      });
      registration.showNotification.mockClear();
      await act(async () => {
        end(store);
        await Promise.resolve();
      });
      await act(async () => {
        vi.advanceTimersByTime(9_000);
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(registration.showNotification).not.toHaveBeenCalled();
    });

    it('falls back to a page Notification (same tag) when there is no service worker', async () => {
      (navigator as any).serviceWorker = undefined;
      setHidden(true);
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
      await act(async () => {
        renderOverlay(
          { ...baseCallState, startedAt: Date.now(), token: jwtExpiringIn(8_000) },
          { ...pushEnabled, config: { videoCalls: { enabled: true } } }
        );
        await Promise.resolve();
      });
      notificationSpy.mockClear();
      await act(async () => {
        vi.advanceTimersByTime(8_500);
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(notificationSpy).toHaveBeenCalledTimes(1);
      expect(notificationSpy.mock.calls[0][0]).toBe('Missed audio call · Ada Lovelace');
      expect(notificationSpy.mock.calls[0][1].tag).toBe('missed-call:peer');
    });
  });

  describe('two tabs ringing for one call', () => {
    // One bus: this page's channel plus a second channel standing for the
    // other tab. Neither hears itself, like the real BroadcastChannel.
    class FakeChannel {
      static all: FakeChannel[] = [];
      listeners = new Set<(e: { data: unknown }) => void>();
      constructor(public name: string) {
        FakeChannel.all.push(this);
      }
      postMessage(data: unknown) {
        FakeChannel.all
          .filter((c) => c !== this && c.name === this.name)
          .forEach((c) => c.listeners.forEach((l) => l({ data })));
      }
      addEventListener(_t: string, l: (e: { data: unknown }) => void) {
        this.listeners.add(l);
      }
      removeEventListener(_t: string, l: (e: { data: unknown }) => void) {
        this.listeners.delete(l);
      }
      close() {}
    }
    let otherTab: FakeChannel;
    let heardByOtherTab: any[];

    beforeEach(() => {
      FakeChannel.all = [];
      vi.stubGlobal('BroadcastChannel', FakeChannel);
      resetCallBroadcastForTests();
      heardByOtherTab = [];
      // opened first, so it exists before this page's own channel does
      otherTab = new FakeChannel('ethora-call');
      otherTab.addEventListener('message', (e) => heardByOtherTab.push(e.data));
    });
    afterEach(() => {
      resetCallBroadcastForTests();
      vi.unstubAllGlobals();
    });

    const ringHidden = async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
      let store: any;
      await act(async () => {
        store = renderOverlay(
          { ...baseCallState, startedAt: Date.now(), token: jwtExpiringIn(20_000) },
          pushEnabled
        ).store;
        await Promise.resolve();
        await Promise.resolve();
      });
      return store;
    };

    it.each(['accepted', 'declined', 'ended'])(
      'a hidden tab ends its ring quietly when the other tab says the call was %s: no Missed call, nothing sent, its notification closed',
      async (outcome) => {
        const store = await ringHidden();
        expect(store.getState().call.phase).toBe('ringing-incoming');
        expect(registration.showNotification).toHaveBeenCalledTimes(1); // its own ring
        const ringNotification = { tag: 'call:call-123', close: vi.fn() };
        open.push(ringNotification);
        registration.showNotification.mockClear();

        await act(async () => {
          otherTab.postMessage({ key: 'call-123', outcome, from: 'other-tab' });
          await Promise.resolve();
          await Promise.resolve();
        });
        expect(store.getState().call.phase).toBe('idle');
        expect(ringNotification.close).toHaveBeenCalled();

        // and the time the ring would have run out passes without a Missed call
        await act(async () => {
          vi.advanceTimersByTime(30_000);
          await Promise.resolve();
          await Promise.resolve();
        });
        expect(registration.showNotification).not.toHaveBeenCalled();
        expect(sendCallStateSignal).not.toHaveBeenCalled();
        expect(declineChatCall).not.toHaveBeenCalled();
        // no echo: the other tab is not told about an end it announced itself
        expect(heardByOtherTab).toEqual([]);
      }
    );

    it('ignores another call\'s outcome', async () => {
      const store = await ringHidden();
      await act(async () => {
        otherTab.postMessage({ key: 'some-other-call', outcome: 'accepted', from: 'other-tab' });
        await Promise.resolve();
      });
      expect(store.getState().call.phase).toBe('ringing-incoming');
    });

    it('tells the other tab when this one answers or declines', async () => {
      setHidden(false);
      const first = renderOverlay(baseCallState, pushEnabled);
      await act(async () => {
        fireEvent.click(first.getByLabelText('Accept call'));
      });
      expect(heardByOtherTab).toEqual([expect.objectContaining({ key: 'call-123', outcome: 'accepted' })]);
      first.unmount();

      heardByOtherTab.length = 0;
      const second = renderOverlay(baseCallState, pushEnabled);
      await act(async () => {
        fireEvent.click(second.getByLabelText('Decline call'));
      });
      expect(heardByOtherTab).toEqual([expect.objectContaining({ key: 'call-123', outcome: 'ended' })]);
    });

    it('tells the other tab when the caller cancels', async () => {
      const store = await ringHidden();
      await act(async () => {
        store.dispatch({ type: 'call/endCall' });
        await Promise.resolve();
      });
      expect(heardByOtherTab).toEqual([expect.objectContaining({ key: 'call-123', outcome: 'ended' })]);
    });

    it('a ring that merely runs out is not announced: each tab ends and reports its own', async () => {
      const store = await ringHidden();
      registration.showNotification.mockClear();
      await act(async () => {
        vi.advanceTimersByTime(21_000);
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(store.getState().call.phase).toBe('idle');
      expect(registration.showNotification).toHaveBeenCalledTimes(1);
      expect(registration.showNotification.mock.calls[0][0]).toContain('Missed');
      expect(heardByOtherTab).toEqual([]);
    });
  });

  describe('a ring shown through the registration', () => {
    it('tells the service worker when it ends, so it is ended even if this tab is closed', async () => {
      const controller = { postMessage: vi.fn() };
      (navigator as any).serviceWorker = { getRegistration: vi.fn(async () => registration), controller };
      const token = jwtExpiringIn(30_000);
      const exp = JSON.parse(atob(token.split('.')[1])).exp * 1000;
      await act(async () => {
        renderOverlay({ ...baseCallState, token }, pushEnabled);
        await Promise.resolve();
        await Promise.resolve();
      });
      await vi.waitFor(() => expect(controller.postMessage).toHaveBeenCalled());
      const sent = controller.postMessage.mock.calls[0][0];
      expect(sent).toMatchObject({
        type: 'CALL_RING_SHOWN',
        key: 'call-123',
        exp,
        data: { callId: 'call-123', room: 'peer', kind: 'audio', callerName: 'Ada Lovelace' },
      });
      expect(JSON.stringify(sent)).not.toContain(token);
    });
  });

  it('Decline tells the caller over XMPP and over REST (the path that works without a socket)', async () => {
    setHidden(false);
    const { getByLabelText, store } = renderOverlay(baseCallState, pushEnabled);
    await act(async () => {
      fireEvent.click(getByLabelText('Decline call'));
    });
    expect(sendCallStateSignal).toHaveBeenCalledWith('declined');
    expect(declineChatCall).toHaveBeenCalledWith('call-123');
    expect(store.getState().call.phase).toBe('idle');
  });

  // The ring screen's buttons take the same per-call claim as the notification's
  // Answer and Decline (a Web Lock), so a click here and an Answer in another
  // tab at the same moment cannot both go through.
  describe('the per-call claim shared with the notification actions', () => {
    const installLocks = (alreadyHeld: string[] = []) => {
      const held = new Set<string>(alreadyHeld);
      (navigator as any).locks = {
        request: (name: string, _o: unknown, cb: (lock: unknown) => Promise<void> | undefined) => {
          if (held.has(name)) return Promise.resolve(cb(null));
          held.add(name);
          return Promise.resolve(cb({ name }));
        },
      };
      return held;
    };
    beforeEach(async () => {
      const { resetCallClaims } = await import('../../helpers/callClaim');
      resetCallClaims();
      setHidden(false);
    });
    afterEach(() => {
      delete (navigator as any).locks;
    });

    it('Accept takes the claim and connects', async () => {
      const held = installLocks();
      const { getByLabelText, store } = renderOverlay(baseCallState, pushEnabled);
      await act(async () => {
        fireEvent.click(getByLabelText('Accept call'));
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(store.getState().call.phase).toBe('connecting');
      expect(held.has('ethora-call-decision:call-123')).toBe(true);
    });

    it('Accept does nothing when another tab (the notification Answer) holds the claim', async () => {
      installLocks(['ethora-call-decision:call-123']);
      const { getByLabelText, store } = renderOverlay(baseCallState, pushEnabled);
      await act(async () => {
        fireEvent.click(getByLabelText('Accept call'));
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(store.getState().call.phase).toBe('ringing-incoming');
    });

    it('Decline does nothing when another tab holds the claim: no signal, no REST call', async () => {
      installLocks(['ethora-call-decision:call-123']);
      const { getByLabelText, store } = renderOverlay(baseCallState, pushEnabled);
      await act(async () => {
        fireEvent.click(getByLabelText('Decline call'));
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(store.getState().call.phase).toBe('ringing-incoming');
      expect(sendCallStateSignal).not.toHaveBeenCalled();
      expect(declineChatCall).not.toHaveBeenCalled();
    });

    it('Accept in this tab and Answer in another: exactly one of them gets the call', async () => {
      installLocks();
      const { claimCallDecision, resetCallClaims } = await import('../../helpers/callClaim');
      const { getByLabelText, store } = renderOverlay(baseCallState, pushEnabled);
      let otherTabClaim: boolean | Promise<boolean> = true;
      await act(async () => {
        fireEvent.click(getByLabelText('Accept call'));
        // the other tab (its own memory) tries for the same call right after
        resetCallClaims();
        otherTabClaim = claimCallDecision('call-123');
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(await otherTabClaim).toBe(false);
      expect(store.getState().call.phase).toBe('connecting');
    });
  });
});
