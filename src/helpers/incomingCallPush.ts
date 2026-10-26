// Page side of an incoming call that arrived as a push (data-only FCM). Three
// things reach it: the service worker asking whether the page rings
// (CALL_PUSH), a tap or an Answer action on the call notification
// (PUSH_NOTIFICATION_CLICK), and a Decline action (CALL_PUSH_DECLINE). All of
// them end up in the same few functions here so both mounted
// usePushNotifications instances, and the XMPP call-token path, agree through
// the guard in callSlice rather than through call-site checks.

import {
  acceptIncomingCall,
  declineIncomingCall,
  setIncomingCallToken,
} from '../roomStore/callSlice';
import { sendCallStateSignal } from '../networking/callTokenStanza';
import { declineChatCall } from '../networking/api-requests/rooms.api';
import {
  deletePendingPushClick,
  postToPushServiceWorker,
} from '../utils/pushServiceWorkerBridge';
import {
  callNotificationKey,
  closeAllCallNotifications,
} from '../utils/callNotifications';
import { broadcastCallOutcome } from '../utils/callBroadcast';
import { claimOnce } from '../utils/webLock';
import { isCallHandled, resetHandledCalls } from '../utils/handledCalls';
import {
  claimCallDecision,
  rememberCallDecision,
  resetCallClaims,
} from './callClaim';
import { getCallPushFreshness, parseCallPush } from './callPush';
import { safeCallName } from '../calls/callDisplay';

export interface CallPushContext {
  dispatch: (action: any) => unknown;
  getState: () => any;
  normalizeRoomJid: (jid?: string) => string;
}

export type CallPushOutcome =
  /** The ring is on (or already was) for this call. */
  | 'ringing'
  /** Ringing and accepted in the same step (Answer action). */
  | 'accepted'
  /** This call is already answered / in progress; nothing to do. */
  | 'active'
  /** Another call is in progress; this one was ignored. */
  | 'busy'
  /** The push is stale; nothing rings. */
  | 'expired'
  /** Another tab already accepted, declined or ended this call; nothing to do. */
  | 'handled'
  /** Held until the chat config and the user are ready. */
  | 'held'
  /** The push carries no LiveKit token, so it cannot ring. */
  | 'no-token';

const RING_TIMEOUT_MS = 45_000;
const RECENT_TTL_MS = 5 * 60_000;
const DECLINE_DEDUPE_MS = 10_000;

// ── pushed-ring bookkeeping ───────────────────────────────────
// A ring whose push the page did NOT ack is announced by the service worker
// (the hidden-tab case: no ack, so the worker shows the notification). The page
// must not add its own notification for it. A ring the page did ack (it was
// visible, the worker showed nothing) is not marked: if the user switches tabs
// mid-ring the page has to notify, and the shared tag `call:<key>` keeps that
// from duplicating anything. Keyed like the notification itself, see
// callNotificationKey.
const raisedFromPush = new Map<string, number>();

const prune = (map: Map<string, number>, ttl: number, now: number) => {
  map.forEach((ts, key) => {
    if (now - ts > ttl) map.delete(key);
  });
};

export const markCallRaisedFromPush = (key: string | null | undefined) => {
  if (!key) return;
  const now = Date.now();
  prune(raisedFromPush, RECENT_TTL_MS, now);
  raisedFromPush.set(key, now);
};

export const unmarkCallRaisedFromPush = (key: string | null | undefined) => {
  if (key) raisedFromPush.delete(key);
};

export const wasCallRaisedFromPush = (key: string | null | undefined): boolean =>
  !!key && raisedFromPush.has(key);

// ── hold until ready ──────────────────────────────────────────
// A cold-start tap can deliver the call push before the host has put the chat
// config (videoCalls) and the user into Redux. It is kept, not dropped, and
// raised once both are there, or discarded when its token expires (45 s after
// being held when the token has no readable exp).
interface PendingCallPush {
  data: Record<string, any>;
  answer: boolean;
  heldAt: number;
  /** The worker is showing this call's notification (see raisedFromPush). */
  swShows: boolean;
}

