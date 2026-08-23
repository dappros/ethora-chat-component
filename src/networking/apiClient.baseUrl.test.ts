/**
 * baseUrl no longer carries the API version.
 *
 * The file endpoints moved to `/v2/files/secure` while everything else
 * stayed on v1, so the version had to move out of the base URL and onto
 * each path. Hosts wired against the older docs still pass
 * `https://api.chat.ethora.com/v1`, which now silently yields
 * `/v1/v1/users/...`, so the client normalises it away.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../roomStore', () => ({
  store: {
    getState: () => ({ chatSettingStore: { config: {}, user: {} } }),
    dispatch: vi.fn(),
  },
}));

vi.mock('./authRefresh', () => ({
  refreshAuthTokens: vi.fn(),
  isRefreshFatalError: () => false,
  hasRotatableSession: () => false,
}));

import http, { setBaseURL } from './apiClient';

describe('setBaseURL strips a trailing API version', () => {
  beforeEach(() => {
    setBaseURL('https://api.chat.ethora.com');
  });

  it('drops a trailing /v1 so paths do not double up', () => {
    setBaseURL('https://api.chat.ethora.com/v1');
    expect(http.defaults.baseURL).toBe('https://api.chat.ethora.com');
  });

  it('drops a trailing /v2 as well', () => {
    setBaseURL('https://api.chat.ethora.com/v2');
    expect(http.defaults.baseURL).toBe('https://api.chat.ethora.com');
  });

  it('tolerates a trailing slash after the version', () => {
    setBaseURL('https://api.chat.ethora.com/v1/');
    expect(http.defaults.baseURL).toBe('https://api.chat.ethora.com');
  });

  it('leaves an already-clean base URL alone', () => {
    setBaseURL('https://api.chat.ethora.com');
    expect(http.defaults.baseURL).toBe('https://api.chat.ethora.com');
  });

  it('does not eat a path segment that merely ends in v1', () => {
    setBaseURL('https://api.chat.ethora.com/apiv1');
    expect(http.defaults.baseURL).toBe('https://api.chat.ethora.com/apiv1');
  });

  it('ignores an empty value instead of blanking the base URL', () => {
    setBaseURL('');
    expect(http.defaults.baseURL).toBe('https://api.chat.ethora.com');
  });
});
