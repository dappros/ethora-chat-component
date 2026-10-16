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

import { leaveRoom, invalidateRoomsCache } from './rooms.api';

describe('rooms.api leave', () => {
  beforeEach(() => {
    httpMock.put.mockReset();
    invalidateRoomsCache();
  });

  it('leaveRoom PUTs /v1/chats/my/{chatName}/leave with the auth header and returns the result', async () => {
    httpMock.put.mockResolvedValue({
      data: { ok: true, result: { chatName: 'app1_a-app1_b', left: true } },
    });

    const result = await leaveRoom('app1_a-app1_b');

    expect(httpMock.put).toHaveBeenCalledWith(
      '/v1/chats/my/app1_a-app1_b/leave',
      {},
      { headers: { Authorization: 'tok' } }
    );
    expect(result).toEqual({ chatName: 'app1_a-app1_b', left: true });
  });

  it('leaveRoom throws when the request fails (e.g. 404 on a backend without leave support)', async () => {
    httpMock.put.mockRejectedValue({ response: { status: 404 } });
    await expect(leaveRoom('app1_a-app1_b')).rejects.toThrow();
  });
});
