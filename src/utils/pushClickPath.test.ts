import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../firebase-config', () => ({
  getFirebaseMessaging: vi.fn(async () => ({})),
  defaultConfig: {},
}));
vi.mock('firebase/messaging', () => ({ getToken: vi.fn(async () => 'fcm-token') }));

import { getFCMToken } from './firebasePushNotifications';

// clickPath reaches the worker the same way iconPath does: as a query param
// of its registration url, and a changed value re-registers the worker.
describe('getFCMToken - clickPath', () => {
  const original = (navigator as any).serviceWorker;
  let register: ReturnType<typeof vi.fn>;
  let registrations: any[];

  beforeEach(() => {
    registrations = [];
    register = vi.fn(async (url: string) => {
      const registration = { active: { scriptURL: url } };
      registrations = [registration];
      return registration;
    });
    (navigator as any).serviceWorker = {
      getRegistrations: async () => registrations,
      register,
      ready: Promise.resolve(null),
    };
  });
  afterEach(() => {
    (navigator as any).serviceWorker = original;
  });

  it('passes clickPath to the worker registration url', async () => {
    await getFCMToken({ clickPath: '/app/chat' });
    const url = new URL(register.mock.calls[0][0] as string);
    expect(url.searchParams.get('clickPath')).toBe('/app/chat');
  });

  it('omits it when not configured', async () => {
    await getFCMToken({});
    expect(new URL(register.mock.calls[0][0] as string).searchParams.has('clickPath')).toBe(false);
  });

  it('re-registers a worker that was registered with another clickPath', async () => {
    registrations = [{ active: { scriptURL: `${window.location.origin}/firebase-messaging-sw.js?clickPath=%2Fold` } }];
    await getFCMToken({ clickPath: '/new' });
    expect(register).toHaveBeenCalledTimes(1);
    expect(new URL(register.mock.calls[0][0] as string).searchParams.get('clickPath')).toBe('/new');
  });
});
