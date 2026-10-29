import { beforeEach, describe, expect, it, vi } from 'vitest';

const post = vi.fn();
let state: any;

vi.mock('../apiClient', () => ({ default: { post: (...args: any[]) => post(...args) } }));
vi.mock('../../roomStore', () => ({ store: { getState: () => state } }));
vi.mock('../../helpers/ethoraLogger', () => ({ ethoraLogger: { log: vi.fn() } }));

import { registerPushToken, resolvePushLanguage } from './push.api';

const withSettings = (settings: any) => {
  state = {
    chatSettingStore: { user: { token: 'jwt' }, appId: 'app1', ...settings },
  };
};

beforeEach(() => {
  post.mockReset();
  post.mockResolvedValue({ data: { ok: true } });
  withSettings({});
});

describe('push language', () => {
  it('prefers translates.readerLocale, then i18n.locale, then the picked language', () => {
    withSettings({
      config: { translates: { enabled: true, readerLocale: 'fr-CA' }, i18n: { locale: 'es-US' } },
      langSource: 'en',
    });
    expect(resolvePushLanguage(state)).toBe('fr-CA');
    withSettings({ config: { i18n: { locale: 'es-US' } }, langSource: 'en' });
    expect(resolvePushLanguage(state)).toBe('es-US');
    withSettings({ langSource: 'fr-CA' });
    expect(resolvePushLanguage(state)).toBe('fr-CA');
  });

  it('is sent with the token, full tag as-is', async () => {
    withSettings({ config: { i18n: { locale: 'es-US' } } });
    await registerPushToken('fcm-token');
    expect(post).toHaveBeenCalledWith(
      '/v1/push/subscription/app1',
      { registrationToken: 'fcm-token', deviceType: 'web', language: 'es-US' },
      { headers: { Authorization: 'jwt' } }
    );
  });

  it('is dropped and retried on a backend that predates it', async () => {
    withSettings({ config: { i18n: { locale: 'es-US' } } });
    post.mockRejectedValueOnce({
      response: { status: 422, data: { error: '"language" is not allowed' } },
    });
    await expect(registerPushToken('fcm-token')).resolves.toEqual({ ok: true });
    expect(post).toHaveBeenCalledTimes(2);
    expect(post.mock.calls[1][1]).toEqual({ registrationToken: 'fcm-token', deviceType: 'web' });
  });
});
