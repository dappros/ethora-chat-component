/**
 * pushSubscriptionSweep.ts
 *
 * Pure, hook-free worker pool for usePushNotifications' per-room push
 * subscription sweep. Kept in its own module (no React, no Firebase, no
 * Redux imports) so it can be unit tested without pulling in the heavy
 * side effects those modules carry at import time.
 */

export type PushSubscribeResult = {
  ok: boolean;
  reason?: string;
  message?: string;
};

export type PushSweepGuards = {
  getStatus: (jid: string) => string | undefined;
  getRetryAt: (jid: string) => number | undefined;
  isInFlight: (jid: string) => boolean;
  markInFlight: (jid: string) => void;
  clearInFlight: (jid: string) => void;
  setStatus: (jid: string, status: string) => void;
  subscribe: (jid: string) => Promise<PushSubscribeResult>;
  onSubscribed?: (jid: string) => void;
  onFailed?: (jid: string, message?: string) => void;
};

/** Number of rooms subscribed to push in parallel during a sweep. */
export const PUSH_SWEEP_CONCURRENCY = 4;

/**
 * Sweeps `roomJIDs` for push subscription, previously a strictly serial
 * for-loop with a fixed 100ms sleep between every room (so N rooms took at
 * least N*100ms even though subscribing does not depend on room order).
 * This runs a small worker pool instead, bounded by `concurrency`, while
 * keeping every existing guard intact: status checks (subscribed / pending
 * / blocked / error are skipped), the roomRetryAtRef backoff, and the
 * roomSubscribeInFlightRef in-flight lock. The caller owns the
 * roomProcessRunningRef / lastRoomsHashRef gates around the whole sweep.
 *
 * `roomJIDs` are processed by a fixed-size pool of workers pulling from a
 * shared index, so at most `concurrency` subscribe calls are in flight at
 * once regardless of how many rooms need syncing.
 */
export const sweepPushSubscriptions = async (
  roomJIDs: string[],
  guards: PushSweepGuards,
  concurrency: number = PUSH_SWEEP_CONCURRENCY
): Promise<void> => {
  let nextIndex = 0;

  const worker = async () => {
    while (nextIndex < roomJIDs.length) {
      const roomJID = roomJIDs[nextIndex++];
      const currentStatus = guards.getStatus(roomJID);

      if (
        currentStatus === 'subscribed' ||
        currentStatus === 'pending' ||
        currentStatus === 'blocked' ||
        currentStatus === 'error'
      ) {
        continue;
      }

      const retryAt = guards.getRetryAt(roomJID);
      if (retryAt && retryAt > Date.now()) {
        continue;
      }

      if (guards.isInFlight(roomJID)) {
        continue;
      }

      guards.markInFlight(roomJID);
      guards.setStatus(roomJID, 'pending');

      try {
        const result = await guards.subscribe(roomJID);
        if (result.ok === true) {
          guards.setStatus(roomJID, 'subscribed');
          guards.onSubscribed?.(roomJID);
        } else {
          const status = result.reason === 'forbidden' ? 'blocked' : 'error';
          guards.setStatus(roomJID, status);
          guards.onFailed?.(roomJID, result.message);
        }
      } catch (error) {
        guards.setStatus(roomJID, 'error');
        guards.onFailed?.(
          roomJID,
          error instanceof Error ? error.message : String(error)
        );
      } finally {
        guards.clearInFlight(roomJID);
      }
    }
  };

  const poolSize = Math.max(1, Math.min(concurrency, roomJIDs.length));
  await Promise.all(Array.from({ length: poolSize }, () => worker()));
};