let pendingCallPush: PendingCallPush | null = null;

export const holdCallPush = (
  data: Record<string, any>,
  answer: boolean,
  swShows = false
) => {
  pendingCallPush = { data, answer, heldAt: Date.now(), swShows };
};

export const takePendingCallPush = (
  now: number = Date.now()
): PendingCallPush | null => {
  const held = pendingCallPush;
  pendingCallPush = null;
  if (!held) return null;
  const { fresh, expiresAt } = getCallPushFreshness(held.data, now);
  if (!fresh) return null;
  if (expiresAt === null && now - held.heldAt > RING_TIMEOUT_MS) return null;
  return held;
};

export const dropPendingCallPush = (callId: string | null | undefined) => {
  if (!pendingCallPush) return;
  if (!callId || parseCallPush(pendingCallPush.data).callId === callId) {
    pendingCallPush = null;
  }
};

export const resetCallPushState = () => {
  pendingCallPush = null;
  raisedFromPush.clear();
  recentDeclines.clear();
  resetHandledCalls();
  resetCallClaims();
};

/**
 * Everything the call push flow holds that belongs to the session: a call push
 * held for the config, the pushed-ring marks, the decline dedupe, the click the
 * worker keeps for the next page load, and the call notifications on screen.
 * Logout (and an account switch) clears it, so the next user never replays or
 * answers the previous one's call.
 */
export const clearCallPushSession = async (scope = '/'): Promise<void> => {
  resetCallPushState();
  await Promise.all([deletePendingPushClick(), closeAllCallNotifications(scope)]);
};

/**
 * Several tabs get the same tap or Answer from the worker. Only one may act on
 * it: the first to take the lock for this call does, the rest leave it. This
 * only routes the click. Whether THIS tab may then accept or decline the call
 * is the per-call claim in callClaim (shared with the ring screen's buttons).
 */
export const claimCallAction = (
  action: 'click',
  key: string
): boolean | Promise<boolean> => claimOnce(`ethora-call-${action}:${key}`);

// ── helpers ───────────────────────────────────────────────────
const isReady = (state: any): boolean =>
  state?.chatSettingStore?.config?.videoCalls?.enabled === true &&
  !!state?.chatSettingStore?.user?.token;

const isSameCall = (
  call: any,
  parsed: ReturnType<typeof parseCallPush>,
  roomJid: string
): boolean => {
  if (!call || call.phase === 'idle') return false;
  if (parsed.callId || call.callId) return (call.callId || null) === parsed.callId;
  return !!roomJid && (call.roomJid || '') === roomJid;
};

const derivePeer = (
  parsed: ReturnType<typeof parseCallPush>,
  selfLocal: string
): string | null => {
  // A group call has no single peer to signal.
  if (parsed.isGroup) return null;
  if (parsed.callerXmppUsername) return parsed.callerXmppUsername;
  // A 1:1 room is named "<userA>-<userB>"; anything else has no derivable peer.
  if (parsed.roomBareName && parsed.roomBareName.includes('-')) {
    const parts = parsed.roomBareName.split('-');
    if (parts.length !== 2) return null;
    return parts.find((p) => p && p !== selfLocal) || null;
  }
  return null;
};

const selfLocalOf = (state: any): string =>
  String(state?.chatSettingStore?.user?.xmppUsername || '')
    .split('@')[0]
    .trim();

/**
 * Puts the ring up from a call push (through the guarded reducer) and, for the
 * Answer action, accepts it right away so LiveKit connects with the push's own
 * token and no second click.
 */
