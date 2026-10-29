import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

const sendCallStateSignal = vi.fn();
const declineChatCall = vi.fn(async (_callId: string) => true);
const postToPushServiceWorker = vi.fn(async (_message: Record<string, unknown>) => true);
const mirrorCallAuthToWorker = vi.fn(async (_token: string | null) => undefined);
const announceCallClient = vi.fn((_ready: boolean) => undefined);
const deletePendingPushClick = vi.fn(async () => undefined);

vi.mock('../utils/firebasePushNotifications', () => ({
  initPushNotifications: vi.fn(async () => null),
  listenForForegroundMessages: vi.fn(() => () => {}),
  requestPendingPushClick: vi.fn(async () => true),
}));
vi.mock('../networking/api-requests/push.api', () => ({
  registerPushToken: vi.fn(),
  resolvePushLanguage: () => '',
}));
vi.mock('../utils/clientRegistry', () => ({ getGlobalXmppClient: () => null }));
vi.mock('../networking/callTokenStanza', () => ({
  sendCallStateSignal: (...args: unknown[]) => sendCallStateSignal(...args),
}));
vi.mock('../networking/api-requests/rooms.api', () => ({
  declineChatCall: (...args: unknown[]) => declineChatCall(args[0] as string),
}));
vi.mock('../utils/pushServiceWorkerBridge', () => ({
  postToPushServiceWorker: (...args: unknown[]) => postToPushServiceWorker(args[0] as Record<string, unknown>),
  announceCallClient: (...args: unknown[]) => announceCallClient(args[0] as boolean),
  deletePendingPushClick: () => deletePendingPushClick(),
}));
vi.mock('../utils/callAuthMirror', () => ({
  mirrorCallAuthToWorker: (...args: unknown[]) => mirrorCallAuthToWorker(args[0] as string | null),
}));

import callSlice from '../roomStore/callSlice';
import chatSettingsSlice, { setConfig, setUser } from '../roomStore/chatSettingsSlice';
import roomsSlice from '../roomStore/roomsSlice';
import roomHeapSlice from '../roomStore/roomHeapSlice';
import usePushNotifications from './usePushNotifications';
import { VideoCallOverlay } from '../components/VideoCalls/VideoCallOverlay';
import { ToastProvider } from '../context/ToastContext';
import { resetCallClaims } from '../helpers/callClaim';
import { setIncomingCallToken } from '../roomStore/callSlice';
import { fireEvent } from '@testing-library/react';

const jwt = (expInMs: number) =>
  `h.${btoa(JSON.stringify({ exp: (Date.now() + expInMs) / 1000 }))}.s`;

const callData = (extra: Record<string, unknown> = {}) => ({
  type: 'call',
  callId: 'c-1',
  callToken: jwt(60_000),
  room: 'app_a-app_b',
  kind: 'video',
  callerName: 'Alice',
  callerXmppUsername: 'app_a',
  ...extra,
});

const Harness = () => {
  usePushNotifications({ enabled: true });
  return null;
};

const makeStore = (config: Record<string, unknown> | null, token = 'user-jwt') =>
  configureStore({
    reducer: {
      call: callSlice,
      chatSettingStore: chatSettingsSlice,
      rooms: roomsSlice,
      roomHeapSlice,
    },
    preloadedState: {
      chatSettingStore: {
        config: { xmppSettings: { conference: 'conference.test' }, ...(config || {}) },
        user: { xmppUsername: 'app_b@xmpp.test', token },
      } as any,
    },
    middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false }),
  });

const VIDEO_ON = { videoCalls: { enabled: true } };

