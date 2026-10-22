// One decision per call across the tabs of an origin. Accepting and declining a
// ring both take the same per-call claim (a Web Lock), whether the click comes
// from a notification action (the push path) or from the ring screen (the
// overlay). Without it two tabs could both accept the same call and connect
// LiveKit twice with one identity. A tab that does not get the claim does
// nothing: the winner announces the outcome and the loser's ring ends quietly.

import { claimOnce } from '../utils/webLock';

const WON_TTL_MS = 2 * 60_000;
const won = new Map<string, number>();

const prune = (now: number) => {
  won.forEach((ts, key) => {
    if (now - ts > WON_TTL_MS) won.delete(key);
  });
};

/** Records that this tab took the decision for the call (see wonCallDecision). */
export const rememberCallDecision = (key: string | null | undefined): void => {
  if (!key) return;
  const now = Date.now();
  prune(now);
  won.set(key, now);
};

/** True when this tab took the accept or decline for `key` itself. */
export const wonCallDecision = (key: string | null | undefined): boolean => {
  if (!key) return false;
  const ts = won.get(key);
  return ts !== undefined && Date.now() - ts <= WON_TTL_MS;
};

export const resetCallClaims = (): void => won.clear();

/**
 * Takes the per-call claim for accepting or declining `key`. A plain boolean
 * without Web Locks (nothing to yield for), otherwise a promise. Both actions
 * share the one lock, so an Accept here and a Decline in another tab cannot
 * both go through either.
 */
export const claimCallDecision = (key: string): boolean | Promise<boolean> => {
  const claim = claimOnce(`ethora-call-decision:${key}`);
  if (typeof claim === 'boolean') {
    if (claim) rememberCallDecision(key);
    return claim;
  }
  return claim.then((ok) => {
    if (ok) rememberCallDecision(key);
    return ok;
  });
};

/**
 * Runs `run` when this tab gets the claim, and not at all when another tab
 * has it. Synchronous when the claim is (no Web Locks).
 */
export const runIfCallClaimed = (
  key: string | null | undefined,
  run: () => void
): void => {
  if (!key) {
    run();
    return;
  }
  const claim = claimCallDecision(key);
  if (typeof claim === 'boolean') {
    if (claim) run();
    return;
  }
  void claim.then((ok) => {
    if (ok) run();
  });
};
