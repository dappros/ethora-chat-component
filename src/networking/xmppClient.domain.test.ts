import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The XMPP domain a client opens its stream `to` must be the server's
 * virtual host. It used to be taken from the WebSocket URL only (and only
 * from wss:// URLs), ignoring xmppSettings.host, so an install whose
 * WebSocket endpoint is not on the XMPP domain (one origin serving the API,
 * the web app and /ws by path, or a proxy under another name) got
 * `host-unknown` from the server on every connect.
 */
const fakeXmppClient = {
  jid: { toString: () => 'me@example.com/res', domain: 'example.com' },
  setMaxListeners: vi.fn(),
  reconnect: { stop: vi.fn() },
  on: vi.fn(),
  once: vi.fn(),
  removeAllListeners: vi.fn(),
  start: vi.fn(() => Promise.resolve()),
  stop: vi.fn(() => Promise.resolve()),
  send: vi.fn(),
};

const clientFactory = vi.fn((..._args: unknown[]) => fakeXmppClient);

vi.mock('@xmpp/client', () => ({
  default: { client: (...args: unknown[]) => clientFactory(...args) },
  xml: (...args: unknown[]) => ({ args }),
}));

import { XmppClient } from './xmppClient';

const lastClientOptions = () =>
  clientFactory.mock.calls[clientFactory.mock.calls.length - 1][0] as Record<string, unknown>;

describe('XmppClient XMPP domain', () => {
  beforeEach(() => {
    clientFactory.mockClear();
  });

  it('uses the configured host when the WebSocket URL is on another host', () => {
    const c = new XmppClient('alice', 'secret', {
      devServer: 'ws://192.168.1.20:8456/ws',
      host: 'chat.local',
      conference: 'conference.chat.local',
    });
    expect(c.host).toBe('chat.local');
    expect(c.conference).toBe('conference.chat.local');
    expect(lastClientOptions()).toMatchObject({
      service: 'ws://192.168.1.20:8456/ws',
      domain: 'chat.local',
    });
  });

  it('falls back to the host of a wss:// URL when no host is configured', () => {
    const c = new XmppClient('alice', 'secret', { devServer: 'wss://xmpp.example.com/ws' });
    expect(c.host).toBe('xmpp.example.com');
    expect(lastClientOptions()).toMatchObject({ domain: 'xmpp.example.com' });
  });

  it('falls back to the host of a ws:// URL too', () => {
    const c = new XmppClient('alice', 'secret', { devServer: 'ws://localhost:5280/ws' });
    expect(c.host).toBe('localhost');
    expect(c.conference).toBe('conference.localhost');
    expect(lastClientOptions()).toMatchObject({ domain: 'localhost' });
  });

  it('keeps the old result when the configured host is the WebSocket host', () => {
    const c = new XmppClient('alice', 'secret', {
      devServer: 'wss://xmpp.example.com/ws',
      host: 'xmpp.example.com',
    });
    expect(c.host).toBe('xmpp.example.com');
    expect(lastClientOptions()).toMatchObject({ domain: 'xmpp.example.com' });
  });
});
