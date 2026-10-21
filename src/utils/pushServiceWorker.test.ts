import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

// Loads the REAL public/firebase-messaging-sw.js into a node:vm sandbox with a
// fake worker environment (listeners, clients, Cache Storage, a clock), then
// drives it through push / notificationclick / message events.
type Listener = (event: any) => void;

const ORIGIN = 'https://app.test';

const makeClient = (url: string, extra: Record<string, unknown> = {}) => ({
  url,
  visibilityState: 'hidden',
  focused: false,
  focus: vi.fn(async function (this: any) {
    return this;
  }),
  navigate: vi.fn(async (next: string) => ({ ...extra, url: next, postMessage: vi.fn() })),
  postMessage: vi.fn(),
  ...extra,
});

const loadWorker = (search = '') => {
  const source = readFileSync(join(process.cwd(), 'public/firebase-messaging-sw.js'), 'utf8');
  const noop = () => {};
  const listeners: Record<string, Listener> = {};
  const clock = { now: 1_700_000_000_000 };
  const cacheStore = new Map<string, Response>();
  const windowClients: any[] = [];

  const clientsApi = {
    matchAll: vi.fn(async () => windowClients),
    openWindow: vi.fn(async () => null),
    claim: vi.fn(async () => undefined),
  };
  const registration = {
    scope: `${ORIGIN}/`,
    showNotification: vi.fn(async () => undefined),
  };

  class FakeDate extends Date {
    constructor(...args: any[]) {
      if (args.length) super(...(args as [any]));
      else super(clock.now);
    }
    static now() {
      return clock.now;
    }
  }

  const sandbox: Record<string, unknown> = {
    console: { log: noop, warn: noop, error: noop },
    clients: clientsApi,
    importScripts: noop,
    registration,
    URL,
    Response,
    Date: FakeDate,
    caches: {
      open: async () => ({
        put: async (key: string, res: Response) => {
          cacheStore.set(String(key), res);
        },
        match: async (key: string) => cacheStore.get(String(key))?.clone(),
        delete: async (key: string) => cacheStore.delete(String(key)),
      }),
    },
  };
  sandbox.self = {
    location: { href: `${ORIGIN}/firebase-messaging-sw.js${search}`, origin: ORIGIN },
    addEventListener: (type: string, cb: Listener) => {
      listeners[type] = cb;
    },
    registration,
    clients: clientsApi,
    skipWaiting: noop,
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);

  const fire = async (type: string, event: Record<string, unknown>) => {
    const waits: Promise<unknown>[] = [];
    listeners[type]({ ...event, waitUntil: (p: Promise<unknown>) => waits.push(p) });
    await Promise.all(waits);
  };

  let seq = 0;
  const push = (raw: Record<string, unknown>) =>
    fire('push', {
      data: { text: () => JSON.stringify({ fcmMessageId: `fcm-${(seq += 1)}`, ...raw }) },
    });

  const click = (data: Record<string, unknown>, title = 'Alice', body = 'hi') =>
    fire('notificationclick', { notification: { data, title, body, close: vi.fn() } });

  const requestPending = async () => {
    const source = { postMessage: vi.fn() };
    await fire('message', { data: { type: 'GET_PENDING_PUSH_CLICK' }, source });
    return source;
  };

  const lastNotification = () => {
    const calls = registration.showNotification.mock.calls as any[];
    const [title, options] = calls[calls.length - 1];
    return { title: title as string, options: options as Record<string, any> };
  };

  return {
    sandbox: sandbox as any,
    clientsApi,
    registration,
    windowClients,
    clock,
    cacheStore,
    fire,
    push,
    click,
    requestPending,
    lastNotification,
  };
};

const messagePush = (data: Record<string, unknown> = {}, notification: Record<string, unknown> = {}) => ({
  notification: { title: 'Alice', body: 'hello', ...notification },
  data: { jid: 'app1_room1@conference.xmpp.test', msgID: 'm-1', userJid: 'app1_me@xmpp.test', ...data },
});

