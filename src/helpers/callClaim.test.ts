import { afterEach, describe, expect, it } from 'vitest';
import {
  claimCallDecision,
  resetCallClaims,
  runIfCallClaimed,
  wonCallDecision,
} from './callClaim';

// Exclusive locks the way navigator.locks hands them out with ifAvailable,
// shared by every "tab" of one test.
const installLocks = () => {
  const held = new Set<string>();
  (navigator as any).locks = {
    request: (name: string, _o: unknown, cb: (lock: unknown) => Promise<void> | undefined) => {
      if (held.has(name)) return Promise.resolve(cb(null));
      held.add(name);
      return Promise.resolve(cb({ name }));
    },
  };
};

describe('callClaim', () => {
  afterEach(() => {
    delete (navigator as any).locks;
    resetCallClaims();
  });

  it('without Web Locks the claim is a plain true and counts as won', () => {
    expect(claimCallDecision('c-1')).toBe(true);
    expect(wonCallDecision('c-1')).toBe(true);
  });

  it('gives the claim to one tab only, for accept and decline alike', async () => {
    installLocks();
    expect(await claimCallDecision('c-1')).toBe(true);
    expect(wonCallDecision('c-1')).toBe(true);
    resetCallClaims(); // a second tab keeps its own record
    expect(await claimCallDecision('c-1')).toBe(false);
    expect(wonCallDecision('c-1')).toBe(false);
    // another call is a different claim
    expect(await claimCallDecision('c-2')).toBe(true);
  });

  it('runIfCallClaimed runs for the winner and skips the loser', async () => {
    installLocks();
    const winner: string[] = [];
    const loser: string[] = [];
    runIfCallClaimed('c-1', () => winner.push('accept'));
    resetCallClaims();
    runIfCallClaimed('c-1', () => loser.push('decline'));
    await new Promise((r) => setTimeout(r, 0));
    expect(winner).toEqual(['accept']);
    expect(loser).toEqual([]);
  });

  it('runs at once (synchronously) without Web Locks, and when there is no key', () => {
    const ran: string[] = [];
    runIfCallClaimed('c-1', () => ran.push('a'));
    runIfCallClaimed(null, () => ran.push('b'));
    expect(ran).toEqual(['a', 'b']);
  });
});
