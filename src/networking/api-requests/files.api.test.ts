import { describe, expect, it, vi, beforeEach } from 'vitest';

const getMock = vi.fn();
const deleteMock = vi.fn();

vi.mock('../apiClient', () => ({
  default: {
    get: (...args: unknown[]) => getMock(...args),
    delete: (...args: unknown[]) => deleteMock(...args),
  },
  appToken: 'app-token',
}));

const getStateMock = vi.fn(() => ({
  chatSettingStore: { user: { token: 'tok' } },
}));
vi.mock('../../roomStore', () => ({
  store: { getState: () => getStateMock() },
}));

import { getMyFiles, deleteMyFile } from './files.api';

describe('files.api - getMyFiles envelope normalization', () => {
  beforeEach(() => {
    getMock.mockReset();
    deleteMock.mockReset();
    getStateMock.mockReturnValue({
      chatSettingStore: { user: { token: 'tok' } },
    });
  });

  it('normalizes the v2 pagination envelope into a flat shape', async () => {
    getMock.mockResolvedValue({
      data: {
        success: true,
        results: [{ _id: '1', originalname: 'a.png' }],
        items: [{ _id: '1', originalname: 'a.png' }],
        pagination: { limit: 50, offset: 0, total: 3 },
        limit: 50,
        offset: 0,
        total: 3,
      },
    });

    const result = await getMyFiles({ limit: 50, offset: 0 });

    expect(result).toEqual({
      items: [{ _id: '1', originalname: 'a.png' }],
      total: 3,
      limit: 50,
      offset: 0,
    });
    expect(getMock).toHaveBeenCalledWith(
      '/v2/files',
      expect.objectContaining({
        headers: { Authorization: 'tok' },
        params: { limit: 50, offset: 0 },
      })
    );
  });

  it('falls back to items.length as total when pagination is missing', async () => {
    getMock.mockResolvedValue({
      data: { items: [{ _id: '1' }, { _id: '2' }] },
    });

    const result = await getMyFiles({ limit: 50, offset: 0 });

    expect(result.total).toBe(2);
    expect(result.items).toHaveLength(2);
  });

  it('dedupes concurrent identical requests (same token+limit+offset)', async () => {
    let resolveRequest: (value: unknown) => void = () => {};
    getMock.mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve;
      })
    );

    const first = getMyFiles({ limit: 50, offset: 0 });
    const second = getMyFiles({ limit: 50, offset: 0 });

    resolveRequest({
      data: { items: [{ _id: '1' }], pagination: { limit: 50, offset: 0, total: 1 } },
    });

    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(getMock).toHaveBeenCalledTimes(1);
    expect(firstResult).toEqual(secondResult);
  });

  it('does not dedupe requests for a different page', async () => {
    getMock
      .mockResolvedValueOnce({
        data: { items: [{ _id: '1' }], pagination: { limit: 50, offset: 0, total: 2 } },
      })
      .mockResolvedValueOnce({
        data: { items: [{ _id: '2' }], pagination: { limit: 50, offset: 50, total: 2 } },
      });

    await getMyFiles({ limit: 50, offset: 0 });
    await getMyFiles({ limit: 50, offset: 50 });

    expect(getMock).toHaveBeenCalledTimes(2);
  });
});

describe('files.api - deleteMyFile', () => {
  beforeEach(() => {
    deleteMock.mockReset();
  });

  it('sends the auth token and hits /v2/files/:id', async () => {
    deleteMock.mockResolvedValue({ data: { success: true } });

    await deleteMyFile('abc123');

    expect(deleteMock).toHaveBeenCalledWith('/v2/files/abc123', {
      headers: { Authorization: 'tok' },
    });
  });
});