describe('service worker push contract', () => {
  let sw: ReturnType<typeof loadWorker>;
  beforeEach(() => {
    sw = loadWorker();
  });

  it('groups chat messages one notification per room and renotifies', async () => {
    await sw.push(messagePush());
    const { title, options } = sw.lastNotification();
    expect(title).toBe('Alice');
    expect(options.tag).toBe('ethora-room-app1_room1');
    expect(options.silent).toBe(false);
    expect(options.renotify).toBe(true);
    expect(options.data.jid).toBe('app1_room1@conference.xmpp.test');
  });

  it('shows a reaction silently under a separate tag that cannot replace the message', async () => {
    await sw.push({
      notification: { title: 'Bob', body: 'reacted 👍 to "hello"' },
      data: { type: 'reaction', jid: 'app1_room1@conference.xmpp.test', msgID: 'm-1', userJid: 'app1_me@xmpp.test' },
    });
    const { options } = sw.lastNotification();
    expect(options.tag).toBe('ethora-room-app1_room1#reaction');
    expect(options.silent).toBe(true);
    // a reaction is already silent, it does not set renotify on top
    expect(options.renotify).toBe(false);
    expect(options.data.type).toBe('reaction');
    expect(options.data.msgID).toBe('m-1');
  });

  it('never shows a raw <appId>_<userId> as the title', async () => {
    await sw.push(messagePush({}, { title: '6a2c08adef26ca2d3e1e3677_6a2c08aeef26ca2d3e1e368e' }));
    expect(sw.lastNotification().title).toBe('New Message');
  });

  it('does not show a notification while a window is visible', async () => {
    sw.windowClients.push({ ...makeClient(`${ORIGIN}/chat`), visibilityState: 'visible' });
    await sw.push(messagePush());
    expect(sw.registration.showNotification).not.toHaveBeenCalled();
  });

  it('drops a repeated delivery of the same push', async () => {
    const raw = { ...messagePush(), fcmMessageId: 'same' };
    const event = { data: { text: () => JSON.stringify(raw) } };
    await sw.fire('push', event);
    await sw.fire('push', event);
    expect(sw.registration.showNotification).toHaveBeenCalledTimes(1);
  });

  it('keeps the full call payload on the notification', async () => {
    const data = { type: 'call', callId: 'c-1', callKind: 'video', callToken: 'tok', jid: 'app1_room1@conference.xmpp.test' };
    await sw.push({ data });
    const { title, options } = sw.lastNotification();
    expect(title).toContain('Incoming video call');
    expect(options.requireInteraction).toBe(true);
    expect(options.tag).toBe('call:c-1');
    expect(options.data).toMatchObject(data);
  });
});

describe('service worker previewUrl', () => {
  it('uses data.previewUrl as the notification image', async () => {
    const sw = loadWorker();
    await sw.push(messagePush({ previewUrl: 'https://cdn.test/thumb.jpg' }));
    expect(sw.lastNotification().options.image).toBe('https://cdn.test/thumb.jpg');
  });

  it('accepts a same-origin path and ignores unsafe or malformed values', async () => {
    const sw = loadWorker();
    await sw.push(messagePush({ previewUrl: '/media/thumb.jpg' }));
    expect(sw.lastNotification().options.image).toBe('/media/thumb.jpg');
    for (const bad of [
      'javascript:alert(1)',
      'data:image/png;base64,AAAA',
      '//evil.test/x.png',
      '/\\evil.test/x.png',
      '/\\\\evil.test/x.png',
      'thumb.jpg',
      '  ',
      42,
    ]) {
      sw.registration.showNotification.mockClear();
      await sw.push(messagePush({ previewUrl: bad }));
      expect(sw.lastNotification().options.image).toBeUndefined();
    }
  });

  it('sanitizes data.image, notification.image and image like previewUrl and the icon', async () => {
    const sw = loadWorker();
    const bad = ['javascript:alert(1)', 'data:image/png;base64,AAAA', '/\\evil.test/x.png', '//evil.test/x.png'];
    for (const value of bad) {
      sw.registration.showNotification.mockClear();
      await sw.push({ ...messagePush({ image: value }, { image: value }), image: value });
      expect(sw.lastNotification().options.image).toBeUndefined();
    }
    await sw.push(messagePush({ image: 'javascript:x' }, { image: '/img/ok.png' }));
    expect(sw.lastNotification().options.image).toBe('/img/ok.png');
    await sw.push({ ...messagePush(), image: 'https://cdn.test/raw.png' });
    expect(sw.lastNotification().options.image).toBe('https://cdn.test/raw.png');
  });

  it('does not take an icon that only looks like a path on this origin', async () => {
    const sw = loadWorker('?iconPath=%2Fdefault.png');
    for (const value of ['/\\evil.test/i.png', '//evil.test/i.png']) {
      await sw.push(messagePush({ icon: value }));
      expect(sw.lastNotification().options.icon).toBe('/default.png');
    }
    await sw.push(messagePush({ icon: '/own/i.png' }));
    expect(sw.lastNotification().options.icon).toBe('/own/i.png');
  });

  it('lets an explicit image win and shows no image for a text message', async () => {
    const sw = loadWorker();
    await sw.push(messagePush({ previewUrl: 'https://cdn.test/thumb.jpg' }, { image: 'https://cdn.test/big.jpg' }));
    expect(sw.lastNotification().options.image).toBe('https://cdn.test/big.jpg');
    await sw.push(messagePush());
    expect(sw.lastNotification().options.image).toBeUndefined();
  });
});

