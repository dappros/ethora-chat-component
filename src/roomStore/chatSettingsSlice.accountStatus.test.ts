import { describe, expect, it, vi } from 'vitest';

// The reducers write the session to storage; that is not what is tested.
vi.mock('../helpers/authStorage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../helpers/authStorage')>()),
  persistUserSession: vi.fn(),
  clearStoredUser: vi.fn(),
}));

import reducer, {
  clearAccountBlocked,
  logout,
  setAccountBlocked,
  setUser,
} from './chatSettingsSlice';
import type { AccountBlockedInfo } from '../helpers/accountBlocked';

const SUSPENDED: AccountBlockedInfo = {
  blocked: 'suspended',
  code: 'USER_SUSPENDED',
  suspension: {
    reasonCode: 'terms_violation',
    message: null,
    suspendedAt: '2026-11-01T10:00:00.000Z',
    until: null,
    supportContact: 'support@example.com',
  },
};

const ARCHIVED: AccountBlockedInfo = {
  blocked: 'archived',
  code: 'USER_ARCHIVED',
};

const user = (xmppUsername: string) =>
  ({ xmppUsername, xmppPassword: 'pw', token: 't', refreshToken: 'r' }) as any;

const signedInAs = (name: string) =>
  reducer(undefined, setUser(user(name)));

describe('chatSettingsSlice accountStatus', () => {
  it('starts with no block', () => {
    expect(reducer(undefined, { type: '@@init' }).accountStatus).toBeNull();
  });

  it('records the block for the signed-in user', () => {
    const state = reducer(signedInAs('app_alice'), setAccountBlocked(SUSPENDED));
    expect(state.accountStatus).toEqual({ ...SUSPENDED, userKey: 'app_alice' });
  });

  it('keeps the first identity when the block is reported again', () => {
    let state = reducer(signedInAs('app_alice'), setAccountBlocked(SUSPENDED));
    state = reducer(state, setAccountBlocked(ARCHIVED));
    expect(state.accountStatus).toEqual({ ...ARCHIVED, userKey: 'app_alice' });
  });

  it('keeps the block when the same user is set again', () => {
    let state = reducer(signedInAs('app_alice'), setAccountBlocked(SUSPENDED));
    state = reducer(state, setUser(user('app_alice')));
    expect(state.accountStatus?.blocked).toBe('suspended');
  });

  it('drops the block when a different user signs in', () => {
    let state = reducer(signedInAs('app_alice'), setAccountBlocked(SUSPENDED));
    state = reducer(state, setUser(user('app_bob')));
    expect(state.accountStatus).toBeNull();
    expect(state.user.xmppUsername).toBe('app_bob');
  });

  it('gives a block learned before sign-in to the next user that arrives', () => {
    let state = reducer(undefined, setAccountBlocked(SUSPENDED));
    expect(state.accountStatus?.userKey).toBe('');
    state = reducer(state, setUser(user('app_alice')));
    expect(state.accountStatus).toEqual({ ...SUSPENDED, userKey: 'app_alice' });
  });

  it('is cleared by logout and by clearAccountBlocked', () => {
    const blocked = reducer(signedInAs('app_alice'), setAccountBlocked(SUSPENDED));
    expect(reducer(blocked, logout()).accountStatus).toBeNull();
    expect(reducer(blocked, clearAccountBlocked()).accountStatus).toBeNull();
  });
});
