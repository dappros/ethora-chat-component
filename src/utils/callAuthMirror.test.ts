import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../networking/apiClient', () => ({
  default: { defaults: { baseURL: 'https://api.test' } },
}));

import { mirrorCallAuthToWorker } from './callAuthMirror';
import { deleteMirroredCallAuth } from './pushServiceWorkerBridge';

describe('call auth mirror for the service worker', () => {
  const store = new Map<string, Response>();
  const key = `${window.location.origin}/__ethora_call_auth__`;

  beforeEach(() => {
    store.clear();
    (globalThis as any).caches = {
      open: async () => ({
        put: async (k: string, r: Response) => void store.set(k, r),
        delete: async (k: string) => store.delete(k),
      }),
    };
  });

  const stored = async () => {
    const hit = store.get(key);
    return hit ? JSON.parse(await hit.clone().text()) : null;
  };

  it('writes the api base url and token where the worker reads them', async () => {
    await mirrorCallAuthToWorker('tok-1');
    expect(await stored()).toEqual({ apiBaseUrl: 'https://api.test', token: 'tok-1' });
  });

  it('follows a token refresh', async () => {
    await mirrorCallAuthToWorker('tok-2');
    await mirrorCallAuthToWorker('tok-3');
    expect((await stored()).token).toBe('tok-3');
  });

  it('is cleared on logout (no token)', async () => {
    await mirrorCallAuthToWorker('tok-4');
    await mirrorCallAuthToWorker('');
    expect(await stored()).toBeNull();
  });

  it('is cleared by disablePushNotifications even if this page never mirrored it', async () => {
    store.set(key, new Response('{"token":"stale"}'));
    await deleteMirroredCallAuth();
    expect(await stored()).toBeNull();
  });

  it('survives Cache Storage being unavailable', async () => {
    (globalThis as any).caches = { open: async () => { throw new Error('denied'); } };
    await expect(mirrorCallAuthToWorker('tok-5')).resolves.toBeUndefined();
  });
});