describe('service worker cold-start tap', () => {
  it('opens the app, keeps the click, and hands it out exactly once', async () => {
    const sw = loadWorker();
    const data = { jid: 'app1_room1@conference.xmpp.test', msgID: 'm-1', type: 'reaction' };
    await sw.push(messagePush(data));
    const shown = sw.lastNotification().options.data;

    await sw.click(shown, 'Alice', 'hello');

    expect(sw.clientsApi.openWindow).toHaveBeenCalledTimes(1);
    expect(sw.clientsApi.openWindow).toHaveBeenCalledWith(
      `${ORIGIN}/?fromPush=1&chatId=app1_room1&messageId=m-1`
    );

    const first = await sw.requestPending();
    expect(first.postMessage).toHaveBeenCalledTimes(1);
    const sent = first.postMessage.mock.calls[0][0];
    expect(sent.type).toBe('PUSH_NOTIFICATION_CLICK');
    expect(sent.data).toMatchObject(data);
    expect(sent.notification).toEqual({ title: 'Alice', body: 'hello' });

    const second = await sw.requestPending();
    expect(second.postMessage).not.toHaveBeenCalled();
  });

  it('puts only the room and message ids in the opened url', async () => {
    const sw = loadWorker();
    await sw.click({ jid: 'room@conference.x', msgID: 'm-1', token: 'secret', body: 'private text' });
    const opened = (sw.clientsApi.openWindow.mock.calls as any[][])[0][0] as string;
    expect(opened).toBe(`${ORIGIN}/?fromPush=1&chatId=room&messageId=m-1`);
    expect(opened).not.toContain('secret');
    expect(opened).not.toContain('private');
  });

  it('opens the origin root without params when the push has no room', async () => {
    const sw = loadWorker();
    await sw.click({ title: 'x' });
    expect(sw.clientsApi.openWindow).toHaveBeenCalledWith(`${ORIGIN}/`);
  });

  it('leaves a call tap to the pending click: no room params in the url', async () => {
    const sw = loadWorker();
    await sw.click({ type: 'call', callId: 'c-1', callToken: 'tok', callKind: 'audio', jid: 'room@conference.x' });
    expect(sw.clientsApi.openWindow).toHaveBeenCalledWith(`${ORIGIN}/`);
    expect((await sw.requestPending()).postMessage).toHaveBeenCalledTimes(1);
  });

  it('opens the configured clickPath instead of the origin root', async () => {
    const sw = loadWorker('?clickPath=%2Fapp%2Fchat');
    await sw.push(messagePush());
    expect(sw.lastNotification().options.data.url).toBe(`${ORIGIN}/app/chat`);
    await sw.click(sw.lastNotification().options.data);
    expect(sw.clientsApi.openWindow).toHaveBeenCalledWith(
      `${ORIGIN}/app/chat?fromPush=1&chatId=app1_room1&messageId=m-1`
    );
  });

  it('keeps an existing query on the clickPath and ignores unsafe click paths', async () => {
    const withQuery = loadWorker('?clickPath=%2Fapp%2Fchat%3Fx%3D1');
    await withQuery.click({ jid: 'room@conference.x', url: `${ORIGIN}/app/chat?x=1`, urlExplicit: false });
    expect(withQuery.clientsApi.openWindow).toHaveBeenCalledWith(
      `${ORIGIN}/app/chat?x=1&fromPush=1&chatId=room`
    );
    for (const bad of ['https://evil.test/x', '//evil.test/x', '/\\evil.test/x', 'app/chat', 'javascript:alert(1)']) {
      const sw = loadWorker(`?clickPath=${encodeURIComponent(bad)}`);
      await sw.push(messagePush());
      expect(sw.lastNotification().options.data.url).toBe(`${ORIGIN}/`);
    }
  });

  it('does not add room params to a url that names a chat or leaves the origin', async () => {
    const sw = loadWorker();
    await sw.click({ jid: 'room@conference.x', url: `${ORIGIN}/chat?chatId=other`, urlExplicit: true });
    expect(sw.clientsApi.openWindow).toHaveBeenLastCalledWith(`${ORIGIN}/chat?chatId=other`);
    await sw.click({ jid: 'room@conference.x', url: 'https://other.test/x', urlExplicit: true });
    expect(sw.clientsApi.openWindow).toHaveBeenLastCalledWith('https://other.test/x');
  });

  it('answers a discard request by dropping the click without replaying it', async () => {
    const sw = loadWorker();
    await sw.click({ jid: 'room@conference.x', msgID: 'm-1' });
    const source = { postMessage: vi.fn() };
    await sw.fire('message', { data: { type: 'GET_PENDING_PUSH_CLICK', discard: true }, source });
    expect(source.postMessage).not.toHaveBeenCalled();
    expect((await sw.requestPending()).postMessage).not.toHaveBeenCalled();
  });

  it('forgets the click after the TTL', async () => {
    const sw = loadWorker();
    await sw.click({ jid: 'room@conference.x', msgID: 'm-1' });
    sw.clock.now += 2 * 60 * 1000 + 1000;
    const reply = await sw.requestPending();
    expect(reply.postMessage).not.toHaveBeenCalled();
    // and it is gone, not merely skipped
    sw.clock.now -= 60 * 1000;
    expect((await sw.requestPending()).postMessage).not.toHaveBeenCalled();
  });

  it('still hands it out just inside the TTL', async () => {
    const sw = loadWorker();
    await sw.click({ jid: 'room@conference.x', msgID: 'm-1' });
    sw.clock.now += 100 * 1000;
    expect((await sw.requestPending()).postMessage).toHaveBeenCalledTimes(1);
  });

  it('passes the full call data through for a call tap', async () => {
    const sw = loadWorker();
    const data = { type: 'call', callId: 'c-1', callToken: 'tok', callKind: 'audio', jid: 'room@conference.x' };
    await sw.click(data, 'Incoming audio call', 'Tap to answer');
    const reply = await sw.requestPending();
    expect(reply.postMessage.mock.calls[0][0].data).toMatchObject(data);
  });

  it('answers a request while a concurrent one finds nothing', async () => {
    const sw = loadWorker();
    await sw.click({ jid: 'room@conference.x', msgID: 'm-1' });
    const [a, b] = await Promise.all([sw.requestPending(), sw.requestPending()]);
    expect(a.postMessage.mock.calls.length + b.postMessage.mock.calls.length).toBe(1);
  });
});

