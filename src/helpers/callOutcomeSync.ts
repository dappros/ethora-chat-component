// Keeps the tabs of one origin in step about an incoming ring (item: a hidden
// tab ringing for a call that another tab answered, declined or saw cancelled
// must end quietly, not time out into a false "Missed call").
//
//  - Sending: every time a ring in THIS tab ends (answered, declined, cancelled
//    by the caller, replaced by another call) the outcome goes out on the
//    broadcast channel. Read from the store itself, one dispatch at a time, so
//    it does not depend on what React happened to render.
//  - Receiving: a tab still ringing for that call ends its ring without any
//    signal to the caller or the server and without a "Missed call".
//  - A ring that merely timed out is not announced: each tab times out on its
//    own, and each shows its own (deduplicated) "Missed call".
//  - Safety net: a tab that is already connecting or in the call for a key that
//    another tab announced as accepted, and that never took the per-call claim
//    itself, lost the race. It leaves quietly (no signal to the caller, no
//    call log) so the call is not connected twice with one identity.

import { declineIncomingCall } from '../roomStore/callSlice';
import { callNotificationKey } from '../utils/callNotifications';
import { wonCallDecision } from './callClaim';
import {
  broadcastCallOutcome,
  subscribeCallOutcomes,
} from '../utils/callBroadcast';

const SILENCE_TTL_MS = 5000;
const silenced = new Map<string, number>();

/**
 * Marks the end of the ring `key` as local-only: the next time this tab's ring
 * for it ends, nothing is broadcast. For a timeout, and for an end that came
 * from another tab (no echo).
 */
export const silenceCallOutcome = (key: string | null | undefined): void => {
  if (!key) return;
  const now = Date.now();
  silenced.forEach((ts, k) => {
    if (now - ts > SILENCE_TTL_MS) silenced.delete(k);
  });
  silenced.set(key, now);
};

const takeSilence = (key: string): boolean => {
  const ts = silenced.get(key);
  silenced.delete(key);
  return ts !== undefined && Date.now() - ts <= SILENCE_TTL_MS;
};

type CallLike = {
  direction: string | null;
  phase: string;
  callId: string | null;
  roomJid: string | null;
  roomBareName: string | null;
};

export const incomingCallKey = (call: CallLike): string | null =>
  call.direction === 'incoming' && call.phase !== 'idle'
    ? callNotificationKey(call.callId, call.roomBareName || call.roomJid)
    : null;

const isRinging = (call: CallLike): boolean =>
  call.direction === 'incoming' && call.phase === 'ringing-incoming';

interface StoreLike {
  getState: () => { call: CallLike };
  subscribe: (listener: () => void) => () => void;
  dispatch: (action: any) => unknown;
}

export function startCallOutcomeSync(store: StoreLike): () => void {
  let previous = store.getState().call;

  const unsubscribeStore = store.subscribe(() => {
    const next = store.getState().call;
    const before = previous;
    previous = next;
    if (before === next || !isRinging(before)) return;
    const key = incomingCallKey(before);
    if (!key) return;
    const nextKey = incomingCallKey(next);
    if (isRinging(next) && nextKey === key) return;
    if (takeSilence(key)) return;
    const accepted =
      nextKey === key && (next.phase === 'connecting' || next.phase === 'in-call');
    broadcastCallOutcome(key, accepted ? 'accepted' : 'ended');
  });

  const unsubscribeChannel = subscribeCallOutcomes(({ key, outcome }) => {
    const call = store.getState().call;
    if (incomingCallKey(call) !== key) return;
    if (isRinging(call)) {
      silenceCallOutcome(key);
      store.dispatch(declineIncomingCall());
      return;
    }
    const connected = call.phase === 'connecting' || call.phase === 'in-call';
    if (outcome === 'accepted' && connected && !wonCallDecision(key)) {
      silenceCallOutcome(key);
      store.dispatch(declineIncomingCall());
    }
  });

  return () => {
    unsubscribeStore();
    unsubscribeChannel();
  };
}
