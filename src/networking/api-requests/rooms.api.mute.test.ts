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

import { muteRoom, unmuteRoom } from './rooms.api';

describe('rooms.api mute/unmute', () => {
  beforeEach(() => {
    httpMock.put.mockReset();
    httpMock.delete.mockReset();
  });

  it('muteRoom PUTs /v1/chats/my/{chatName}/mute with the auth header and returns the result', async () => {
    httpMock.put.mockResolvedValue({
      data: { ok: true, result: { chatName: 'app_room1', muted: true } },
    });

    const result = await muteRoom('app_room1');

    expect(httpMock.put).toHaveBeenCalledWith(
      '/v1/chats/my/app_room1/mute',
      {},
      { headers: { Authorization: 'tok' } }
    );
    expect(result).toEqual({ chatName: 'app_room1', muted: true });
  });

  it('unmuteRoom DELETEs /v1/chats/my/{chatName}/mute with the auth header', async () => {
    httpMock.delete.mockResolvedValue({
      data: { ok: true, result: { chatName: 'app_room1', muted: false } },
    });

    const result = await unmuteRoom('app_room1');

    expect(httpMock.delete).toHaveBeenCalledWith('/v1/chats/my/app_room1/mute', {
      headers: { Authorization: 'tok' },
    });
    expect(result).toEqual({ chatName: 'app_room1', muted: false });
  });

  it('muteRoom throws when the request fails (e.g. 404 on a backend without mute support)', async () => {
    httpMock.put.mockRejectedValue({
      response: { status: 404, data: { code: 'CHAT_MEMBERSHIP_NOT_FOUND' } },
    });

    await expect(muteRoom('app_room1')).rejects.toThrow();
  });

  it('unmuteRoom throws when the request fails', async () => {
    httpMock.delete.mockRejectedValue(new Error('network'));

    await expect(unmuteRoom('app_room1')).rejects.toThrow();
  });
});
