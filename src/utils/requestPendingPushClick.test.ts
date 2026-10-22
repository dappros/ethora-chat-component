import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../firebase-config', () => ({ getFirebaseMessaging: vi.fn(), defaultConfig: {} }));

import { requestPendingPushClick } from './firebasePushNotifications';

describe('requestPendingPushClick', () => {
  const original = (navigator as any).serviceWorker;
  afterEach(() => {
    (navigator as any).serviceWorker = original;
  });

  it('messages the controlling worker', async () => {
    const postMessage = vi.fn();
    (navigator as any).serviceWorker = { controller: { postMessage } };
    expect(await requestPendingPushClick()).toBe(true);
    expect(postMessage).toHaveBeenCalledWith({ type: 'GET_PENDING_PUSH_CLICK' });
  });

  it('falls back to the active registration when the page is not controlled yet', async () => {
    const postMessage = vi.fn();
    (navigator as any).serviceWorker = {
      controller: null,
      ready: Promise.resolve({ active: { postMessage } }),
    };
    expect(await requestPendingPushClick()).toBe(true);
    expect(postMessage).toHaveBeenCalledWith({ type: 'GET_PENDING_PUSH_CLICK' });
  });

  it('asks the worker to drop the click when the page already took it from the url', async () => {
    const postMessage = vi.fn();
    (navigator as any).serviceWorker = { controller: { postMessage } };
    expect(await requestPendingPushClick(undefined, { discard: true })).toBe(true);
    expect(postMessage).toHaveBeenCalledWith({ type: 'GET_PENDING_PUSH_CLICK', discard: true });
  });

  it('gives up when no worker ever becomes ready', async () => {
    (navigator as any).serviceWorker = { controller: null, ready: new Promise(() => {}) };
    expect(await requestPendingPushClick(10)).toBe(false);
  });
});
