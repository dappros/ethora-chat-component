import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// A suspended or archived account fails SASL with `not-authorized`, which is
// also what an expired hourly password looks like. The client must not infer
// the block from that, but once the credential refresh (an API call) has
// reported it, it must stop: no reconnect, no further refresh.
const fakeXmppClient = {
  jid: { toString: () => 'me@example.com/res', domain: 'example.com' },
  setMaxListeners: vi.fn(),
  reconnect: { stop: vi.fn() },
  on: vi.fn(),
  once: vi.fn(),
  removeAllListeners: vi.fn(),
  start: vi.fn(() => Promise.resolve()),
  stop: vi.fn(() => Promise.resolve()),
};

vi.mock('@xmpp/client', () => ({
  default: { client: vi.fn(() => fakeXmppClient) },
  xml: (...args: any[]) => ({ args }),
}));

import { XmppClient } from './xmppClient';
import { store } from '../roomStore';
import {
  clearAccountBlocked,
  setAccountBlocked,
} from '../roomStore/chatSettingsSlice';

const block = () =>
  store.dispatch(setAccountBlocked({ blocked: 'archived', code: 'USER_ARCHIVED' }));

describe('XmppClient and suspended or archived accounts', () => {
  beforeEach(() => {
    store.dispatch(clearAccountBlocked());
  });

  afterEach(() => {
    store.dispatch(clearAccountBlocked());
    vi.restoreAllMocks();
  });

  it('stops after the credential refresh reports the block', async () => {
    const client = new XmppClient('user', 'pass') as any;
    const provider = vi.fn(async () => {
      // What happens for real: the refresh call is refused with
      // USER_SUSPENDED / USER_ARCHIVED and apiClient records it.
      block();
      return { username: 'user', password: 'pass' };
    });
    client.setCredentialsProvider(provider);
    client.authFailureDetected = true;
    const reconnect = vi.spyOn(client, 'reconnect');

    const recovered = await client.recoverFromAuthFailure('test');

    expect(recovered).toBe(false);
    expect(provider).toHaveBeenCalledTimes(1);
    expect(reconnect).not.toHaveBeenCalled();
    expect(client.authFailureDetected).toBe(true);
    expect(client.isRecoveringAuth).toBe(false);

    // A second SASL failure does not even ask again.
    expect(await client.recoverFromAuthFailure('again')).toBe(false);
    expect(provider).toHaveBeenCalledTimes(1);
  });

  it('does not reconnect or schedule a reconnect while blocked', async () => {
    const client = new XmppClient('user', 'pass') as any;
    client.status = 'offline';
    block();
    const disconnect = vi.spyOn(client, 'disconnect');

    await client.reconnect();
    client.scheduleReconnect('test');

    expect(disconnect).not.toHaveBeenCalled();
    expect(client.reconnectTimer).toBeNull();
  });

  it('still schedules ordinary reconnects when nothing is blocked', () => {
    vi.useFakeTimers();
    try {
      const client = new XmppClient('user', 'pass') as any;
      client.status = 'offline';
      client.isBrowserOnline = () => true;
      client.scheduleReconnect('test');
      expect(client.reconnectTimer).not.toBeNull();
      clearTimeout(client.reconnectTimer);
    } finally {
      vi.useRealTimers();
    }
  });
});
