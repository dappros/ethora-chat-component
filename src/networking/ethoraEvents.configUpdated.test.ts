import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parse } from 'ltx';

vi.mock('./apiClient', () => ({
  default: { get: vi.fn() },
  setBaseURL: vi.fn(),
}));

import { handleStanza } from './xmpp/handleStanzas.xmpp';
import { resetEthoraEvents } from './ethoraEvents';
import {
  resetChatComponentConfigListeners,
  subscribeChatComponentConfigUpdated,
} from '../helpers/chatComponentConfigEvents';
import { store } from '../roomStore';
import { setConfig } from '../roomStore/chatSettingsSlice';

const APP = '646cc8dc96d4a4dc8f7b2f2d';
const OTHER_APP = '646cc8dc96d4a4dc8f7b2f99';
const HOST = 'xmpp.example.com';
const ws = { host: HOST, client: { jid: { getDomain: () => HOST } } } as any;

// ejabberd's announce/online delivers the stanza whole, from the bare domain
const ev = (
  {
    from = HOST,
    appId = APP,
    version = '1790000000001',
    type = 'chat-component-config-updated',
    kind = 'headline',
  }: { from?: string; appId?: string; version?: string; type?: string; kind?: string } = {}
) =>
  parse(
    `<message type='${kind}' to='${APP}_me@${HOST}/res' from='${from}' id='ethora-event-9'>` +
      `<ethora-event xmlns='urn:ethora:events:1' type='${type}' ts='1' appId='${appId}' version='${version}'/></message>`
  );

const setHostConfig = (extra: Record<string, unknown> = {}) =>
  store.dispatch(setConfig({ appId: APP, ...extra } as any));

let onUpdated: ReturnType<typeof vi.fn>;
let bus: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  resetEthoraEvents();
  resetChatComponentConfigListeners();
  onUpdated = vi.fn();
  bus = vi.fn();
  subscribeChatComponentConfigUpdated(bus as any);
  setHostConfig({ eventHandlers: { onChatComponentConfigUpdated: onUpdated } });
});
afterEach(() => {
  vi.useRealTimers();
  resetEthoraEvents();
  resetChatComponentConfigListeners();
});

