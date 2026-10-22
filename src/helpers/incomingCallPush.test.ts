import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import callReducer, { setCallPhase } from '../roomStore/callSlice';

const sendCallStateSignal = vi.fn();
const declineChatCall = vi.fn(async (_callId: string) => true);
const postToPushServiceWorker = vi.fn(async (_message: Record<string, unknown>) => true);
const deletePendingPushClick = vi.fn(async () => undefined);
const broadcastCallOutcome = vi.fn();

vi.mock('../networking/callTokenStanza', () => ({
  sendCallStateSignal: (...args: unknown[]) => sendCallStateSignal(...args),
}));
vi.mock('../networking/api-requests/rooms.api', () => ({
  declineChatCall: (...args: unknown[]) => declineChatCall(args[0] as string),
}));
vi.mock('../utils/pushServiceWorkerBridge', () => ({
  postToPushServiceWorker: (...args: unknown[]) => postToPushServiceWorker(args[0] as Record<string, unknown>),
  deletePendingPushClick: () => deletePendingPushClick(),
}));
vi.mock('../utils/callBroadcast', () => ({
  broadcastCallOutcome: (...args: unknown[]) => broadcastCallOutcome(...args),
}));

import { HANDLED_CALLS_TTL_MS, markCallHandled } from '../utils/handledCalls';
import {
  clearCallPushSession,
  declineIncomingCallFromPush,
  flushPendingCallPush,
  handleCallPushFromWorker,
  raiseIncomingCallFromPush,
  resetCallPushState,
  unmarkCallRaisedFromPush,
  wasCallRaisedFromPush,
} from './incomingCallPush';

const NOW = 1_700_000_000_000;
const jwt = (expOffsetMs: number | null) =>
  `h.${btoa(JSON.stringify(expOffsetMs === null ? { sub: 'x' } : { exp: (NOW + expOffsetMs) / 1000 }))}.s`;

const push = (extra: Record<string, unknown> = {}) => ({
  type: 'call',
  callId: 'c-1',
  callToken: jwt(60_000),
  room: 'app_a-app_b',
  kind: 'video',
  callerName: 'Alice',
  callerXmppUsername: 'app_a',
  ...extra,
});

const makeCtx = (ready = true) => {
  const state = { ready };
  const store = configureStore({
    reducer: {
      call: callReducer,
      chatSettingStore: (
        s = {
          config: { videoCalls: { enabled: true } },
          user: { token: 'user-jwt', xmppUsername: 'app_b@xmpp.test' },
        }
      ) => s,
    },
  });
  return {
    store,
    state,
    ctx: {
      dispatch: store.dispatch as (a: any) => unknown,
      getState: () => {
        const s = store.getState();
        return state.ready
          ? s
          : { ...s, chatSettingStore: { config: { colors: {} }, user: { token: '' } } };
      },
      normalizeRoomJid: (jid?: string) =>
        !jid || jid.includes('@') ? jid || '' : `${jid}@conference.xmpp.test`,
    },
  };
};

const setVisibility = (state: 'visible' | 'hidden') =>
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });

describe('incoming call push (page side)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    resetCallPushState();
    sendCallStateSignal.mockClear();
    declineChatCall.mockClear();
    postToPushServiceWorker.mockClear();
    deletePendingPushClick.mockClear();
    broadcastCallOutcome.mockClear();
    setVisibility('visible');
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('raising the ring', () => {
    it('rings through the guarded path with the normalized room and the push token', () => {
      const { ctx, store } = makeCtx();
      expect(raiseIncomingCallFromPush(ctx, push())).toBe('ringing');
      expect(store.getState().call).toMatchObject({
        phase: 'ringing-incoming',
        direction: 'incoming',
        kind: 'video',
        callId: 'c-1',
        roomJid: 'app_a-app_b@conference.xmpp.test',
        roomBareName: 'app_a-app_b',
        roomName: 'Alice',
        peerXmppUsername: 'app_a',
        token: push().callToken,
      });
      // not marked: nothing says the worker is showing a notification for it
      expect(wasCallRaisedFromPush('c-1')).toBe(false);
    });

    it('marks the ring as announced by the worker only when told it is', () => {
      const { ctx } = makeCtx();
      raiseIncomingCallFromPush(ctx, push(), { swShows: true });
      expect(wasCallRaisedFromPush('c-1')).toBe(true);
    });

    it('the Answer action accepts it straight away, so LiveKit connects with no second click', () => {
      const { ctx, store } = makeCtx();
      expect(raiseIncomingCallFromPush(ctx, push(), { answer: true })).toBe('accepted');
      expect(store.getState().call).toMatchObject({
        phase: 'connecting',
        callId: 'c-1',
        token: push().callToken,
      });
    });

    it('Answer on a ring that is already up accepts that ring', () => {
      const { ctx, store } = makeCtx();
      raiseIncomingCallFromPush(ctx, push());
      expect(raiseIncomingCallFromPush(ctx, push(), { answer: true })).toBe('accepted');
      expect(store.getState().call.phase).toBe('connecting');
    });

    it('an expired push opens nothing ringing, not even for Answer', () => {
      const { ctx, store } = makeCtx();
      expect(raiseIncomingCallFromPush(ctx, push({ callToken: jwt(-5_000) }), { answer: true })).toBe('expired');
      expect(raiseIncomingCallFromPush(ctx, push({ callToken: jwt(2_000) }))).toBe('expired');
      expect(store.getState().call.phase).toBe('idle');
    });

    it('a push without a token cannot ring', () => {
      const { ctx, store } = makeCtx();
      expect(raiseIncomingCallFromPush(ctx, push({ callToken: undefined }))).toBe('no-token');
      expect(store.getState().call.phase).toBe('idle');
    });

    it('a late push for the call just answered does not disturb it', () => {
      const { ctx, store } = makeCtx();
      raiseIncomingCallFromPush(ctx, push(), { answer: true });
      store.dispatch(setCallPhase('in-call'));
      const live = store.getState().call;
      expect(raiseIncomingCallFromPush(ctx, push())).toBe('active');
      expect(raiseIncomingCallFromPush(ctx, push(), { answer: true })).toBe('active');
      expect(store.getState().call).toEqual(live);
    });

    it('another call while busy is ignored', () => {
      const { ctx, store } = makeCtx();
      raiseIncomingCallFromPush(ctx, push(), { answer: true });
      expect(raiseIncomingCallFromPush(ctx, push({ callId: 'c-2', room: 'app_c-app_b' }))).toBe('busy');
      expect(store.getState().call).toMatchObject({ phase: 'connecting', callId: 'c-1' });
    });

    it('raising the same ring twice (two hook instances) keeps one ring', () => {
      const { ctx, store } = makeCtx();
      raiseIncomingCallFromPush(ctx, push());
      const first = store.getState().call;
      vi.setSystemTime(NOW + 20_000);
      raiseIncomingCallFromPush(ctx, push());
      expect(store.getState().call).toEqual(first);
    });
  });

  describe('push before the chat config is ready', () => {
    it('is held, not dropped, and rings once config and user are there', () => {
      const { ctx, store, state } = makeCtx(false);
      expect(raiseIncomingCallFromPush(ctx, push())).toBe('held');
      expect(store.getState().call.phase).toBe('idle');
      expect(flushPendingCallPush(ctx)).toBeNull();

      state.ready = true;
      expect(flushPendingCallPush(ctx)).toBe('ringing');
      expect(store.getState().call).toMatchObject({ phase: 'ringing-incoming', callId: 'c-1' });
      // handed out once
      expect(flushPendingCallPush(ctx)).toBeNull();
    });

    it('remembers that it was an Answer', () => {
      const { ctx, store, state } = makeCtx(false);
      raiseIncomingCallFromPush(ctx, push(), { answer: true });
      state.ready = true;
      expect(flushPendingCallPush(ctx)).toBe('accepted');
      expect(store.getState().call.phase).toBe('connecting');
    });

    it('is dropped when its token expires while waiting', () => {
      const { ctx, store, state } = makeCtx(false);
      raiseIncomingCallFromPush(ctx, push());
      vi.setSystemTime(NOW + 58_000);
      state.ready = true;
      expect(flushPendingCallPush(ctx)).toBeNull();
      expect(store.getState().call.phase).toBe('idle');
    });

    it('a push whose token has no exp is held for at most the 45 s ring window', () => {
      const { ctx, store, state } = makeCtx(false);
      raiseIncomingCallFromPush(ctx, push({ callToken: jwt(null) }));
      vi.setSystemTime(NOW + 46_000);
      state.ready = true;
      expect(flushPendingCallPush(ctx)).toBeNull();
      expect(store.getState().call.phase).toBe('idle');
    });

    it('keeps only the newest held call', () => {
      const { ctx, store, state } = makeCtx(false);
      raiseIncomingCallFromPush(ctx, push());
      raiseIncomingCallFromPush(ctx, push({ callId: 'c-2' }));
      state.ready = true;
      flushPendingCallPush(ctx);
      expect(store.getState().call.callId).toBe('c-2');
    });
  });

  describe('CALL_PUSH from the worker', () => {
    it('acks when the page is visible and now rings', () => {
      const { ctx, store } = makeCtx();
      expect(handleCallPushFromWorker(ctx, push())).toBe('ringing');
      expect(store.getState().call.phase).toBe('ringing-incoming');
      expect(postToPushServiceWorker).toHaveBeenCalledWith({ type: 'CALL_PUSH_ACK', callId: 'c-1' });
    });

    it('a visible ring acked by the page is not marked, so leaving the tab mid-ring still notifies', () => {
      const { ctx } = makeCtx();
      handleCallPushFromWorker(ctx, push());
      expect(wasCallRaisedFromPush('c-1')).toBe(false);
    });

    it('a hidden page rings (overlay ready on focus) but does not ack, so the worker notifies', () => {
      setVisibility('hidden');
      const { ctx, store } = makeCtx();
      expect(handleCallPushFromWorker(ctx, push())).toBe('ringing');
      expect(store.getState().call.phase).toBe('ringing-incoming');
      expect(postToPushServiceWorker).not.toHaveBeenCalled();
      // and it knows the worker owns the OS notification
      expect(wasCallRaisedFromPush('c-1')).toBe(true);
    });

    it('acks a call this page already answered, visible or hidden', () => {
      for (const visibility of ['visible', 'hidden'] as const) {
        setVisibility(visibility);
        postToPushServiceWorker.mockClear();
        resetCallPushState();
        const { ctx } = makeCtx();
        raiseIncomingCallFromPush(ctx, push(), { answer: true });
        expect(handleCallPushFromWorker(ctx, push())).toBe('active');
        expect(postToPushServiceWorker).toHaveBeenCalledWith({ type: 'CALL_PUSH_ACK', callId: 'c-1' });
        expect(postToPushServiceWorker).toHaveBeenCalledTimes(1);
      }
    });

    it('acks a call that is in progress (connected), hidden', () => {
      setVisibility('hidden');
      const { ctx, store } = makeCtx();
      raiseIncomingCallFromPush(ctx, push(), { answer: true });
      store.dispatch(setCallPhase('in-call'));
      expect(handleCallPushFromWorker(ctx, push())).toBe('active');
      expect(postToPushServiceWorker).toHaveBeenCalledWith({ type: 'CALL_PUSH_ACK', callId: 'c-1' });
      expect(store.getState().call.phase).toBe('in-call');
    });

    it('acks a different call while busy with busy:true, hidden or not', () => {
      for (const visibility of ['visible', 'hidden'] as const) {
        setVisibility(visibility);
        postToPushServiceWorker.mockClear();
        resetCallPushState();
        const { ctx, store } = makeCtx();
        raiseIncomingCallFromPush(ctx, push(), { answer: true });
        expect(handleCallPushFromWorker(ctx, push({ callId: 'c-2' }))).toBe('busy');
        expect(postToPushServiceWorker).toHaveBeenCalledWith({ type: 'CALL_PUSH_ACK', callId: 'c-2', busy: true });
        expect(store.getState().call).toMatchObject({ phase: 'connecting', callId: 'c-1' });
        expect(wasCallRaisedFromPush('c-2')).toBe(false);
      }
    });

    it('does not ack a stale push, a held call, or a push without a token', () => {
      const { ctx, state } = makeCtx();
      expect(handleCallPushFromWorker(ctx, push({ callToken: jwt(-1_000) }))).toBe('expired');
      expect(handleCallPushFromWorker(ctx, push({ callToken: undefined }))).toBe('no-token');
      state.ready = false;
      expect(handleCallPushFromWorker(ctx, push({ callId: 'c-3' }))).toBe('held');
      expect(postToPushServiceWorker).not.toHaveBeenCalled();
    });

    it('a call held for the worker\'s notification is marked once it rings, even if the page is visible', () => {
      const { ctx, state } = makeCtx(false);
      expect(handleCallPushFromWorker(ctx, push())).toBe('held');
      expect(postToPushServiceWorker).not.toHaveBeenCalled();
      state.ready = true;
      expect(flushPendingCallPush(ctx)).toBe('ringing');
      expect(wasCallRaisedFromPush('c-1')).toBe(true);
    });

    it('a call without a callId is keyed by its room', () => {
      setVisibility('hidden');
      const { ctx } = makeCtx();
      handleCallPushFromWorker(ctx, push({ callId: undefined }));
      expect(wasCallRaisedFromPush('c-1')).toBe(false);
      expect(wasCallRaisedFromPush('room:app_a-app_b')).toBe(true);
    });

    it('an unmarked ring can be marked again by a later push', () => {
      setVisibility('hidden');
      const { ctx } = makeCtx();
      handleCallPushFromWorker(ctx, push());
      unmarkCallRaisedFromPush('c-1');
      expect(wasCallRaisedFromPush('c-1')).toBe(false);
    });
  });

  describe('Decline', () => {
    it('tells the caller over XMPP and REST and clears the ring', () => {
      const { ctx, store } = makeCtx();
      raiseIncomingCallFromPush(ctx, push());
      declineIncomingCallFromPush(ctx, push());
      expect(sendCallStateSignal).toHaveBeenCalledWith('declined', {
        peerXmppUsername: 'app_a',
        callId: 'c-1',
        roomBareName: 'app_a-app_b',
      });
      expect(declineChatCall).toHaveBeenCalledWith('c-1');
      expect(store.getState().call.phase).toBe('idle');
    });

    it('still declines (XMPP + REST) when this page never raised the ring', () => {
      const { ctx, store } = makeCtx();
      declineIncomingCallFromPush(ctx, push());
      expect(sendCallStateSignal).toHaveBeenCalledTimes(1);
      expect(declineChatCall).toHaveBeenCalledWith('c-1');
      expect(store.getState().call.phase).toBe('idle');
    });

    it('is done once even though two hook instances receive the message', () => {
      const { ctx } = makeCtx();
      declineIncomingCallFromPush(ctx, push());
      declineIncomingCallFromPush(ctx, push());
      expect(sendCallStateSignal).toHaveBeenCalledTimes(1);
      expect(declineChatCall).toHaveBeenCalledTimes(1);
    });

    it('never hangs up a call this page already answered', () => {
      const { ctx, store } = makeCtx();
      raiseIncomingCallFromPush(ctx, push(), { answer: true });
      declineIncomingCallFromPush(ctx, push());
      expect(sendCallStateSignal).not.toHaveBeenCalled();
      expect(declineChatCall).not.toHaveBeenCalled();
      expect(store.getState().call.phase).toBe('connecting');
    });

    it('leaves a different ring alone and never borrows its peer', () => {
      const { ctx, store } = makeCtx();
      raiseIncomingCallFromPush(ctx, push({ callId: 'c-2', room: 'app_c-app_b', callerXmppUsername: 'app_c' }));
      declineIncomingCallFromPush(ctx, push({ callerXmppUsername: undefined, room: 'singleroom' }));
      expect(sendCallStateSignal).not.toHaveBeenCalled();
      expect(declineChatCall).toHaveBeenCalledWith('c-1');
      expect(store.getState().call).toMatchObject({ phase: 'ringing-incoming', callId: 'c-2' });
    });

    it('drops a held copy of the declined call', () => {
      const { ctx, store, state } = makeCtx(false);
      raiseIncomingCallFromPush(ctx, push());
      state.ready = true;
      declineIncomingCallFromPush(ctx, push());
      expect(flushPendingCallPush(ctx)).toBeNull();
      expect(store.getState().call.phase).toBe('idle');
    });

    it('does no XMPP work when video calls are not enabled, but still declines over REST and acks', async () => {
      const { ctx } = makeCtx(false);
      await declineIncomingCallFromPush(ctx, push());
      expect(sendCallStateSignal).not.toHaveBeenCalled();
      expect(declineChatCall).toHaveBeenCalledWith('c-1');
      expect(postToPushServiceWorker).toHaveBeenCalledWith({ type: 'CALL_PUSH_DECLINE_ACK', callId: 'c-1' });
    });

    it('acks once the XMPP decline is done, without waiting for the REST call', async () => {
      const { ctx } = makeCtx();
      raiseIncomingCallFromPush(ctx, push());
      let finishRest: (ok: boolean) => void = () => {};
      declineChatCall.mockImplementationOnce(() => new Promise<boolean>((resolve) => (finishRest = resolve)));
      const pending = declineIncomingCallFromPush(ctx, push());
      expect(sendCallStateSignal).toHaveBeenCalledTimes(1);
      expect(postToPushServiceWorker).toHaveBeenCalledWith({ type: 'CALL_PUSH_DECLINE_ACK', callId: 'c-1' });
      finishRest(true);
      await pending;
    });

    it('without the XMPP part the ack waits for the REST decline to go through', async () => {
      const { ctx } = makeCtx(false);
      let finishRest: (ok: boolean) => void = () => {};
      declineChatCall.mockImplementationOnce(() => new Promise<boolean>((resolve) => (finishRest = resolve)));
      const pending = declineIncomingCallFromPush(ctx, push());
      expect(postToPushServiceWorker).not.toHaveBeenCalled();
      finishRest(true);
      await pending;
      expect(postToPushServiceWorker).toHaveBeenCalledWith({ type: 'CALL_PUSH_DECLINE_ACK', callId: 'c-1' });
    });

    it('does not ack a decline it could not do: no video calls and no usable REST token', async () => {
      const { ctx } = makeCtx(false);
      declineChatCall.mockResolvedValueOnce(false);
      await declineIncomingCallFromPush(ctx, push());
      expect(postToPushServiceWorker).not.toHaveBeenCalled();
    });

    it('acks after the full decline, XMPP and REST', async () => {
      const { ctx } = makeCtx();
      raiseIncomingCallFromPush(ctx, push());
      await declineIncomingCallFromPush(ctx, push());
      expect(postToPushServiceWorker).toHaveBeenCalledTimes(1);
      expect(postToPushServiceWorker).toHaveBeenCalledWith({ type: 'CALL_PUSH_DECLINE_ACK', callId: 'c-1' });
    });

    it('acks a decline for a call it already answered, so the worker does not hang it up over REST', async () => {
      const { ctx, store } = makeCtx();
      raiseIncomingCallFromPush(ctx, push(), { answer: true });
      await declineIncomingCallFromPush(ctx, push());
      expect(postToPushServiceWorker).toHaveBeenCalledWith({ type: 'CALL_PUSH_DECLINE_ACK', callId: 'c-1' });
      expect(declineChatCall).not.toHaveBeenCalled();
      expect(store.getState().call.phase).toBe('connecting');
    });

    it('the repeat for the second hook instance neither declines nor acks again', async () => {
      const { ctx } = makeCtx();
      await declineIncomingCallFromPush(ctx, push());
      postToPushServiceWorker.mockClear();
      await declineIncomingCallFromPush(ctx, push());
      expect(postToPushServiceWorker).not.toHaveBeenCalled();
    });
  });
  describe('other tabs', () => {
    // Exclusive locks, the way navigator.locks hands them out with ifAvailable.
    const withLocks = () => {
      const held = new Set<string>();
      (navigator as any).locks = {
        request: (name: string, _options: unknown, cb: (lock: unknown) => Promise<void> | undefined) => {
          if (held.has(name)) return Promise.resolve(cb(null));
          held.add(name);
          return Promise.resolve(cb({ name })).finally(() => held.delete(name));
        },
      };
    };
    afterEach(() => {
      delete (navigator as any).locks;
    });

    it('announces an Answer that accepted the call, so other tabs end their ring', () => {
      const { ctx } = makeCtx();
      raiseIncomingCallFromPush(ctx, push(), { answer: true });
      expect(broadcastCallOutcome).toHaveBeenCalledWith('c-1', 'accepted');
    });

    it('does not announce a plain ring', () => {
      const { ctx } = makeCtx();
      raiseIncomingCallFromPush(ctx, push());
      expect(broadcastCallOutcome).not.toHaveBeenCalled();
    });

    it('announces a decline it handled, keyed like the notification', async () => {
      const { ctx } = makeCtx();
      raiseIncomingCallFromPush(ctx, push());
      await declineIncomingCallFromPush(ctx, push());
      expect(broadcastCallOutcome).toHaveBeenCalledWith('c-1', 'declined');
      broadcastCallOutcome.mockClear();
      await declineIncomingCallFromPush(makeCtx().ctx, push({ callId: undefined }));
      expect(broadcastCallOutcome).toHaveBeenCalledWith('room:app_a-app_b', 'declined');
    });

    it('a tab that loses the race for the Decline does nothing: no signal and no second REST call', async () => {
      withLocks();
      const winner = makeCtx();
      const loser = makeCtx();
      raiseIncomingCallFromPush(winner.ctx, push());
      raiseIncomingCallFromPush(loser.ctx, push());
      let finishRest: (ok: boolean) => void = () => {};
      declineChatCall.mockImplementationOnce(() => new Promise<boolean>((resolve) => (finishRest = resolve)));
      const first = declineIncomingCallFromPush(winner.ctx, push());
      await vi.advanceTimersByTimeAsync(0);
      expect(sendCallStateSignal).toHaveBeenCalledTimes(1);
      // a second tab: its own page state, so the decline dedupe of this page does not hide the lock
      resetCallPushState();
      sendCallStateSignal.mockClear();
      const second = declineIncomingCallFromPush(loser.ctx, push());
      await vi.advanceTimersByTimeAsync(0);
      await second;
      expect(sendCallStateSignal).not.toHaveBeenCalled();
      expect(loser.store.getState().call.phase).toBe('ringing-incoming');
      expect(declineChatCall).toHaveBeenCalledTimes(1);
      finishRest(true);
      await first;
      expect(winner.store.getState().call.phase).toBe('idle');
    });

    it('a page that cannot take calls does not enter the race, it only has the REST decline', async () => {
      withLocks();
      const winner = makeCtx();
      const host = makeCtx(false);
      raiseIncomingCallFromPush(winner.ctx, push());
      const first = declineIncomingCallFromPush(winner.ctx, push());
      resetCallPushState();
      await declineIncomingCallFromPush(host.ctx, push());
      await first;
      expect(declineChatCall).toHaveBeenCalledTimes(2);
    });
  });

  describe('a call another tab already handled', () => {
    it('is not raised again by a late push, and not accepted by a stale Answer', () => {
      markCallHandled('c-1');
      const { ctx, store } = makeCtx();
      expect(raiseIncomingCallFromPush(ctx, push())).toBe('handled');
      expect(raiseIncomingCallFromPush(ctx, push(), { answer: true })).toBe('handled');
      expect(store.getState().call.phase).toBe('idle');
      expect(broadcastCallOutcome).not.toHaveBeenCalled();
    });

    it('is refused even while another call is in progress (not "busy": no Missed call for it)', () => {
      const { ctx, store } = makeCtx();
      raiseIncomingCallFromPush(ctx, push({ callId: 'c-2' }), { answer: true });
      markCallHandled('c-1');
      expect(raiseIncomingCallFromPush(ctx, push())).toBe('handled');
      expect(store.getState().call.callId).toBe('c-2');
    });

    it('refuses a held call that was handled while it waited', () => {
      const { ctx, state, store } = makeCtx(false);
      expect(raiseIncomingCallFromPush(ctx, push(), { answer: true })).toBe('held');
      markCallHandled('c-1');
      state.ready = true;
      expect(flushPendingCallPush(ctx)).toBe('handled');
      expect(store.getState().call.phase).toBe('idle');
    });

    it('does not accept a ring this tab still shows when the Answer arrives for a handled call', () => {
      const { ctx, store } = makeCtx();
      raiseIncomingCallFromPush(ctx, push());
      markCallHandled('c-1');
      expect(raiseIncomingCallFromPush(ctx, push(), { answer: true })).toBe('handled');
      expect(store.getState().call.phase).toBe('ringing-incoming');
    });

    it('still reports a call this very tab is in as active, not handled', () => {
      const { ctx } = makeCtx();
      raiseIncomingCallFromPush(ctx, push(), { answer: true });
      // the accept announced the outcome, which marks the call handled
      markCallHandled('c-1');
      expect(raiseIncomingCallFromPush(ctx, push(), { answer: true })).toBe('active');
      expect(raiseIncomingCallFromPush(ctx, push())).toBe('active');
    });

    it('is raised again once the remembered key has expired (about 2 minutes)', () => {
      markCallHandled('c-1');
      vi.setSystemTime(NOW + HANDLED_CALLS_TTL_MS - 1000);
      const { ctx } = makeCtx();
      expect(raiseIncomingCallFromPush(ctx, push({ callToken: jwt(10 * 60_000) }))).toBe('handled');
      vi.setSystemTime(NOW + HANDLED_CALLS_TTL_MS + 1000);
      expect(raiseIncomingCallFromPush(ctx, push({ callToken: jwt(10 * 60_000) }))).toBe('ringing');
    });

    it('a call without a callId is never refused on the strength of its room alone', () => {
      markCallHandled('room:app_a-app_b');
      const { ctx } = makeCtx();
      expect(raiseIncomingCallFromPush(ctx, push({ callId: undefined }))).toBe('ringing');
    });

    it('is acked to the worker so it shows nothing for it', () => {
      markCallHandled('c-1');
      const { ctx } = makeCtx();
      setVisibility('hidden');
      expect(handleCallPushFromWorker(ctx, push())).toBe('handled');
      expect(postToPushServiceWorker).toHaveBeenCalledWith({ type: 'CALL_PUSH_ACK', callId: 'c-1' });
    });

    it('a Decline for it neither hangs up nor signals the caller, and is acked so the worker does not decline over REST', async () => {
      const { ctx, store } = makeCtx();
      raiseIncomingCallFromPush(ctx, push(), { answer: true });
      markCallHandled('c-1');
      store.dispatch({ type: 'call/endCall' });
      sendCallStateSignal.mockClear();
      await declineIncomingCallFromPush(ctx, push());
      expect(sendCallStateSignal).not.toHaveBeenCalled();
      expect(declineChatCall).not.toHaveBeenCalled();
      expect(postToPushServiceWorker).toHaveBeenCalledWith({ type: 'CALL_PUSH_DECLINE_ACK', callId: 'c-1' });
    });

    it('is forgotten on logout', async () => {
      markCallHandled('c-1');
      await clearCallPushSession();
      const { ctx } = makeCtx();
      expect(raiseIncomingCallFromPush(ctx, push())).toBe('ringing');
    });
  });

  describe('clearCallPushSession (logout)', () => {
    it('drops a held call, the pushed-ring marks and the decline dedupe', async () => {
      const held = makeCtx(false);
      expect(raiseIncomingCallFromPush(held.ctx, push(), { swShows: true })).toBe('held');
      const { ctx } = makeCtx();
      raiseIncomingCallFromPush(ctx, push({ callId: 'c-2' }), { swShows: true });
      await declineIncomingCallFromPush(ctx, push({ callId: 'c-3' }));
      expect(wasCallRaisedFromPush('c-2')).toBe(true);

      await clearCallPushSession();

      expect(flushPendingCallPush(makeCtx().ctx)).toBeNull();
      expect(wasCallRaisedFromPush('c-2')).toBe(false);
      // the same call can be declined again (a new session): the dedupe was cleared
      sendCallStateSignal.mockClear();
      await declineIncomingCallFromPush(makeCtx().ctx, push({ callId: 'c-3' }));
      expect(declineChatCall).toHaveBeenLastCalledWith('c-3');
    });

    it('deletes the tap the worker keeps for the next page load', async () => {
      await clearCallPushSession();
      expect(deletePendingPushClick).toHaveBeenCalledTimes(1);
    });

    it('closes the call notifications on screen, rings and missed calls', async () => {
      const ring = { tag: 'call:c-1', close: vi.fn() };
      const missed = { tag: 'missed-call:room', close: vi.fn() };
      const chat = { tag: 'ethora-room-x', close: vi.fn() };
      (navigator as any).serviceWorker = {
        getRegistration: async () => ({ getNotifications: async () => [ring, missed, chat] }),
      };
      try {
        await clearCallPushSession('/scope/');
      } finally {
        delete (navigator as any).serviceWorker;
      }
      expect(ring.close).toHaveBeenCalled();
      expect(missed.close).toHaveBeenCalled();
      expect(chat.close).not.toHaveBeenCalled();
    });
  });

});
