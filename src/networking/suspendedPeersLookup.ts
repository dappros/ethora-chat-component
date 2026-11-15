import type { Dispatch } from '@reduxjs/toolkit';
import { store } from '../roomStore';
import { postSuspendedStatus } from './api-requests/trustSafety.api';
import {
  chunk,
  selectStalePeerKeys,
  SUSPENDED_STATUS_MAX_BATCH,
  SUSPENDED_STATUS_TTL_MS,
  toPeerKey,
} from '../helpers/suspendedPeers';
import {
  markPeerSuspended,
  setPeerStatuses,
  type TrustSafetyState,
} from '../roomStore/trustSafetySlice';

/**
 * Batched lookups against POST /v2/users/suspended-status.
 *
 * Callers ask about names as they appear on screen (`request`, or `watch`
 * for as long as a component shows that account). Names are queued, the
 * queue is sent after a short quiet period (with a cap on how long it can
 * wait), at most 500 per call, and the answers go to
 * trustSafetySlice.peers. A name is not asked again for five minutes; a
 * watched name is asked again once its answer is older than that.
 *
 * Failures are ignored: nothing is marked, the name is left alone for a
 * minute, and the UI simply shows no badge. A backend without the route
 * (404 / 405 / 501) is not asked again in this session.
 * `config.disableSuspendedPeers: true` turns all of it off.
 */

interface StoreLike {
  dispatch: Dispatch;
  getState: () => unknown;
}

interface StateShape {
  trustSafety?: TrustSafetyState;
  chatSettingStore?: {
    config?: { disableSuspendedPeers?: boolean } | null;
    user?: { xmppUsername?: string; token?: string } | null;
  };
}

export interface SuspendedPeersLookupOptions {
  api: (xmppUsernames: string[]) => Promise<string[]>;
  /** Quiet period before a queued batch is sent. */
  debounceMs?: number;
  /** The longest a queued name waits, however busy the queue is. */
  maxWaitMs?: number;
  ttlMs?: number;
  /** A name whose lookup failed is left alone this long. */
  failureBackoffMs?: number;
  /** How often watched names are checked for an answer older than ttlMs. */
  recheckIntervalMs?: number;
  now?: () => number;
}

const UNSUPPORTED_STATUSES = new Set([404, 405, 501]);

const statusOf = (error: unknown): number | undefined =>
  (error as { response?: { status?: number } })?.response?.status;

