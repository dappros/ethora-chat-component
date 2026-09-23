import { describe, expect, it, vi, beforeEach } from 'vitest';

const httpGetMock = vi.fn();
vi.mock('../apiClient', () => ({
  default: { get: (...args: unknown[]) => httpGetMock(...args) },
}));

const getStateMock = vi.fn(() => ({
  chatSettingStore: { appId: 'app1' },
}));
vi.mock('../../roomStore', () => ({
  store: { getState: () => getStateMock() },
}));

import { getUserByXmppUsername } from './roomMembers.api';

// Regression for the bug where user X permanently saw a brand-new user Y's
// raw xmpp id as their display name for the rest of the session: this
// module caches ANY lookup failure (404, 400, network) as a permanent
// `null`, and a just-registered account's profile can legitimately fail to
// resolve for a little while (backend indexing lag) before it starts
// succeeding. A `null` cached forever meant every later message from that
// same sender kept hitting the cached miss instead of retrying - only a
// full page reload (fresh module state) ever cleared it.
describe('getUserByXmppUsername', () => {
  beforeEach(() => {
    httpGetMock.mockReset();
    getStateMock.mockReset();
    getStateMock.mockReturnValue({ chatSettingStore: { appId: 'app1' } });
  });

  it('a failed lookup does not poison the cache - a later call for the same user retries', async () => {
    httpGetMock.mockRejectedValueOnce({
      response: { status: 400 },
      message: 'Request failed with status code 400',
    });

    const first = await getUserByXmppUsername('app1_newuser', 'token');
    expect(first).toBeNull();

    httpGetMock.mockResolvedValueOnce({
      data: { result: { xmppUsername: 'app1_newuser', firstName: 'New', lastName: 'User' } },
    });

    const second = await getUserByXmppUsername('app1_newuser', 'token');
    expect(second).toEqual({
      xmppUsername: 'app1_newuser',
      firstName: 'New',
      lastName: 'User',
    });
    expect(httpGetMock).toHaveBeenCalledTimes(2);
  });

  it('a successful lookup is still cached (no repeat request for the same user)', async () => {
    httpGetMock.mockResolvedValue({
      data: { result: { xmppUsername: 'app1_alice', firstName: 'Alice', lastName: 'Doe' } },
    });

    await getUserByXmppUsername('app1_alice', 'token');
    await getUserByXmppUsername('app1_alice', 'token');

    expect(httpGetMock).toHaveBeenCalledTimes(1);
  });

  it('concurrent lookups for the same user in flight share one request', async () => {
    let resolveRequest: (value: unknown) => void = () => {};
    httpGetMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRequest = resolve;
      })
    );

    const first = getUserByXmppUsername('app1_bob', 'token');
    const second = getUserByXmppUsername('app1_bob', 'token');

    resolveRequest({
      data: { result: { xmppUsername: 'app1_bob', firstName: 'Bob', lastName: 'Ross' } },
    });

    expect(await first).toEqual(await second);
    expect(httpGetMock).toHaveBeenCalledTimes(1);
  });

  it('returns null without a network call for an empty/undefined username', async () => {
    expect(await getUserByXmppUsername('', 'token')).toBeNull();
    expect(await getUserByXmppUsername(undefined, 'token')).toBeNull();
    expect(httpGetMock).not.toHaveBeenCalled();
  });
});