export const raiseIncomingCallFromPush = (
  ctx: CallPushContext,
  data: Record<string, any>,
  options: { answer?: boolean; swShows?: boolean } = {}
): CallPushOutcome => {
  const parsed = parseCallPush(data);
  const answer = options.answer === true;

  if (!getCallPushFreshness(data).fresh) return 'expired';
  if (!parsed.token) return 'no-token';

  // Another tab already took care of this call (accepted, declined, or saw the
  // caller give up): a late push, a stale Answer or a replay must not ring it
  // again, and never accept it. A call this very tab is already in is left to
  // the 'active' answer below.
  const callKey = callNotificationKey(parsed.callId, parsed.roomRef);
  if (isCallHandled(callKey)) {
    const current = ctx.getState()?.call;
    const same = isSameCall(
      current,
      parsed,
      ctx.normalizeRoomJid(parsed.roomRef || '') || parsed.roomRef || ''
    );
    if (same && current.phase !== 'ringing-incoming') return 'active';
    if (!same || answer) return 'handled';
  }

  if (!isReady(ctx.getState())) {
    holdCallPush(data, answer, options.swShows === true);
    return 'held';
  }

  const roomJid = ctx.normalizeRoomJid(parsed.roomRef || '');
  ctx.dispatch(
    setIncomingCallToken({
      roomJid: roomJid || parsed.roomRef || '',
      // callerName is untrusted push text: sanitised, and never a raw chat
      // name (the call slice also refuses those for roomName).
      roomName: safeCallName(parsed.callerName) || parsed.roomBareName,
      roomBareName: parsed.roomBareName,
      token: parsed.token,
      kind: parsed.kind,
      callId: parsed.callId,
      peerXmppUsername: derivePeer(parsed, selfLocalOf(ctx.getState())),
      isGroup: parsed.isGroup,
    })
  );

  const call = ctx.getState().call;
  if (!isSameCall(call, parsed, roomJid || parsed.roomRef || '')) return 'busy';
  if (call.phase !== 'ringing-incoming') return 'active';

  if (options.swShows === true) {
    markCallRaisedFromPush(callKey);
  }
  if (answer) {
    ctx.dispatch(acceptIncomingCall());
    // This tab is the one that accepted, whatever claim it went through.
    rememberCallDecision(callKey);
    // Other tabs still ringing for it end quietly.
    broadcastCallOutcome(callKey, 'accepted');
    return 'accepted';
  }
  return 'ringing';
};

export const flushPendingCallPush = (
  ctx: CallPushContext
): CallPushOutcome | null => {
  if (!isReady(ctx.getState())) return null;
  const held = takePendingCallPush();
  if (!held) return null;
  return raiseIncomingCallFromPush(ctx, held.data, {
    answer: held.answer,
    swShows: held.swShows,
  });
};

/**
 * CALL_PUSH from the worker: ring (or hold) and tell the worker what this page
 * did, so it knows whether to add an OS notification:
 *  - ring shown and this page visible: ack, the worker shows nothing;
 *  - this call is already connecting or in progress here: ack whether the page
 *    is visible or not (a duplicate push must not ring again, nor end as a
 *    "Missed call" for a call that was answered);
 *  - a DIFFERENT call is in progress: ack with `busy`, the worker shows a plain
 *    "Missed call" instead of a ring that Answer could not take;
 *  - anything else (hidden page, held, expired, no token): no ack, the worker
 *    notifies. The hidden or held ring is then the worker's to announce, so it
 *    is marked and the page does not notify a second time.
 */
export const handleCallPushFromWorker = (
  ctx: CallPushContext,
  data: Record<string, any>
): CallPushOutcome => {
  const visible =
    typeof document !== 'undefined' && document.visibilityState === 'visible';
  const mayAck = visible && isReady(ctx.getState());
  const outcome = raiseIncomingCallFromPush(ctx, data, { swShows: !mayAck });
  const callId = parseCallPush(data).callId || '';
  if (outcome === 'active') {
    void postToPushServiceWorker({ type: 'CALL_PUSH_ACK', callId });
  } else if (outcome === 'handled') {
    // Taken care of by another tab: the worker must show nothing for it.
    void postToPushServiceWorker({ type: 'CALL_PUSH_ACK', callId });
  } else if (outcome === 'busy') {
    void postToPushServiceWorker({ type: 'CALL_PUSH_ACK', callId, busy: true });
  } else if ((outcome === 'ringing' || outcome === 'accepted') && mayAck) {
    void postToPushServiceWorker({ type: 'CALL_PUSH_ACK', callId });
  }
  return outcome;
};