export const createSuspendedPeersLookup = (
  getStore: () => StoreLike | null | undefined,
  options: SuspendedPeersLookupOptions
) => {
  const {
    api,
    debounceMs = 250,
    maxWaitMs = 1500,
    ttlMs = SUSPENDED_STATUS_TTL_MS,
    failureBackoffMs = 60 * 1000,
    recheckIntervalMs = 60 * 1000,
    now = () => Date.now(),
  } = options;

  const pending = new Set<string>();
  const inFlight = new Set<string>();
  const failedAt = new Map<string, number>();
  const watched = new Map<string, number>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let firstQueuedAt = 0;
  let recheckTimer: ReturnType<typeof setInterval> | null = null;
  let unsupported = false;
  let sessionKey = '';
  let running: Promise<void> = Promise.resolve();

  const state = (): StateShape | undefined => {
    try {
      return getStore()?.getState() as StateShape | undefined;
    } catch {
      return undefined;
    }
  };

  const clearQueue = () => {
    pending.clear();
    failedAt.clear();
    if (timer) clearTimeout(timer);
    timer = null;
    firstQueuedAt = 0;
  };

  // Another account signed in: nothing learned for the previous one counts.
  const syncSession = (current: StateShape | undefined) => {
    const key = current?.chatSettingStore?.user?.xmppUsername || '';
    if (key === sessionKey) return;
    sessionKey = key;
    clearQueue();
    unsupported = false;
  };

  const isEnabled = (current: StateShape | undefined) =>
    !unsupported &&
    current?.chatSettingStore?.config?.disableSuspendedPeers !== true &&
    Boolean(current?.chatSettingStore?.user?.xmppUsername);

  const flush = (): Promise<void> => {
    if (timer) clearTimeout(timer);
    timer = null;
    firstQueuedAt = 0;
    const names = [...pending];
    pending.clear();
    if (names.length === 0) return running;
    names.forEach((name) => inFlight.add(name));

    const work = async () => {
      for (const batch of chunk(names, SUSPENDED_STATUS_MAX_BATCH)) {
        try {
          const answer = await api(batch);
          const asked = new Set(batch);
          const suspended = answer
            .map((value) => toPeerKey(value))
            .filter((key) => asked.has(key));
          getStore()?.dispatch(
            setPeerStatuses({ checked: batch, suspended, checkedAt: now() })
          );
          batch.forEach((name) => failedAt.delete(name));
        } catch (error) {
          if (UNSUPPORTED_STATUSES.has(statusOf(error) ?? 0)) {
            unsupported = true;
          }
          const at = now();
          batch.forEach((name) => failedAt.set(name, at));
        } finally {
          batch.forEach((name) => inFlight.delete(name));
        }
      }
    };
    running = running.then(work, work);
    return running;
  };

  const schedule = () => {
    const at = now();
    if (!firstQueuedAt) firstQueuedAt = at;
    const waited = at - firstQueuedAt;
    const delay = Math.max(0, Math.min(debounceMs, maxWaitMs - waited));
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      void flush();
    }, delay);
  };

  /** Queue the names that have no fresh answer. */
  const request = (values: Iterable<unknown>) => {
    const current = state();
    syncSession(current);
    if (!isEnabled(current)) return;

    const me = toPeerKey(current?.chatSettingStore?.user?.xmppUsername || '');
    const at = now();
    const candidates: string[] = [];
    for (const value of values) {
      const key = toPeerKey(value);
      if (!key || key === me || pending.has(key) || inFlight.has(key)) continue;
      const failed = failedAt.get(key);
      if (failed !== undefined && at - failed < failureBackoffMs) continue;
      candidates.push(key);
    }
    const stale = selectStalePeerKeys(
      [...new Set(candidates)],
      current?.trustSafety?.peers,
      at,
      ttlMs
    );
    if (stale.length === 0) return;
    stale.forEach((key) => pending.add(key));
    schedule();
  };

  const recheck = () => request(watched.keys());

  const syncRecheckTimer = () => {
    if (watched.size > 0 && !recheckTimer) {
      recheckTimer = setInterval(recheck, recheckIntervalMs);
    } else if (watched.size === 0 && recheckTimer) {
      clearInterval(recheckTimer);
      recheckTimer = null;
    }
  };

  /**
   * Keep an account's status current while it is on screen. Returns the
   * function that stops watching it.
   */
  const watch = (value: unknown): (() => void) => {
    const key = toPeerKey(value);
    if (!key) return () => {};
    watched.set(key, (watched.get(key) ?? 0) + 1);
    syncRecheckTimer();
    request([key]);
    let done = false;
    return () => {
      if (done) return;
      done = true;
      const count = (watched.get(key) ?? 1) - 1;
      if (count <= 0) watched.delete(key);
      else watched.set(key, count);
      syncRecheckTimer();
    };
  };

  /** A bounce or a PEER_SUSPENDED refusal said so. */
  const markSuspended = (value: unknown) => {
    const key = toPeerKey(value);
    if (!key) return;
    getStore()?.dispatch(markPeerSuspended({ xmppUsername: key, at: now() }));
  };

  const reset = () => {
    clearQueue();
    inFlight.clear();
    watched.clear();
    if (recheckTimer) clearInterval(recheckTimer);
    recheckTimer = null;
    unsupported = false;
    sessionKey = '';
    running = Promise.resolve();
  };

  return { request, watch, flush, recheck, markSuspended, reset };
};

export type SuspendedPeersLookup = ReturnType<
  typeof createSuspendedPeersLookup
>;

// The app-wide instance, bound to the chat store and the API client.
export const suspendedPeersLookup = createSuspendedPeersLookup(() => store, {
  api: postSuspendedStatus,
});

/** Ask about these names soon (they are on screen now). */
export const requestSuspendedStatus = (values: Iterable<unknown>) =>
  suspendedPeersLookup.request(values);

/** Keep one account's status current until the returned function runs. */
export const watchSuspendedStatus = (value: unknown): (() => void) =>
  suspendedPeersLookup.watch(value);

/** Record a suspension the server just reported (bounce or 409). */
export const markPeerSuspendedNow = (value: unknown) =>
  suspendedPeersLookup.markSuspended(value);