describe('usePushNotifications - incoming call push', () => {
  let handlers: ((event: any) => void)[];

  const emit = async (data: Record<string, unknown>) => {
    await act(async () => {
      handlers.forEach((h) => h({ data }));
    });
  };

  const mount = (store: ReturnType<typeof makeStore>, instances = 1) =>
    render(
      <Provider store={store}>
        {Array.from({ length: instances }, (_, i) => (
          <Harness key={i} />
        ))}
      </Provider>
    );

  beforeEach(() => {
    handlers = [];
    sendCallStateSignal.mockClear();
    declineChatCall.mockClear();
    postToPushServiceWorker.mockClear();
    mirrorCallAuthToWorker.mockClear();
    announceCallClient.mockClear();
    deletePendingPushClick.mockClear();
    localStorage.clear();
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    (navigator as any).serviceWorker = {
      addEventListener: (_: string, cb: any) => handlers.push(cb),
      removeEventListener: (_: string, cb: any) => {
        handlers = handlers.filter((h) => h !== cb);
      },
    };
  });

  afterEach(async () => {
    const { resetCallPushState } = await import('../helpers/incomingCallPush');
    resetCallPushState();
  });

  it('rings on CALL_PUSH and acks the worker while visible', async () => {
    const store = makeStore(VIDEO_ON);
    mount(store);
    await emit({ type: 'CALL_PUSH', data: callData() });
    expect(store.getState().call).toMatchObject({ phase: 'ringing-incoming', callId: 'c-1', roomJid: 'app_a-app_b@conference.test' });
    expect(postToPushServiceWorker).toHaveBeenCalledWith({ type: 'CALL_PUSH_ACK', callId: 'c-1' });
  });

  it('rings but does not ack while hidden', async () => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    const store = makeStore(VIDEO_ON);
    mount(store);
    await emit({ type: 'CALL_PUSH', data: callData() });
    expect(store.getState().call.phase).toBe('ringing-incoming');
    expect(postToPushServiceWorker).not.toHaveBeenCalled();
  });

  it('the Answer action raises the call and accepts it with no second click', async () => {
    const store = makeStore(VIDEO_ON);
    mount(store);
    const data = callData();
    await emit({ type: 'PUSH_NOTIFICATION_CLICK', action: 'answer', data, notification: {} });
    expect(store.getState().call).toMatchObject({ phase: 'connecting', callId: 'c-1', token: data.callToken });
  });

  it('a plain tap raises the ring screen and waits for the user', async () => {
    const store = makeStore(VIDEO_ON);
    mount(store);
    await emit({ type: 'PUSH_NOTIFICATION_CLICK', data: callData(), notification: {} });
    expect(store.getState().call.phase).toBe('ringing-incoming');
  });

  it('a tap on a stale call opens its room and rings nothing', async () => {
    const store = makeStore(VIDEO_ON);
    mount(store);
    await emit({
      type: 'PUSH_NOTIFICATION_CLICK',
      action: 'answer',
      data: callData({ callToken: jwt(-10_000) }),
      notification: {},
    });
    expect(store.getState().call.phase).toBe('idle');
    expect(store.getState().rooms.activeRoomJID).toBe('app_a-app_b@conference.test');
  });

  it('Decline sends the call-state, calls the REST decline and clears the ring', async () => {
    const store = makeStore(VIDEO_ON);
    mount(store);
    await emit({ type: 'CALL_PUSH', data: callData() });
    await emit({ type: 'CALL_PUSH_DECLINE', data: callData() });
    expect(sendCallStateSignal).toHaveBeenCalledWith('declined', {
      peerXmppUsername: 'app_a',
      callId: 'c-1',
      roomBareName: 'app_a-app_b',
    });
    expect(declineChatCall).toHaveBeenCalledWith('c-1');
    expect(store.getState().call.phase).toBe('idle');
  });

  it('Decline acks the worker once, so it does not decline over REST as well', async () => {
    const store = makeStore(VIDEO_ON);
    mount(store, 2);
    await emit({ type: 'CALL_PUSH', data: callData() });
    postToPushServiceWorker.mockClear();
    await emit({ type: 'CALL_PUSH_DECLINE', data: callData() });
    const acks = postToPushServiceWorker.mock.calls.filter((c) => c[0].type === 'CALL_PUSH_DECLINE_ACK');
    expect(acks).toEqual([[{ type: 'CALL_PUSH_DECLINE_ACK', callId: 'c-1' }]]);
  });

  it('Decline on a page with no videoCalls config still declines over REST and acks', async () => {
    const store = makeStore(null);
    mount(store);
    await emit({ type: 'CALL_PUSH_DECLINE', data: callData() });
    expect(sendCallStateSignal).not.toHaveBeenCalled();
    expect(declineChatCall).toHaveBeenCalledWith('c-1');
    expect(postToPushServiceWorker).toHaveBeenCalledWith({ type: 'CALL_PUSH_DECLINE_ACK', callId: 'c-1' });
  });

  it('a call push while another call is connecting is acked as busy and changes nothing', async () => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    const store = makeStore(VIDEO_ON);
    mount(store);
    await emit({ type: 'PUSH_NOTIFICATION_CLICK', action: 'answer', data: callData(), notification: {} });
    postToPushServiceWorker.mockClear();
    await emit({ type: 'CALL_PUSH', data: callData({ callId: 'c-2' }) });
    expect(postToPushServiceWorker).toHaveBeenCalledWith({ type: 'CALL_PUSH_ACK', callId: 'c-2', busy: true });
    expect(store.getState().call).toMatchObject({ phase: 'connecting', callId: 'c-1' });
    // and the same call again, hidden, is acked plainly
    postToPushServiceWorker.mockClear();
    await emit({ type: 'CALL_PUSH', data: callData() });
    expect(postToPushServiceWorker).toHaveBeenCalledWith({ type: 'CALL_PUSH_ACK', callId: 'c-1' });
  });

  it('a tap on the call notification hands the ring back to the page for its own notification', async () => {
    const { wasCallRaisedFromPush } = await import('../helpers/incomingCallPush');
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    const store = makeStore(VIDEO_ON);
    mount(store);
    await emit({ type: 'CALL_PUSH', data: callData() });
    expect(wasCallRaisedFromPush('c-1')).toBe(true);
    await emit({ type: 'PUSH_NOTIFICATION_CLICK', data: callData(), notification: {} });
    expect(wasCallRaisedFromPush('c-1')).toBe(false);
    expect(store.getState().call.phase).toBe('ringing-incoming');
  });

  it('with the hook mounted twice a message is still handled once', async () => {
    const store = makeStore(VIDEO_ON);
    mount(store, 2);
    expect(handlers).toHaveLength(2);

    await emit({ type: 'PUSH_NOTIFICATION_CLICK', action: 'answer', data: callData(), notification: {} });
    expect(store.getState().call.phase).toBe('connecting');

    // a late CALL_PUSH / repeated tap must not drop the live call back to ringing
    await emit({ type: 'CALL_PUSH', data: callData() });
    await emit({ type: 'PUSH_NOTIFICATION_CLICK', data: callData(), notification: {} });
    expect(store.getState().call.phase).toBe('connecting');

    await emit({ type: 'CALL_PUSH_DECLINE', data: callData({ callId: 'c-2' }) });
    expect(declineChatCall).toHaveBeenCalledTimes(1);
  });

  describe('before the chat config is in Redux (cold start)', () => {
    it('holds the pushed call and answers it once videoCalls is enabled', async () => {
      const store = makeStore(null);
      mount(store);
      await emit({ type: 'PUSH_NOTIFICATION_CLICK', action: 'answer', data: callData(), notification: {} });
      expect(store.getState().call.phase).toBe('idle');

      await act(async () => {
        store.dispatch(setConfig({ xmppSettings: { conference: 'conference.test' }, ...VIDEO_ON } as any));
      });
      expect(store.getState().call).toMatchObject({ phase: 'connecting', callId: 'c-1' });
    });

    it('holds until the user is logged in too', async () => {
      const store = makeStore(VIDEO_ON, '');
      mount(store);
      await emit({ type: 'PUSH_NOTIFICATION_CLICK', data: callData(), notification: {} });
      expect(store.getState().call.phase).toBe('idle');
      await act(async () => {
        store.dispatch(setUser({ token: 'user-jwt', xmppUsername: 'app_b@xmpp.test' } as any));
      });
      expect(store.getState().call.phase).toBe('ringing-incoming');
    });

    it('drops the held call if its token expires before the config arrives', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      try {
        const store = makeStore(null);
        mount(store);
        await emit({ type: 'PUSH_NOTIFICATION_CLICK', data: callData({ callToken: jwt(10_000) }), notification: {} });
        vi.setSystemTime(Date.now() + 20_000);
        await act(async () => {
          store.dispatch(setConfig({ xmppSettings: { conference: 'conference.test' }, ...VIDEO_ON } as any));
        });
        expect(store.getState().call.phase).toBe('idle');
      } finally {
        vi.useRealTimers();
      }
    });

    it('never rings when video calls stay disabled', async () => {
      const store = makeStore({ videoCalls: { enabled: false } });
      mount(store);
      await emit({ type: 'CALL_PUSH', data: callData() });
      await emit({ type: 'PUSH_NOTIFICATION_CLICK', action: 'answer', data: callData(), notification: {} });
      expect(store.getState().call.phase).toBe('idle');
      expect(postToPushServiceWorker).not.toHaveBeenCalled();
    });
  });

  describe('token mirror for the worker', () => {
    it('mirrors the user token while video calls are on and clears it when the user is gone', async () => {
      const store = makeStore(VIDEO_ON);
      mount(store);
      expect(mirrorCallAuthToWorker).toHaveBeenLastCalledWith('user-jwt');
      await act(async () => {
        store.dispatch(setUser({ token: 'refreshed', xmppUsername: 'app_b@xmpp.test' } as any));
      });
      expect(mirrorCallAuthToWorker).toHaveBeenLastCalledWith('refreshed');
      await act(async () => {
        store.dispatch(setUser({ token: '', xmppUsername: '' } as any));
      });
      expect(mirrorCallAuthToWorker).toHaveBeenLastCalledWith('');
    });

    it('mirrors nothing when video calls are off', async () => {
      const store = makeStore({ videoCalls: { enabled: false } });
      mount(store);
      expect(mirrorCallAuthToWorker).toHaveBeenLastCalledWith(null);
    });
  });
  describe('taking the click: ack, one tab only', () => {
    const answerAcks = () =>
      postToPushServiceWorker.mock.calls.filter((c) => c[0].type === 'CALL_PUSH_ANSWER_ACK').map((c) => c[0]);

    // Exclusive locks, the way navigator.locks hands them out with ifAvailable.
    const withLocks = (alreadyHeld: string[] = []) => {
      const held = new Set<string>(alreadyHeld);
      (navigator as any).locks = {
        request: (name: string, _options: unknown, cb: (lock: unknown) => Promise<void> | undefined) => {
          if (held.has(name)) return Promise.resolve(cb(null));
          held.add(name);
          return Promise.resolve(cb({ name }));
        },
      };
    };
    afterEach(() => {
      delete (navigator as any).locks;
    });

    it('acks an Answer that accepted the call, once with the hook mounted twice', async () => {
      withLocks();
      const store = makeStore(VIDEO_ON);
      mount(store, 2);
      await emit({ type: 'PUSH_NOTIFICATION_CLICK', action: 'answer', data: callData(), notification: {} });
      expect(store.getState().call.phase).toBe('connecting');
      expect(answerAcks()).toEqual([{ type: 'CALL_PUSH_ANSWER_ACK', callId: 'c-1' }]);
    });

    it('acks a plain tap, a tap on a call already connecting, and a stale tap that opened its room', async () => {
      const store = makeStore(VIDEO_ON);
      mount(store);
      await emit({ type: 'PUSH_NOTIFICATION_CLICK', data: callData(), notification: {} });
      expect(answerAcks()).toHaveLength(1);
      await emit({ type: 'PUSH_NOTIFICATION_CLICK', action: 'answer', data: callData(), notification: {} });
      expect(answerAcks()).toHaveLength(2);
      await emit({ type: 'PUSH_NOTIFICATION_CLICK', action: 'answer', data: callData({ callId: 'c-2' }), notification: {} });
      expect(answerAcks()).toHaveLength(3); // busy: this page did take the click
      store.dispatch({ type: 'call/endCall' });
      await emit({ type: 'PUSH_NOTIFICATION_CLICK', data: callData({ callId: 'c-3', callToken: jwt(-10_000) }), notification: {} });
      expect(answerAcks()).toHaveLength(4);
    });

    it('does not ack a click it could not take: no videoCalls config, or the call is only held for the config', async () => {
      const off = makeStore({ videoCalls: { enabled: false } });
      const view = mount(off);
      await emit({ type: 'PUSH_NOTIFICATION_CLICK', action: 'answer', data: callData(), notification: {} });
      expect(answerAcks()).toEqual([]);
      view.unmount();

      // enabled but not logged in yet: held until the user is there
      const early = makeStore(VIDEO_ON, '');
      mount(early);
      await emit({ type: 'PUSH_NOTIFICATION_CLICK', action: 'answer', data: callData(), notification: {} });
      expect(early.getState().call.phase).toBe('idle');
      expect(answerAcks()).toEqual([]);
    });

    it('a tab that loses the race for the click leaves it alone: no ring, no accept, no ack', async () => {
      withLocks(['ethora-call-click:c-1']);
      const store = makeStore(VIDEO_ON);
      mount(store);
      await emit({ type: 'PUSH_NOTIFICATION_CLICK', action: 'answer', data: callData(), notification: {} });
      expect(store.getState().call.phase).toBe('idle');
      expect(answerAcks()).toEqual([]);
    });

    it('a page without the videoCalls config is not in the race for the click', async () => {
      withLocks(['ethora-call-click:c-1']);
      const store = makeStore({ videoCalls: { enabled: false } });
      mount(store);
      await emit({ type: 'PUSH_NOTIFICATION_CLICK', action: 'answer', data: callData(), notification: {} });
      expect(store.getState().call.phase).toBe('idle');
    });

    it('an Answer that loses the claim for accepting (the ring screen\'s Accept got it) does not accept, and is acked', async () => {
      withLocks(['ethora-call-decision:c-1']);
      const store = makeStore(VIDEO_ON);
      mount(store);
      await emit({ type: 'PUSH_NOTIFICATION_CLICK', action: 'answer', data: callData(), notification: {} });
      expect(store.getState().call.phase).toBe('idle');
      // acked, so the worker does not navigate or open a page for a handled call
      expect(answerAcks()).toEqual([{ type: 'CALL_PUSH_ANSWER_ACK', callId: 'c-1' }]);
    });

    it('a plain tap needs no claim for accepting: it only raises the ring', async () => {
      withLocks(['ethora-call-decision:c-1']);
      const store = makeStore(VIDEO_ON);
      mount(store);
      await emit({ type: 'PUSH_NOTIFICATION_CLICK', data: callData(), notification: {} });
      expect(store.getState().call.phase).toBe('ringing-incoming');
    });

    it('an Answer for a call another tab already handled does not ring or accept it', async () => {
      const { markCallHandled } = await import('../utils/handledCalls');
      markCallHandled('c-1');
      const store = makeStore(VIDEO_ON);
      mount(store);
      await emit({ type: 'PUSH_NOTIFICATION_CLICK', action: 'answer', data: callData(), notification: {} });
      expect(store.getState().call.phase).toBe('idle');
      expect(answerAcks()).toEqual([{ type: 'CALL_PUSH_ANSWER_ACK', callId: 'c-1' }]);
      await emit({ type: 'CALL_PUSH', data: callData() });
      expect(store.getState().call.phase).toBe('idle');
      expect(postToPushServiceWorker).toHaveBeenCalledWith({ type: 'CALL_PUSH_ACK', callId: 'c-1' });
    });

    describe.each(['Accept first', 'Answer first'])('two tabs ringing for one call, %s, at the same moment', (order) => {
      it('only one of them connects', async () => {
        withLocks();
        resetCallClaims();
        const ringing = (store: ReturnType<typeof makeStore>) =>
          store.dispatch(
            setIncomingCallToken({
              roomJid: 'app_a-app_b@conference.test',
              roomBareName: 'app_a-app_b',
              token: jwt(60_000),
              kind: 'video',
              callId: 'c-1',
            })
          );
        // tab A shows the ring screen, tab B has the hook that takes the notification's Answer
        const storeA = makeStore(VIDEO_ON);
        const storeB = makeStore(VIDEO_ON);
        ringing(storeA);
        ringing(storeB);
        const screen = render(
          <Provider store={storeA}>
            <ToastProvider>
              <VideoCallOverlay />
            </ToastProvider>
          </Provider>
        );
        mount(storeB);
        const accept = () => fireEvent.click(screen.getByLabelText('Accept call'));
        const answer = () =>
          handlers.forEach((h) =>
            h({ data: { type: 'PUSH_NOTIFICATION_CLICK', action: 'answer', data: callData(), notification: {} } })
          );
        await act(async () => {
          if (order === 'Accept first') {
            accept();
            answer();
          } else {
            answer();
            accept();
          }
          await new Promise((r) => setTimeout(r, 20));
        });
        const phases = [storeA.getState().call.phase, storeB.getState().call.phase];
        expect(phases.filter((p) => p === 'connecting')).toHaveLength(1);
        // the loser keeps ringing until the winner's outcome reaches it
        expect(phases.filter((p) => p === 'ringing-incoming')).toHaveLength(1);
      });
    });

    it('a tab that loses the race for the Decline does nothing', async () => {
      withLocks(['ethora-call-decision:c-1']);
      const store = makeStore(VIDEO_ON);
      mount(store);
      await emit({ type: 'CALL_PUSH', data: callData() });
      await emit({ type: 'CALL_PUSH_DECLINE', data: callData() });
      expect(store.getState().call.phase).toBe('ringing-incoming');
      expect(declineChatCall).not.toHaveBeenCalled();
      expect(sendCallStateSignal).not.toHaveBeenCalled();
    });
  });

  describe('telling the worker this page takes calls', () => {
    it('announces on mount and withdraws on unmount', async () => {
      const view = mount(makeStore(VIDEO_ON));
      expect(announceCallClient).toHaveBeenCalledWith(true);
      announceCallClient.mockClear();
      view.unmount();
      expect(announceCallClient).toHaveBeenCalledWith(false);
    });

    it('withdraws only when the last of two hook instances goes away', async () => {
      const store = makeStore(VIDEO_ON);
      const first = render(
        <Provider store={store}>
          <Harness />
        </Provider>
      );
      const second = render(
        <Provider store={store}>
          <Harness />
        </Provider>
      );
      announceCallClient.mockClear();
      first.unmount();
      expect(announceCallClient).not.toHaveBeenCalledWith(false);
      second.unmount();
      expect(announceCallClient).toHaveBeenCalledWith(false);
    });

    it('says nothing when video calls are off, and follows the config when it turns on', async () => {
      const store = makeStore(null);
      mount(store);
      expect(announceCallClient).not.toHaveBeenCalled();
      await act(async () => {
        store.dispatch(setConfig({ xmppSettings: { conference: 'conference.test' }, ...VIDEO_ON } as any));
      });
      expect(announceCallClient).toHaveBeenCalledWith(true);
    });

    it('answers the worker\'s probe, and announces again whenever it asks about a call', async () => {
      mount(makeStore(VIDEO_ON));
      announceCallClient.mockClear();
      await emit({ type: 'CALL_CLIENT_PROBE' });
      expect(announceCallClient).toHaveBeenCalledWith(true);
      announceCallClient.mockClear();
      await emit({ type: 'CALL_PUSH', data: callData() });
      expect(announceCallClient).toHaveBeenCalledWith(true);
    });

    it('does not answer a probe when it cannot take calls', async () => {
      mount(makeStore({ videoCalls: { enabled: false } }));
      await emit({ type: 'CALL_CLIENT_PROBE' });
      expect(announceCallClient).not.toHaveBeenCalled();
    });
  });

  describe('logout clears what the call push flow held', () => {
    it('drops a held call, the worker\'s pending tap and the call notifications', async () => {
      const store = makeStore(null);
      mount(store);
      await emit({ type: 'PUSH_NOTIFICATION_CLICK', action: 'answer', data: callData(), notification: {} });
      expect(deletePendingPushClick).not.toHaveBeenCalled();

      await act(async () => {
        store.dispatch(setUser({ token: '', xmppUsername: '' } as any));
      });
      expect(deletePendingPushClick).toHaveBeenCalledTimes(1);

      // the next user to log in does not get the previous user's call
      await act(async () => {
        store.dispatch(setConfig({ xmppSettings: { conference: 'conference.test' }, ...VIDEO_ON } as any));
        store.dispatch(setUser({ token: 'next-user', xmppUsername: 'app_c@xmpp.test' } as any));
      });
      expect(store.getState().call.phase).toBe('idle');
    });

    it('also clears on a switch to another account', async () => {
      const store = makeStore(VIDEO_ON);
      mount(store);
      await act(async () => {
        store.dispatch(setUser({ token: 'other', xmppUsername: 'app_c@xmpp.test' } as any));
      });
      expect(deletePendingPushClick).toHaveBeenCalledTimes(1);
    });

    it('does not clear for a page that loads before the session is there (a cold-start tap is waiting for it)', async () => {
      const store = makeStore(VIDEO_ON, '');
      mount(store);
      expect(deletePendingPushClick).not.toHaveBeenCalled();
      await act(async () => {
        store.dispatch(setUser({ token: 'user-jwt', xmppUsername: 'app_b@xmpp.test' } as any));
      });
      expect(deletePendingPushClick).not.toHaveBeenCalled();
    });

    it('does not clear when the token is only refreshed', async () => {
      const store = makeStore(VIDEO_ON);
      mount(store);
      await act(async () => {
        store.dispatch(setUser({ token: 'refreshed', xmppUsername: 'app_b@xmpp.test' } as any));
      });
      expect(deletePendingPushClick).not.toHaveBeenCalled();
    });
  });

});