// ── decline ───────────────────────────────────────────────────
const recentDeclines = new Map<string, number>();

/**
 * Declines a call from a notification action. Both mounted hook instances get
 * the worker's message, so a repeat for the same call is dropped. A call this
 * page has already answered is left alone: a stale Decline must never hang up
 * a live call.
 *
 * Tells the worker (CALL_PUSH_DECLINE_ACK) once the decline was actually
 * handled, and only then: the worker waits for it and otherwise declines over
 * REST itself. A page that cannot do the XMPP part (the chat config is not in
 * Redux yet) still has the user token, so it does the REST decline and acks
 * when the server took it.
 */
export const declineIncomingCallFromPush = async (
  ctx: CallPushContext,
  data: Record<string, any>
): Promise<void> => {
  const parsed = parseCallPush(data);
  const roomJid = ctx.normalizeRoomJid(parsed.roomRef || '');
  const now = Date.now();
  const dedupeKey = parsed.callId || roomJid;
  prune(recentDeclines, DECLINE_DEDUPE_MS, now);
  if (dedupeKey) {
    if (recentDeclines.has(dedupeKey)) return;
    recentDeclines.set(dedupeKey, now);
  }
  const callKey = callNotificationKey(parsed.callId, parsed.roomRef);
  // Another tab already accepted, declined or ended this call. A stale Decline
  // must not hang up a call that was answered elsewhere. Acked all the same:
  // the worker declines over REST when it hears nothing back, and that would
  // do exactly that.
  if (isCallHandled(callKey)) {
    dropPendingCallPush(parsed.callId);
    void postToPushServiceWorker({
      type: 'CALL_PUSH_DECLINE_ACK',
      callId: parsed.callId || '',
    });
    return;
  }
  // The worker sent this to every tab that could take it: only one acts on it
  // (the same per-call claim the ring screen's buttons take). A page that
  // cannot do the XMPP part (no videoCalls config) is not in that race, it only
  // has the REST call below.
  const takesCalls =
    ctx.getState()?.chatSettingStore?.config?.videoCalls?.enabled === true;
  if (takesCalls) {
    const claim = claimCallDecision(callKey);
    if ((typeof claim === 'boolean' ? claim : await claim) === false) return;
  }
  const state = ctx.getState();

  dropPendingCallPush(parsed.callId);

  let handled = false;
  if (state?.chatSettingStore?.config?.videoCalls?.enabled === true) {
    const call = state?.call;
    const sameCall = isSameCall(call, parsed, roomJid);
    // A call this page already answered stays up. Acked all the same: the
    // worker must not decline it over REST because it heard nothing back.
    if (sameCall && call.phase !== 'ringing-incoming') {
      void postToPushServiceWorker({
        type: 'CALL_PUSH_DECLINE_ACK',
        callId: parsed.callId || '',
      });
      return;
    }

    const peer = derivePeer(parsed, selfLocalOf(state));
    if (peer) {
      sendCallStateSignal('declined', {
        peerXmppUsername: peer,
        callId: parsed.callId,
        roomBareName: parsed.roomBareName,
      });
    } else if (sameCall) {
      sendCallStateSignal('declined');
    }
    if (sameCall) ctx.dispatch(declineIncomingCall());
    handled = true;
    // Other tabs still ringing for it end quietly.
    broadcastCallOutcome(callKey, 'declined');
  }

  const ack = () =>
    void postToPushServiceWorker({
      type: 'CALL_PUSH_DECLINE_ACK',
      callId: parsed.callId || '',
    });
  if (handled) {
    // The caller already heard it over XMPP; the REST call (the dead-socket
    // path, and it tears the LiveKit room down) must not hold the ack back past
    // the worker's wait.
    ack();
    if (parsed.callId) await declineChatCall(parsed.callId);
    return;
  }
  // Nothing could be done here but the REST call: it is the decline, so it
  // acks only when the server took it.
  if (parsed.callId && (await declineChatCall(parsed.callId))) {
    ack();
    broadcastCallOutcome(callKey, 'declined');
  }
};
