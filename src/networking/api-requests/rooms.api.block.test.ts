import { describe, expect, it, vi, beforeEach } from 'vitest';

const { httpMock, getStateMock } = vi.hoisted(() => ({
  httpMock: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
  getStateMock: vi.fn(() => ({
    chatSettingStore: { user: { token: 'tok' } },
  })),
}));
vi.mock('../apiClient', () => ({ default: httpMock }));
vi.mock('../../roomStore', () => ({
  store: { getState: () => getStateMock() },
}));

import {
  blockUser,
  unblockUser,
  getBlockedUsers,
  invalidateRoomsCache,
} from './rooms.api';

describe('rooms.api block/unblock/list', () => {
  beforeEach(() => {
    httpMock.get.mockReset();
    httpMock.post.mockReset();
    httpMock.delete.mockReset();
    invalidateRoomsCache();
  });

  it('blockUser POSTs /v1/chats/blocked with the peer and auth header', async () => {
    httpMock.post.mockResolvedValue({
      data: { ok: true, result: { user: 'app_peer', blocked: true } },
    });

    const result = await blockUser('app_peer');

    expect(httpMock.post).toHaveBeenCalledWith(
      '/v1/chats/blocked',
      { user: 'app_peer' },
      { headers: { Authorization: 'tok' } }
    );
    expect(result).toEqual({ user: 'app_peer', blocked: true });
  });

  it('unblockUser DELETEs /v1/chats/blocked/{peer} (url-encoded) with the auth header', async () => {
    httpMock.delete.mockResolvedValue({
      data: { ok: true, result: { user: 'app_peer', blocked: false } },
    });

    const result = await unblockUser('app_peer');

    expect(httpMock.delete).toHaveBeenCalledWith('/v1/chats/blocked/app_peer', {
      headers: { Authorization: 'tok' },
    });
    expect(result).toEqual({ user: 'app_peer', blocked: false });
  });

  it('getBlockedUsers GETs /v1/chats/blocked and returns items (or [] when absent)', async () => {
    httpMock.get.mockResolvedValue({
      data: { ok: true, items: [{ _id: 'p1', xmppUsername: 'app_p1' }] },
    });

    const items = await getBlockedUsers();

    expect(httpMock.get).toHaveBeenCalledWith('/v1/chats/blocked', {
      headers: { Authorization: 'tok' },
    });
    expect(items).toEqual([{ _id: 'p1', xmppUsername: 'app_p1' }]);
  });

  it('getBlockedUsers returns [] when the backend omits items', async () => {
    httpMock.get.mockResolvedValue({ data: { ok: true } });
    expect(await getBlockedUsers()).toEqual([]);
  });

  it('blockUser throws on failure (e.g. 404 on a backend without the route)', async () => {
    httpMock.post.mockRejectedValue({ response: { status: 404 } });
    await expect(blockUser('app_peer')).rejects.toThrow();
  });

  it('unblockUser throws on failure', async () => {
    httpMock.delete.mockRejectedValue(new Error('network'));
    await expect(unblockUser('app_peer')).rejects.toThrow();
  });
});