describe('service worker warm tap', () => {
  const data = { jid: 'app1_room1@conference.xmpp.test', msgID: 'm-1', url: `${ORIGIN}/`, urlExplicit: false };

  it('focuses and messages the open tab without navigating or opening a window', async () => {
    const sw = loadWorker();
    const tab = makeClient(`${ORIGIN}/chat?x=1`);
    sw.windowClients.push(tab);

    await sw.click(data);

    expect(tab.navigate).not.toHaveBeenCalled();
    expect(sw.clientsApi.openWindow).not.toHaveBeenCalled();
    expect(tab.focus).toHaveBeenCalledTimes(1);
    const types = tab.postMessage.mock.calls.map((c: any[]) => c[0].type);
    expect(types).toEqual(['PUSH_NOTIFICATION_CLICK', 'OPEN_FROM_PUSH']);
    expect(tab.postMessage.mock.calls[0][0].data).toMatchObject({ jid: data.jid, msgID: 'm-1' });
    // nothing left behind to replay on the next page load
    expect((await sw.requestPending()).postMessage).not.toHaveBeenCalled();
  });

  it('treats a push from an older worker (no urlExplicit flag) as having no url', async () => {
    const sw = loadWorker();
    const tab = makeClient(`${ORIGIN}/chat`);
    sw.windowClients.push(tab);
    await sw.click({ jid: 'room@conference.x', url: `${ORIGIN}/` });
    expect(tab.navigate).not.toHaveBeenCalled();
  });

  it('does not open a second window when navigate is unavailable or rejects', async () => {
    const sw = loadWorker();
    const tab = makeClient(`${ORIGIN}/chat`);
    tab.navigate = vi.fn(async () => {
      throw new TypeError('uncontrolled client');
    });
    sw.windowClients.push(tab);

    await sw.click({ ...data, url: `${ORIGIN}/room/1`, urlExplicit: true });

    expect(sw.clientsApi.openWindow).not.toHaveBeenCalled();
    expect(tab.postMessage.mock.calls[0][0].type).toBe('PUSH_NOTIFICATION_CLICK');
    // the pending copy made for the navigation is dropped again
    expect((await sw.requestPending()).postMessage).not.toHaveBeenCalled();
  });

  it('navigates only for an explicit url that differs, and the new page picks the click up', async () => {
    const sw = loadWorker();
    const tab = makeClient(`${ORIGIN}/chat`);
    sw.windowClients.push(tab);

    await sw.click({ ...data, url: `${ORIGIN}/room/1`, urlExplicit: true });

    expect(tab.navigate).toHaveBeenCalledWith(`${ORIGIN}/room/1`);
    expect(sw.clientsApi.openWindow).not.toHaveBeenCalled();
    const reply = await sw.requestPending();
    expect(reply.postMessage.mock.calls[0][0].data).toMatchObject({ jid: data.jid });
  });

  it('does not reload a tab that is on the explicit route but carries a query or hash', async () => {
    const sw = loadWorker();
    const tab = makeClient(`${ORIGIN}/app/chat?chatId=room1#top`);
    sw.windowClients.push(tab);
    await sw.click({ ...data, url: `${ORIGIN}/app/chat`, urlExplicit: true });
    expect(tab.navigate).not.toHaveBeenCalled();
    expect(sw.clientsApi.openWindow).not.toHaveBeenCalled();
    expect(tab.focus).toHaveBeenCalled();
    expect(tab.postMessage.mock.calls[0][0].type).toBe('PUSH_NOTIFICATION_CLICK');
    expect((await sw.requestPending()).postMessage).not.toHaveBeenCalled();
    // a different path still navigates
    await sw.click({ ...data, msgID: 'm-2', url: `${ORIGIN}/other`, urlExplicit: true });
    expect(tab.navigate).toHaveBeenCalledWith(`${ORIGIN}/other`);
  });

  it('does not navigate when the tab is already on the explicit url', async () => {
    const sw = loadWorker();
    const tab = makeClient(`${ORIGIN}/room/1`);
    sw.windowClients.push(tab);
    await sw.click({ ...data, url: `${ORIGIN}/room/1`, urlExplicit: true });
    expect(tab.navigate).not.toHaveBeenCalled();
    expect(tab.postMessage).toHaveBeenCalled();
  });

  it('prefers a focused in-scope tab over other tabs', async () => {
    const sw = loadWorker();
    const other = makeClient('https://other.test/x');
    const idle = makeClient(`${ORIGIN}/a`);
    const focused = makeClient(`${ORIGIN}/b`, { focused: true });
    sw.windowClients.push(other, idle, focused);
    await sw.click(data);
    expect(focused.postMessage).toHaveBeenCalled();
    expect(idle.postMessage).not.toHaveBeenCalled();
    expect(other.postMessage).not.toHaveBeenCalled();
  });

  it('a pushed notification carries urlExplicit only when the push named a url', async () => {
    const sw = loadWorker();
    await sw.push(messagePush());
    expect(sw.lastNotification().options.data.urlExplicit).toBe(false);
    await sw.push(messagePush({ url: `${ORIGIN}/somewhere` }));
    expect(sw.lastNotification().options.data.urlExplicit).toBe(true);
  });
});

