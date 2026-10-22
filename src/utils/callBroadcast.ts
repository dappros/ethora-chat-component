// Tabs of one origin tell each other how an incoming call ended, so a tab that
// was ringing for it (typically a hidden one) ends its ring quietly instead of
// ringing on until the token runs out and then reporting a "Missed call" for a
// call that was answered or declined in another tab.
//
// Not every tab has BroadcastChannel (older browsers, some embedded webviews),
// so each outcome goes out twice: on the channel and as a localStorage write
// (the `storage` event fires in every OTHER tab of the origin, whatever it
// supports). A tab hears both and acts on the first. The value carries call
// keys only.

import { markCallHandled } from './handledCalls';

export type CallOutcome = 'accepted' | 'declined' | 'ended';

export interface CallOutcomeMessage {
  /** callNotificationKey of the call: its callId, or room:<room>. */
  key: string;
  outcome: CallOutcome;
}

const CHANNEL_NAME = 'ethora-call';
export const CALL_OUTCOME_STORAGE_KEY = '@ethora/chat-component:callOutcome';
const senderId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

let channel: BroadcastChannel | null | undefined;

const getChannel = (): BroadcastChannel | null => {
  if (channel !== undefined) return channel;
  try {
    channel =
      typeof BroadcastChannel === 'function'
        ? new BroadcastChannel(CHANNEL_NAME)
        : null;
    // Node (tests) would otherwise keep the process alive for an open channel.
    (channel as any)?.unref?.();
  } catch {
    channel = null;
  }
  return channel;
};

const storageFallback = (): Storage | null => {
  try {
    return typeof window !== 'undefined' && window.localStorage
      ? window.localStorage
      : null;
  } catch {
    return null;
  }
};

let sendSeq = 0;

export const broadcastCallOutcome = (
  key: string | null | undefined,
  outcome: CallOutcome
): void => {
  if (!key) return;
  // Whatever ends a ring, a late push or replay for it must not raise it again.
  markCallHandled(key);
  // The sequence number makes every write a new value, so the storage event
  // fires even for a repeated outcome of the same call, and lets a receiver
  // that hears both routes act once.
  const message = { key, outcome, from: senderId, at: Date.now(), n: (sendSeq += 1) };
  try {
    getChannel()?.postMessage(message);
  } catch {
    // A closed channel or a non-cloneable value: the storage route remains.
  }
  try {
    storageFallback()?.setItem(CALL_OUTCOME_STORAGE_KEY, JSON.stringify(message));
  } catch {
    // Storage blocked: with no channel either, other tabs just ring on.
  }
};

/** Calls `callback` for an outcome another tab announced. Returns the unsubscribe. */
export const subscribeCallOutcomes = (
  callback: (message: CallOutcomeMessage) => void
): (() => void) => {
  const seen = new Set<string>();
  const deliver = (data: any) => {
    if (!data || typeof data.key !== 'string' || !data.key) return;
    if (data.from === senderId) return;
    if (data.n !== undefined) {
      const id = `${data.from}:${data.n}`;
      if (seen.has(id)) return;
      seen.add(id);
      if (seen.size > 100) seen.delete(seen.values().next().value as string);
    }
    markCallHandled(data.key);
    callback({ key: data.key, outcome: data.outcome });
  };
  const cleanups: Array<() => void> = [];
  const target = getChannel();
  if (target) {
    const listener = (event: MessageEvent) => deliver(event?.data);
    target.addEventListener('message', listener);
    cleanups.push(() => target.removeEventListener('message', listener));
  }
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== CALL_OUTCOME_STORAGE_KEY || !event.newValue) return;
      try {
        deliver(JSON.parse(event.newValue));
      } catch {
        // not ours / not JSON
      }
    };
    window.addEventListener('storage', onStorage);
    cleanups.push(() => window.removeEventListener('storage', onStorage));
  }
  return () => cleanups.forEach((cleanup) => cleanup());
};

/** Test hook: forget the cached channel so a stubbed BroadcastChannel is picked up. */
export const resetCallBroadcastForTests = (): void => {
  try {
    channel?.close();
  } catch {
    // already closed
  }
  channel = undefined;
};