describe('chat-component-config-updated', () => {
  it('calls the host callback once with { appId, version } and publishes it', async () => {
    handleStanza(ev(), ws);
    expect(onUpdated).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(400);
    expect(onUpdated).toHaveBeenCalledTimes(1);
    expect(onUpdated).toHaveBeenCalledWith({ appId: APP, version: '1790000000001' });
    expect(bus).toHaveBeenCalledWith({ appId: APP, version: '1790000000001' });
  });

  it('accepts the per-user form too (admin account on the session domain)', async () => {
    handleStanza(ev({ from: `admin@${HOST}` }), ws);
    await vi.advanceTimersByTimeAsync(400);
    expect(onUpdated).toHaveBeenCalledTimes(1);
  });

  it('ignores another App: the announcement reaches every App on the host', async () => {
    handleStanza(ev({ appId: OTHER_APP }), ws);
    await vi.advanceTimersByTimeAsync(400);
    expect(onUpdated).not.toHaveBeenCalled();
    expect(bus).not.toHaveBeenCalled();
  });

  it('accepts the App named by remoteAppearance even when config.appId differs', async () => {
    setHostConfig({
      appId: APP,
      remoteAppearance: { appId: OTHER_APP },
      eventHandlers: { onChatComponentConfigUpdated: onUpdated },
    });
    handleStanza(ev({ appId: OTHER_APP }), ws);
    await vi.advanceTimersByTimeAsync(400);
    expect(onUpdated).toHaveBeenCalledWith({ appId: OTHER_APP, version: '1790000000001' });
  });

  it('coalesces a burst into the last version', async () => {
    handleStanza(ev({ version: '1' }), ws);
    await vi.advanceTimersByTimeAsync(100);
    handleStanza(ev({ version: '2' }), ws);
    await vi.advanceTimersByTimeAsync(100);
    handleStanza(ev({ version: '3' }), ws);
    await vi.advanceTimersByTimeAsync(400);
    expect(onUpdated).toHaveBeenCalledTimes(1);
    expect(onUpdated).toHaveBeenCalledWith({ appId: APP, version: '3' });
  });

  it('does not repeat a version it already reported, and reports the next one', async () => {
    handleStanza(ev({ version: '7' }), ws);
    await vi.advanceTimersByTimeAsync(400);
    handleStanza(ev({ version: '7' }), ws);
    await vi.advanceTimersByTimeAsync(400);
    expect(onUpdated).toHaveBeenCalledTimes(1);
    handleStanza(ev({ version: '8' }), ws);
    await vi.advanceTimersByTimeAsync(400);
    expect(onUpdated).toHaveBeenCalledTimes(2);
    expect(onUpdated).toHaveBeenLastCalledWith({ appId: APP, version: '8' });
  });

  it.each([
    ['a room occupant', `${APP}_room@conference.${HOST}/${APP}_x`],
    ['a user full jid', `${APP}_u1@${HOST}/web`],
    ['the domain with a resource', `${HOST}/announce`],
    ['another domain', 'xmpp.evil.example.org'],
    ['the conference domain', `conference.${HOST}`],
    ['a user on another domain', 'admin@evil.example.org'],
    ['no sender', ''],
  ])('ignores a forged event from %s', async (_n, from) => {
    handleStanza(ev({ from }), ws);
    await vi.advanceTimersByTimeAsync(400);
    expect(onUpdated).not.toHaveBeenCalled();
    expect(bus).not.toHaveBeenCalled();
  });

  it('ignores it outside a headline', async () => {
    handleStanza(ev({ kind: 'chat' }), ws);
    await vi.advanceTimersByTimeAsync(400);
    expect(onUpdated).not.toHaveBeenCalled();
  });

  it.each([
    ['a bad version', { version: 'v 1;<x>' }],
    ['no version', { version: '' }],
    ['a bad app id', { appId: 'a/b' }],
  ])('ignores %s', async (_n, extra) => {
    handleStanza(ev(extra as any), ws);
    await vi.advanceTimersByTimeAsync(400);
    expect(onUpdated).not.toHaveBeenCalled();
  });

  it('pinned trustedEventSenders: the domain has to be named', async () => {
    setHostConfig({
      trustedEventSenders: ['root'],
      eventHandlers: { onChatComponentConfigUpdated: onUpdated },
    });
    handleStanza(ev({ version: '11' }), ws);
    await vi.advanceTimersByTimeAsync(400);
    expect(onUpdated).not.toHaveBeenCalled();

    setHostConfig({
      trustedEventSenders: [HOST],
      eventHandlers: { onChatComponentConfigUpdated: onUpdated },
    });
    handleStanza(ev({ version: '11' }), ws);
    await vi.advanceTimersByTimeAsync(400);
    expect(onUpdated).toHaveBeenCalledTimes(1);
  });

  it('a throwing callback is logged, the bus still gets the event', async () => {
    onUpdated.mockImplementation(() => {
      throw new Error('host bug');
    });
    expect(() => handleStanza(ev(), ws)).not.toThrow();
    await vi.advanceTimersByTimeAsync(400);
    expect(bus).toHaveBeenCalledTimes(1);
  });

  it('works without a callback', async () => {
    setHostConfig();
    handleStanza(ev(), ws);
    await vi.advanceTimersByTimeAsync(400);
    expect(bus).toHaveBeenCalledTimes(1);
  });

  it('a domain-sent profile event is still not trusted (only this event type is)', async () => {
    const stanza = parse(
      `<message type='headline' from='${HOST}'><ethora-event xmlns='urn:ethora:events:1' type='user-profile-updated' xmppUsername='${APP}_${'1'.repeat(24)}' appId='${APP}'/></message>`
    );
    const apiClient = (await import('./apiClient')).default as any;
    handleStanza(stanza, ws);
    await vi.advanceTimersByTimeAsync(900);
    expect(apiClient.get).not.toHaveBeenCalled();
  });
});