describe('service worker odd payloads', () => {
  const pushText = (sw: ReturnType<typeof loadWorker>, text: string) =>
    sw.fire('push', { data: { text: () => text } });

  it('shows a JSON string push as text and never reads String.prototype.link as a url', async () => {
    const sw = loadWorker();
    await pushText(sw, JSON.stringify('hello'));
    const { title, options } = sw.lastNotification();
    expect(title).toBe('New Message');
    expect(options.body).toBe('hello');
    expect(options.data.urlExplicit).toBe(false);
    expect(options.data.url).toBe(`${ORIGIN}/`);
  });

  it('treats other JSON scalars and arrays as text without a url', async () => {
    for (const text of ['42', 'true', '[1,2]', 'plain words']) {
      const sw = loadWorker();
      await pushText(sw, text);
      expect(sw.lastNotification().options.data.urlExplicit).toBe(false);
    }
  });

  it('ignores non-string url fields and non-object data', async () => {
    const sw = loadWorker();
    await sw.push({ data: { url: 5, link: { a: 1 } }, notification: { click_action: ['x'] }, title: 'T', body: 'B' });
    expect(sw.lastNotification().options.data.urlExplicit).toBe(false);
    await sw.push({ data: 'abc', notification: 'def', title: 'T2', body: 'B2' });
    const { options } = sw.lastNotification();
    expect(options.data.urlExplicit).toBe(false);
    expect(options.data['0']).toBeUndefined();
  });

  it('logs and survives a failing handler instead of leaking a rejection', async () => {
    const sw = loadWorker();
    const errors: unknown[] = [];
    sw.sandbox.console.error = (...args: unknown[]) => errors.push(args);
    sw.registration.showNotification.mockRejectedValueOnce(new Error('boom'));
    await expect(sw.push(messagePush())).resolves.toBeUndefined();
    expect(errors.length).toBe(1);
  });
});
