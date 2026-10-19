import { describe, expect, it, vi, beforeEach } from 'vitest';

const { httpMock, getStateMock } = vi.hoisted(() => ({
  httpMock: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
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
  getRooms,
  invalidateRoomsCache,
  patchMyChat,
} from './rooms.api';

describe('rooms.api patchMyChat', () => {
  beforeEach(() => {
    httpMock.get.mockReset();
    httpMock.patch.mockReset();
    invalidateRoomsCache();
  });

  it('PATCHes /v1/chats/my/{chatName} with the auth header and the partial body', async () => {
    httpMock.patch.mockResolvedValue({
      data: {
        ok: true,
        result: {
          chatName: 'app_room1',
          title: '',
          description: '',
          picture: 'https://cdn/x.png',
        },
      },
    });

    await patchMyChat('app_room1', { picture: 'https://cdn/x.png' });

    expect(httpMock.patch).toHaveBeenCalledWith(
      '/v1/chats/my/app_room1',
      { picture: 'https://cdn/x.png' },
      { headers: { Authorization: 'tok' } }
    );
  });

  it('sends only the fields present in the partial - a title+description patch does not touch picture', async () => {
    httpMock.patch.mockResolvedValue({ data: { ok: true, result: {} } });

    await patchMyChat('app_room1', {
      title: 'New title',
      description: 'New description',
    });

    expect(httpMock.patch).toHaveBeenCalledWith(
      '/v1/chats/my/app_room1',
      { title: 'New title', description: 'New description' },
      { headers: { Authorization: 'tok' } }
    );
  });

  it('clearing the avatar is `patchMyChat(name, { picture: "" })`', async () => {
    httpMock.patch.mockResolvedValue({ data: { ok: true, result: {} } });

    await patchMyChat('app_room1', { picture: '' });

    expect(httpMock.patch).toHaveBeenCalledWith(
      '/v1/chats/my/app_room1',
      { picture: '' },
      { headers: { Authorization: 'tok' } }
    );
  });

  it('encodes the chat name so a stray / in the identifier does not become a path segment', async () => {
    httpMock.patch.mockResolvedValue({ data: { ok: true, result: {} } });

    await patchMyChat('app/room?1', { picture: 'https://cdn/x.png' });

    expect(httpMock.patch).toHaveBeenCalledWith(
      '/v1/chats/my/app%2Froom%3F1',
      { picture: 'https://cdn/x.png' },
      { headers: { Authorization: 'tok' } }
    );
  });

  it('rethrows on backend errors so the caller can log / toast them', async () => {
    httpMock.patch.mockRejectedValue({
      response: { status: 403, data: { code: 'FORBIDDEN' } },
    });

    await expect(
      patchMyChat('app_room1', { picture: 'https://cdn/x.png' })
    ).rejects.toBeDefined();
  });

  // The next /chats/my call carries the fresh fields from Mongo, which is
  // what repaints the chat list after a reload. If the 60s rooms cache were
  // not invalidated here, the UI would re-serve its pre-update snapshot and
  // the change would appear "missing" until the TTL expired - which is close
  // to the original bug's symptom.
  it('invalidates the /chats/my cache so the next list fetch sees the new fields', async () => {
    httpMock.patch.mockResolvedValue({ data: { ok: true, result: {} } });

    // Prime the cache: first getRooms() hits the server, second one is served
    // from cache (no second GET).
    httpMock.get.mockResolvedValueOnce({
      data: { items: [{ name: 'app_room1', picture: '' }] },
    });
    await getRooms();
    await getRooms();
    expect(httpMock.get).toHaveBeenCalledTimes(1);

    await patchMyChat('app_room1', { picture: 'https://cdn/x.png' });

    httpMock.get.mockResolvedValueOnce({
      data: { items: [{ name: 'app_room1', picture: 'https://cdn/x.png' }] },
    });
    const result = await getRooms();
    expect(httpMock.get).toHaveBeenCalledTimes(2);
    expect(result.items[0].picture).toBe('https://cdn/x.png');
  });
});
