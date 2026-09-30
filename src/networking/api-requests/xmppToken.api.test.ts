import { beforeEach, describe, expect, it, vi } from 'vitest';

const post = vi.fn();
vi.mock('../apiClient', () => ({ default: { post: (...a: unknown[]) => post(...a) } }));

const dispatch = vi.fn();
const state = { chatSettingStore: { user: { token: 'jwt-abc' } } };
vi.mock('../../roomStore', () => ({
  store: { getState: () => state, dispatch: (...a: unknown[]) => dispatch(...a) },
}));

import { fetchFreshXmppPassword } from './xmppToken.api';

describe('fetchFreshXmppPassword', () => {
  beforeEach(() => {
    post.mockReset();
    dispatch.mockReset();
    state.chatSettingStore.user.token = 'jwt-abc';
  });

  it('POSTs with the session token and stores what comes back', async () => {
    post.mockResolvedValue({ data: { success: true, xmppPassword: 'fresh-xmpp' } });

    await expect(fetchFreshXmppPassword()).resolves.toBe('fresh-xmpp');
    expect(post).toHaveBeenCalledWith(
      '/v1/users/xmpp-token',
      {},
      { headers: { Authorization: 'jwt-abc' } }
    );
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ payload: 'fresh-xmpp' })
    );
  });

  it('never throws: a failed request is null, not a dead session', async () => {
    post.mockRejectedValue(new Error('network'));
    await expect(fetchFreshXmppPassword()).resolves.toBeNull();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('does not call the server without a session token', async () => {
    state.chatSettingStore.user.token = '';
    await expect(fetchFreshXmppPassword()).resolves.toBeNull();
    expect(post).not.toHaveBeenCalled();
  });

  it('shares one request between concurrent reconnect paths', async () => {
    let resolve!: (v: unknown) => void;
    post.mockReturnValue(new Promise((r) => (resolve = r)));

    const a = fetchFreshXmppPassword();
    const b = fetchFreshXmppPassword();
    resolve({ data: { xmppPassword: 'once' } });

    await expect(Promise.all([a, b])).resolves.toEqual(['once', 'once']);
    expect(post).toHaveBeenCalledTimes(1);
  });
});
