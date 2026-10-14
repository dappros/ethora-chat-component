import { beforeEach, describe, expect, it, vi } from 'vitest';

const refreshAuthTokens = vi.fn();
let fileToken = 'tok-1';

vi.mock('../roomStore', () => ({
  store: {
    getState: () => ({
      chatSettingStore: {
        user: { fileToken },
        config: { refreshTokens: { enabled: true } },
      },
    }),
  },
}));
vi.mock('../networking/authRefresh', () => ({
  refreshAuthTokens: (...args: unknown[]) => refreshAuthTokens(...args),
  hasRotatableSession: () => true,
}));

import {
  requestFileTokenRecovery,
  resetFileTokenRecovery,
} from './secureFileUrl';

describe('requestFileTokenRecovery', () => {
  beforeEach(() => {
    resetFileTokenRecovery();
    refreshAuthTokens.mockReset();
    fileToken = 'tok-1';
  });

  it('shares one refresh between every broken image of the same token', async () => {
    refreshAuthTokens.mockResolvedValue({ fileToken: 'tok-2' });
    const results = await Promise.all(
      Array.from({ length: 10 }, () => requestFileTokenRecovery())
    );
    expect(results.every(Boolean)).toBe(true);
    expect(refreshAuthTokens).toHaveBeenCalledTimes(1);
  });

  it('answers at once, without a request, for the token it already tried', async () => {
    refreshAuthTokens.mockResolvedValue({});
    expect(await requestFileTokenRecovery()).toBe(false);
    expect(await requestFileTokenRecovery()).toBe(false);
    expect(await requestFileTokenRecovery()).toBe(false);
    expect(refreshAuthTokens).toHaveBeenCalledTimes(1);
  });

  it('lets a manual retry through', async () => {
    refreshAuthTokens.mockResolvedValue({});
    await requestFileTokenRecovery();
    await requestFileTokenRecovery({ force: true });
    expect(refreshAuthTokens).toHaveBeenCalledTimes(2);
  });
});
