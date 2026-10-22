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

const loadWorker = (search = '', windowsAtStart: any[] = []) => {
  const source = readFileSync(join(process.cwd(), 'public/firebase-messaging-sw.js'), 'utf8');
  const noop = () => {};
  const listeners: Record<string, Listener> = {};
  const clock = { now: 1_700_000_000_000 };
  const cacheStore = new Map<string, Response>();
  const windowClients: any[] = [];

  // The worker looks at the open windows once while it starts (to probe them
  // for call support); that first look sees `windowsAtStart`, not whatever a
  // test pushes into windowClients right after loading.
  let firstLook = true;
  const clientsApi = {
    matchAll: vi.fn(async () => {
      if (firstLook) {
        firstLook = false;
        return windowsAtStart;
      }
      return windowClients;
    }),
    openWindow: vi.fn(async () => null),
    claim: vi.fn(async () => undefined),
  };
  // The worker's own timers (ack wait, keep-alive) run on this clock, so a test
  // moves time with advance() instead of waiting.
  const timers: { id: number; at: number; cb: () => void }[] = [];
  let timerSeq = 0;
  const shown: any[] = [];
  const registration = {
    scope: `${ORIGIN}/`,
    showNotification: vi.fn(async (title: string, options: Record<string, any>) => {
      const notification: any = {
        title,
        ...options,
        close: vi.fn(() => {
          const i = shown.indexOf(notification);
          if (i >= 0) shown.splice(i, 1);
        }),
      };
      // same tag replaces
      for (let i = shown.length - 1; i >= 0; i -= 1) {
        if (options.tag && shown[i].tag === options.tag) shown.splice(i, 1);
      }
      shown.push(notification);
    }),
    getNotifications: vi.fn(async (filter: { tag?: string } = {}) =>
      shown.filter((n) => !filter.tag || n.tag === filter.tag)
    ),
  };
  const fetchMock = vi.fn(async () => ({ ok: true }));

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
    atob: globalThis.atob,
    fetch: fetchMock,
    setTimeout: (cb: () => void, ms: number) => {
      timerSeq += 1;
      timers.push({ id: timerSeq, at: clock.now + ms, cb });
      return timerSeq;
    },
    clearTimeout: (id: number) => {
      const i = timers.findIndex((t) => t.id === id);
      if (i >= 0) timers.splice(i, 1);
    },
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

  const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
  const advance = async (ms: number) => {
    const target = clock.now + ms;
    await tick();
    for (;;) {
      const due = timers.filter((t) => t.at <= target).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      timers.splice(timers.indexOf(due), 1);
      clock.now = Math.max(clock.now, due.at);
      due.cb();
      await tick();
    }
    clock.now = target;
    await tick();
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
    shown,
    fetchMock,
    advance,
    tick,
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

  it('one ring per call when the page keyed it by room and the push carries the callId', async () => {
    // The page rang first from a call token without a callId: tag call:room:<room>.
    await sw.registration.showNotification('Incoming video call', {
      tag: 'call:room:app1_room1',
      data: { room: 'app1_room1@conference.xmpp.test' },
    });
    // A ring for another room must stay.
    await sw.registration.showNotification('Incoming video call', {
      tag: 'call:room:app1_other',
      data: { room: 'app1_other@conference.xmpp.test' },
    });
    const data = { type: 'call', callId: 'c-1', callKind: 'video', callToken: 'tok', jid: 'app1_room1@conference.xmpp.test' };
    const done = sw.push({ data });
    await sw.advance(0);
    const tags = sw.shown.map((n: any) => n.tag).sort();
    expect(tags).toEqual(['call:c-1', 'call:room:app1_other']);
    await sw.advance(61_000);
    await done;
  });

  it('keeps the full call payload on the notification', async () => {
    const data = { type: 'call', callId: 'c-1', callKind: 'video', callToken: 'tok', jid: 'app1_room1@conference.xmpp.test' };
    const done = sw.push({ data });
    await sw.advance(0);
    const { title, options } = sw.lastNotification();
    expect(title).toContain('Incoming video call');
    expect(options.requireInteraction).toBe(true);
    expect(options.tag).toBe('call:c-1');
    expect(options.data).toMatchObject(data);
    await sw.advance(61_000);
    await done;
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

// ── calls ─────────────────────────────────────────────────────
const NOW_S = 1_700_000_000;

const makeJwt = (exp?: number) =>
  `h.${btoa(JSON.stringify(exp === undefined ? { sub: 'Alice' } : { exp, sub: 'Alice' }))}.s`;

const callData = (extra: Record<string, unknown> = {}) => ({
  type: 'call',
  callId: 'c-1',
  callToken: makeJwt(NOW_S + 60),
  room: 'app1_a-app1_b',
  kind: 'video',
  callerName: 'Alice',
  callerXmppUsername: 'app1_a',
  ...extra,
});

const ackingClient = (sw: ReturnType<typeof loadWorker>, url = `${ORIGIN}/chat`, visible = true) => {
  const client: any = makeClient(url);
  client.visibilityState = visible ? 'visible' : 'hidden';
  client.postMessage = vi.fn((msg: any) => {
    if (msg.type === 'CALL_PUSH') {
      void sw.fire('message', {
        data: { type: 'CALL_PUSH_ACK', callId: msg.data.callId },
        source: { postMessage: vi.fn() },
      });
    }
  });
  return client;
};

let clientSeq = 0;

// A window the worker knows can take a call over: it announced itself the way
// the page does (CALL_CLIENT_READY), and carries an id like a real Client.
const readyTab = async (
  sw: ReturnType<typeof loadWorker>,
  url = `${ORIGIN}/chat`,
  extra: Record<string, unknown> = {}
) => {
  clientSeq += 1;
  const client: any = makeClient(url, { id: `client-${clientSeq}`, ...extra });
  sw.windowClients.push(client);
  await sw.fire('message', {
    data: { type: 'CALL_CLIENT_READY', ready: true },
    source: { id: client.id },
  });
  return client;
};

// A window with no <Chat> on it (it never announces itself).
const hostTab = (
  sw: ReturnType<typeof loadWorker>,
  url = `${ORIGIN}/apps`,
  extra: Record<string, unknown> = {}
) => {
  clientSeq += 1;
  const client: any = makeClient(url, { id: `client-${clientSeq}`, ...extra });
  sw.windowClients.push(client);
  return client;
};

// The page side of a click: acks the way usePushNotifications does.
const takesClicks = (sw: ReturnType<typeof loadWorker>, client: any) => {
  client.postMessage = vi.fn((msg: any) => {
    if (msg.type === 'PUSH_NOTIFICATION_CLICK') {
      void sw.fire('message', {
        data: { type: 'CALL_PUSH_ANSWER_ACK', callId: msg.data.callId },
        source: { id: client.id },
      });
    }
  });
  return client;
};

// A shown ring keeps its push event alive until the token expires; start it,
// let it show, and hand back a function that runs the clock out.
const ring = async (sw: ReturnType<typeof loadWorker>, data: Record<string, unknown>) => {
  const done = sw.push({ data });
  await sw.advance(0);
  return async () => {
    await sw.advance(61_000);
    await done;
  };
};

describe('service worker call push', () => {
  it('shows a sticky call notification with Answer and Decline actions', async () => {
    const sw = loadWorker();
    const finish = await ring(sw, callData());
    const { title, options } = sw.lastNotification();
    expect(title).toBe('Incoming video call · Alice');
    expect(options.tag).toBe('call:c-1');
    expect(options.requireInteraction).toBe(true);
    expect(options.body).toBe('Tap to answer');
    expect(options.actions).toEqual([
      { action: 'answer', title: 'Answer' },
      { action: 'decline', title: 'Decline' },
    ]);
    expect(options.data).toMatchObject({ callId: 'c-1', room: 'app1_a-app1_b' });
    await finish();
  });

  it('treats a push without kind as audio, like the server', async () => {
    const sw = loadWorker();
    const finish = await ring(sw, callData({ kind: undefined }));
    expect(sw.lastNotification().title).toBe('Incoming audio call · Alice');
    await finish();
  });

  it('shows a plain "Missed call" notification for an expired push and never rings', async () => {
    const sw = loadWorker();
    const tab = ackingClient(sw);
    sw.windowClients.push(tab);
    await sw.push({ data: callData({ callToken: makeJwt(NOW_S - 30) }) });

    const { title, options } = sw.lastNotification();
    expect(title).toBe('Missed video call · Alice');
    expect(options.tag).toBe('missed-call:app1_a-app1_b');
    expect(options.requireInteraction).toBe(false);
    expect(options.actions).toBeUndefined();
    // a tap opens the room: the payload carries the room, and nothing a page
    // could take for a call
    expect(options.data).toMatchObject({ type: 'missed-call', jid: 'app1_a-app1_b' });
    expect(options.data.callId).toBeUndefined();
    expect(options.data.callToken).toBeUndefined();
    expect(tab.postMessage).not.toHaveBeenCalled();
  });

  it('counts less than 3 s of token left as expired', async () => {
    const sw = loadWorker();
    await sw.push({ data: callData({ callToken: makeJwt(NOW_S + 2) }) });
    expect(sw.lastNotification().title).toContain('Missed');
    const finish = await ring(sw, callData({ callId: 'c-2', callToken: makeJwt(NOW_S + 4) }));
    expect(sw.lastNotification().title).toContain('Incoming');
    await finish();
  });

  it('rings when the token has no readable exp, and ends the ring 60 s after the push', async () => {
    const sw = loadWorker();
    const dones: Promise<unknown>[] = [];
    for (const [i, callToken] of [makeJwt(), 'not-a-jwt'].entries()) {
      dones.push(sw.push({ data: callData({ callId: `c-${i}`, callToken }) }));
      await sw.advance(0);
      expect(sw.lastNotification().title).toContain('Incoming');
    }
    expect(sw.shown.map((n) => n.tag).sort()).toEqual(['call:c-0', 'call:c-1']);
    await sw.advance(59_000);
    expect(sw.shown.map((n) => n.tag).sort()).toEqual(['call:c-0', 'call:c-1']);
    await sw.advance(1_001);
    await Promise.all(dones);
    // nothing stays sticky: both swapped for the one missed-call of the room
    expect(sw.shown.map((n) => n.tag)).toEqual(['missed-call:app1_a-app1_b']);
    expect(sw.shown.every((n) => n.requireInteraction === false)).toBe(true);
  });

  it('a push without a token cannot be answered: Decline only, tap opens the room', async () => {
    const sw = loadWorker();
    const done = sw.push({ data: callData({ callToken: undefined }) });
    await sw.advance(0);
    const { title, options } = sw.lastNotification();
    expect(title).toBe('Incoming video call · Alice');
    expect(options.actions).toEqual([{ action: 'decline', title: 'Decline' }]);
    expect(options.body).toBe('Tap to open the chat');
    expect(options.requireInteraction).toBe(true);
    await sw.advance(60_000);
    await done;
    expect(sw.lastNotification().title).toBe('Missed video call · Alice');
  });

  describe('page handshake', () => {
    it('shows nothing when a visible page acks the ring', async () => {
      const sw = loadWorker();
      const tab = ackingClient(sw);
      sw.windowClients.push(tab);
      await sw.push({ data: callData() });
      expect(tab.postMessage).toHaveBeenCalledWith({ type: 'CALL_PUSH', data: callData() });
      expect(sw.registration.showNotification).not.toHaveBeenCalled();
    });

    it('shows the notification when no page acks within the timeout', async () => {
      const sw = loadWorker();
      const tab = makeClient(`${ORIGIN}/chat`);
      tab.visibilityState = 'visible';
      sw.windowClients.push(tab);
      const done = sw.push({ data: callData() });
      await sw.advance(1499);
      expect(sw.registration.showNotification).not.toHaveBeenCalled();
      await sw.advance(2);
      expect(sw.registration.showNotification).toHaveBeenCalledTimes(1);
      await sw.advance(60_000);
      await done;
    });

    it('a hidden page is asked too, and with a dead socket nobody acks so the worker notifies', async () => {
      const sw = loadWorker();
      const hidden = makeClient(`${ORIGIN}/chat`);
      sw.windowClients.push(hidden);
      const done = sw.push({ data: callData() });
      await sw.advance(1500);
      expect(hidden.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'CALL_PUSH' }));
      expect(sw.lastNotification().options.tag).toBe('call:c-1');
      await sw.advance(60_000);
      await done;
    });

    it('asks every window, and one ack from any of them is enough', async () => {
      const sw = loadWorker();
      const a = makeClient(`${ORIGIN}/a`);
      const b = ackingClient(sw, `${ORIGIN}/b`);
      sw.windowClients.push(a, b);
      await sw.push({ data: callData() });
      expect(a.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'CALL_PUSH' }));
      expect(sw.registration.showNotification).not.toHaveBeenCalled();
    });

    it('ignores an ack for a different call', async () => {
      const sw = loadWorker();
      const tab = makeClient(`${ORIGIN}/chat`);
      tab.postMessage = vi.fn(() => {
        void sw.fire('message', { data: { type: 'CALL_PUSH_ACK', callId: 'other' }, source: {} });
      });
      sw.windowClients.push(tab);
      const done = sw.push({ data: callData() });
      await sw.advance(1500);
      expect(sw.registration.showNotification).toHaveBeenCalledTimes(1);
      await sw.advance(60_000);
      await done;
    });

    it('does not ask a page about a stale push', async () => {
      const sw = loadWorker();
      const tab = ackingClient(sw);
      sw.windowClients.push(tab);
      await sw.push({ data: callData({ callToken: makeJwt(NOW_S - 1) }) });
      expect(tab.postMessage).not.toHaveBeenCalled();
    });
  });

  describe('ring lifetime', () => {
    it('keeps the push alive until exp, then swaps the ring for "Missed call"', async () => {
      const sw = loadWorker();
      const done = sw.push({ data: callData() });
      let settled = false;
      void done.then(() => {
        settled = true;
      });
      await sw.advance(59_000);
      expect(settled).toBe(false);
      expect(sw.shown.map((n) => n.tag)).toEqual(['call:c-1']);

      await sw.advance(1_000);
      await done;
      expect(sw.shown.map((n) => n.tag)).toEqual(['missed-call:app1_a-app1_b']);
      expect(sw.lastNotification().title).toBe('Missed video call · Alice');
    });

    it('leaves nothing behind when the ring was already tapped away', async () => {
      const sw = loadWorker();
      const done = sw.push({ data: callData() });
      await sw.advance(10_000);
      sw.shown[0].close();
      await sw.advance(50_000);
      await done;
      expect(sw.shown).toHaveLength(0);
      expect(sw.registration.showNotification).toHaveBeenCalledTimes(1);
    });

    it('never holds the push longer than 60 s: a token good for 300 s still ends as "Missed call"', async () => {
      const sw = loadWorker();
      const done = sw.push({ data: callData({ callToken: makeJwt(NOW_S + 300) }) });
      let settled = false;
      void done.then(() => {
        settled = true;
      });
      await sw.advance(59_000);
      expect(settled).toBe(false);
      expect(sw.shown.map((n) => n.tag)).toEqual(['call:c-1']);
      await sw.advance(1_000);
      await done;
      expect(sw.shown.map((n) => n.tag)).toEqual(['missed-call:app1_a-app1_b']);
    });
  });

  describe('notification actions', () => {
    it('Answer with a page open focuses it and delivers the call with the action', async () => {
      const sw = loadWorker();
      const tab = takesClicks(sw, await readyTab(sw));
      const done = sw.push({ data: callData() });
      await sw.advance(1500);
      const shownData = sw.lastNotification().options.data;
      tab.postMessage.mockClear();

      await sw.fire('notificationclick', {
        action: 'answer',
        notification: { data: shownData, title: 'x', body: 'y', close: vi.fn() },
      });

      expect(tab.focus).toHaveBeenCalledTimes(1);
      expect(sw.clientsApi.openWindow).not.toHaveBeenCalled();
      expect(tab.navigate).not.toHaveBeenCalled();
      const first = tab.postMessage.mock.calls[0][0];
      expect(first.type).toBe('PUSH_NOTIFICATION_CLICK');
      expect(first.action).toBe('answer');
      expect(first.data).toMatchObject({ callId: 'c-1', callToken: callData().callToken });
      await sw.advance(61_000);
      await done;
    });

    it('Answer with no page opens the app and hands the action to the new page once', async () => {
      const sw = loadWorker();
      const finish = await ring(sw, callData());
      const shownData = sw.lastNotification().options.data;

      await sw.fire('notificationclick', {
        action: 'answer',
        notification: { data: shownData, title: 'x', body: 'y', close: vi.fn() },
      });

      expect(sw.clientsApi.openWindow).toHaveBeenCalledTimes(1);
      const reply = await sw.requestPending();
      const sent = reply.postMessage.mock.calls[0][0];
      expect(sent).toMatchObject({ type: 'PUSH_NOTIFICATION_CLICK', action: 'answer' });
      expect(sent.data.callId).toBe('c-1');
      expect((await sw.requestPending()).postMessage).not.toHaveBeenCalled();
      await finish();
    });

    it('a plain tap carries no action', async () => {
      const sw = loadWorker();
      const tab = takesClicks(sw, await readyTab(sw));
      await sw.click(callData());
      expect('action' in tab.postMessage.mock.calls[0][0]).toBe(false);
    });

    it('Decline with a page open hands the decline to the page and opens nothing', async () => {
      const sw = loadWorker();
      const tab = makeClient(`${ORIGIN}/chat`);
      tab.postMessage = vi.fn((msg: any) => {
        if (msg.type === 'CALL_PUSH_DECLINE') {
          void sw.fire('message', { data: { type: 'CALL_PUSH_DECLINE_ACK', callId: msg.data.callId }, source: {} });
        }
      });
      sw.windowClients.push(tab);
      const close = vi.fn();

      await sw.fire('notificationclick', {
        action: 'decline',
        notification: { data: callData(), title: 'x', body: 'y', close },
      });

      expect(close).toHaveBeenCalled();
      expect(tab.focus).not.toHaveBeenCalled();
      expect(sw.clientsApi.openWindow).not.toHaveBeenCalled();
      expect(tab.postMessage).toHaveBeenCalledTimes(1);
      expect(tab.postMessage).toHaveBeenCalledWith({ type: 'CALL_PUSH_DECLINE', data: callData() });
      expect(sw.fetchMock).not.toHaveBeenCalled();
    });

    it('Decline with no page declines over REST with the mirrored token, opening nothing', async () => {
      const sw = loadWorker();
      sw.cacheStore.set(
        `${ORIGIN}/__ethora_call_auth__`,
        new Response(JSON.stringify({ apiBaseUrl: 'https://api.test/', token: 'user-jwt' }))
      );

      await sw.fire('notificationclick', {
        action: 'decline',
        notification: { data: callData(), title: 'x', body: 'y', close: vi.fn() },
      });

      expect(sw.clientsApi.openWindow).not.toHaveBeenCalled();
      expect(sw.fetchMock).toHaveBeenCalledTimes(1);
      expect(sw.fetchMock).toHaveBeenCalledWith(
        'https://api.test/v1/chats/call/state/decline/c-1',
        { method: 'POST', headers: { Authorization: 'user-jwt' } }
      );
      // nothing is left for a later page load to replay as a tap
      expect((await sw.requestPending()).postMessage).not.toHaveBeenCalled();
    });

    it('Decline with no page and no mirrored token only closes the notification', async () => {
      const sw = loadWorker();
      const close = vi.fn();
      await sw.fire('notificationclick', {
        action: 'decline',
        notification: { data: callData(), title: 'x', body: 'y', close },
      });
      expect(close).toHaveBeenCalled();
      expect(sw.fetchMock).not.toHaveBeenCalled();
      expect(sw.clientsApi.openWindow).not.toHaveBeenCalled();
    });

    it('a failing REST decline is swallowed', async () => {
      const sw = loadWorker();
      sw.cacheStore.set(
        `${ORIGIN}/__ethora_call_auth__`,
        new Response(JSON.stringify({ apiBaseUrl: 'https://api.test', token: 'user-jwt' }))
      );
      sw.fetchMock.mockRejectedValueOnce(new TypeError('offline'));
      await expect(
        sw.fire('notificationclick', {
          action: 'decline',
          notification: { data: callData(), title: 'x', body: 'y', close: vi.fn() },
        })
      ).resolves.toBeUndefined();
    });

    it('a tap on the missed-call notification opens its room like a message tap', async () => {
      const sw = loadWorker();
      const tab = makeClient(`${ORIGIN}/chat`);
      sw.windowClients.push(tab);
      await sw.push({ data: callData({ callToken: makeJwt(NOW_S - 30) }) });
      await sw.click(sw.lastNotification().options.data);
      expect(tab.postMessage.mock.calls[0][0]).toMatchObject({
        type: 'PUSH_NOTIFICATION_CLICK',
        data: { type: 'missed-call', jid: 'app1_a-app1_b' },
      });
    });
  });
});

describe('service worker call push: page and worker converge', () => {
  const ackWith = (sw: ReturnType<typeof loadWorker>, extra: Record<string, unknown> = {}, url = `${ORIGIN}/chat`) => {
    const client: any = makeClient(url);
    client.postMessage = vi.fn((msg: any) => {
      if (msg.type === 'CALL_PUSH') {
        void sw.fire('message', {
          data: { type: 'CALL_PUSH_ACK', callId: msg.data.callId, ...extra },
          source: {},
        });
      }
    });
    return client;
  };

  describe('a call already in progress on the page', () => {
    it('an ack for the same call means nothing is shown, hidden page or not', async () => {
      const sw = loadWorker();
      sw.windowClients.push(ackWith(sw)); // a hidden page: only the call state made it ack
      await sw.push({ data: callData() });
      expect(sw.registration.showNotification).not.toHaveBeenCalled();
      await sw.advance(61_000);
      expect(sw.registration.showNotification).not.toHaveBeenCalled();
    });

    it('a busy ack shows a non-sticky "Missed call" and no ring', async () => {
      const sw = loadWorker();
      sw.windowClients.push(ackWith(sw, { busy: true }));
      const done = sw.push({ data: callData({ callId: 'c-2' }) });
      await sw.advance(1500);
      await done;
      expect(sw.registration.showNotification).toHaveBeenCalledTimes(1);
      const { title, options } = sw.lastNotification();
      expect(title).toBe('Missed video call · Alice');
      expect(options.tag).toBe('missed-call:app1_a-app1_b');
      expect(options.requireInteraction).toBe(false);
      expect(options.actions).toBeUndefined();
      expect(sw.shown.map((n) => n.tag)).toEqual(['missed-call:app1_a-app1_b']);
    });

    it('a busy ack does not cut the wait short: another tab that rings still wins', async () => {
      const sw = loadWorker();
      const busy = ackWith(sw, { busy: true });
      const idle = makeClient(`${ORIGIN}/other`);
      sw.windowClients.push(busy, idle);
      const done = sw.push({ data: callData() });
      await sw.advance(800);
      // the busy tab answered at once; the idle one rings and acks later
      await sw.fire('message', { data: { type: 'CALL_PUSH_ACK', callId: 'c-1' }, source: {} });
      await done;
      expect(sw.registration.showNotification).not.toHaveBeenCalled();
    });
  });

  describe('a page that times the ring out first', () => {
    const missedFromPage = (callKey = 'c-1') => ({
      type: 'missed-call',
      jid: 'app1_a-app1_b',
      callerName: 'Alice',
      missedCallId: callKey,
      source: 'missed-call',
    });

    it('does not show a second "Missed call" over the page\'s one', async () => {
      const sw = loadWorker();
      const done = sw.push({ data: callData() });
      await sw.advance(10_000);
      // the page closes the ring and shows its own "Missed" a moment before exp
      sw.shown[0].close();
      await sw.registration.showNotification('Missed video call · Alice', {
        tag: 'missed-call:app1_a-app1_b',
        data: missedFromPage(),
      });
      sw.registration.showNotification.mockClear();
      await sw.advance(50_000);
      await done;
      expect(sw.registration.showNotification).not.toHaveBeenCalled();
      expect(sw.shown.map((n) => n.tag)).toEqual(['missed-call:app1_a-app1_b']);
    });

    it('skips its own swap when the page already showed the same missed call', async () => {
      const sw = loadWorker();
      await sw.registration.showNotification('Missed video call · Alice', {
        tag: 'missed-call:app1_a-app1_b',
        data: missedFromPage(),
      });
      sw.registration.showNotification.mockClear();
      await sw.push({ data: callData({ callToken: makeJwt(NOW_S - 30) }) });
      expect(sw.registration.showNotification).not.toHaveBeenCalled();
    });

    it('a missed call of a different call replaces the page\'s one', async () => {
      const sw = loadWorker();
      await sw.registration.showNotification('Missed video call · Alice', {
        tag: 'missed-call:app1_a-app1_b',
        data: missedFromPage('c-0'),
      });
      await sw.push({ data: callData({ callToken: makeJwt(NOW_S - 30) }) });
      expect(sw.shown).toHaveLength(1);
      expect(sw.shown[0].data.missedCallId).toBe('c-1');
    });

    it('the missed call carries the same fields the page uses', async () => {
      const sw = loadWorker();
      await sw.push({ data: callData({ callToken: makeJwt(NOW_S - 30) }) });
      expect(sw.lastNotification().options.data).toMatchObject(missedFromPage());
    });
  });

  describe('Decline hand-off', () => {
    const authCache = (sw: ReturnType<typeof loadWorker>) =>
      sw.cacheStore.set(
        `${ORIGIN}/__ethora_call_auth__`,
        new Response(JSON.stringify({ apiBaseUrl: 'https://api.test', token: 'user-jwt' }))
      );
    const decline = (sw: ReturnType<typeof loadWorker>) =>
      sw.fire('notificationclick', {
        action: 'decline',
        notification: { data: callData(), title: 'x', body: 'y', close: vi.fn() },
      });

    it('declines over REST itself when the chosen window never acks', async () => {
      const sw = loadWorker();
      authCache(sw);
      const tab = makeClient(`${ORIGIN}/no-chat-here`);
      sw.windowClients.push(tab);
      const pending = decline(sw);
      await sw.advance(1499);
      expect(sw.fetchMock).not.toHaveBeenCalled();
      await sw.advance(2);
      await pending;
      expect(tab.postMessage).toHaveBeenCalledWith({ type: 'CALL_PUSH_DECLINE', data: callData() });
      expect(sw.fetchMock).toHaveBeenCalledTimes(1);
      expect(sw.fetchMock).toHaveBeenCalledWith('https://api.test/v1/chats/call/state/decline/c-1', {
        method: 'POST',
        headers: { Authorization: 'user-jwt' },
      });
    });

    it('does not decline over REST when the page acked', async () => {
      const sw = loadWorker();
      authCache(sw);
      const tab = makeClient(`${ORIGIN}/chat`);
      tab.postMessage = vi.fn((msg: any) => {
        if (msg.type === 'CALL_PUSH_DECLINE') {
          void sw.fire('message', { data: { type: 'CALL_PUSH_DECLINE_ACK', callId: 'c-1' }, source: {} });
        }
      });
      sw.windowClients.push(tab);
      await decline(sw);
      await sw.advance(5_000);
      expect(sw.fetchMock).not.toHaveBeenCalled();
    });

    it('a decline ack for another call does not count', async () => {
      const sw = loadWorker();
      authCache(sw);
      const tab = makeClient(`${ORIGIN}/chat`);
      tab.postMessage = vi.fn(() => {
        void sw.fire('message', { data: { type: 'CALL_PUSH_DECLINE_ACK', callId: 'other' }, source: {} });
      });
      sw.windowClients.push(tab);
      const pending = decline(sw);
      await sw.advance(1500);
      await pending;
      expect(sw.fetchMock).toHaveBeenCalledTimes(1);
    });

    it('an unacked decline with no mirrored token ends quietly', async () => {
      const sw = loadWorker();
      sw.windowClients.push(makeClient(`${ORIGIN}/chat`));
      const pending = decline(sw);
      await sw.advance(1500);
      await expect(pending).resolves.toBeUndefined();
      expect(sw.fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('where a call tap opens', () => {
    const withClickPath = () => loadWorker('?clickPath=%2Fapp%2Fchat');

    it('a call notification names the configured click url, not the origin root', async () => {
      const sw = withClickPath();
      const done = sw.push({ data: callData() });
      await sw.advance(0);
      expect(sw.lastNotification().options.data).toMatchObject({
        url: `${ORIGIN}/app/chat`,
        urlExplicit: false,
      });
      await sw.advance(61_000);
      await done;
    });

    it('ignores a url the call payload names and never puts call data in the url', async () => {
      const sw = withClickPath();
      const done = sw.push({ data: callData({ url: 'https://evil.test/x?t=1', link: '/elsewhere' }) });
      await sw.advance(0);
      const shown = sw.lastNotification().options.data;
      expect(shown.url).toBe(`${ORIGIN}/app/chat`);
      expect(shown.urlExplicit).toBe(false);

      await sw.fire('notificationclick', {
        action: 'answer',
        notification: { data: shown, title: 'x', body: 'y', close: vi.fn() },
      });
      expect(sw.clientsApi.openWindow).toHaveBeenCalledTimes(1);
      const opened = String(sw.clientsApi.openWindow.mock.calls[0][0]);
      expect(opened).toBe(`${ORIGIN}/app/chat`);
      expect(opened).not.toContain('c-1');
      expect(opened).not.toContain('fromPush');
      expect(opened).not.toContain(callData().callToken);
      // the call travels in the pending click
      const reply = await sw.requestPending();
      expect(reply.postMessage.mock.calls[0][0]).toMatchObject({
        action: 'answer',
        data: { callId: 'c-1', callToken: callData().callToken },
      });
      await sw.advance(61_000);
      await done;
    });

    it('a cold tap on the call notification opens the click url too', async () => {
      const sw = withClickPath();
      const done = sw.push({ data: callData() });
      await sw.advance(0);
      await sw.click(sw.lastNotification().options.data);
      expect(sw.clientsApi.openWindow).toHaveBeenCalledWith(`${ORIGIN}/app/chat`);
      await sw.advance(61_000);
      await done;
    });

    it('the missed-call notification opens the click url', async () => {
      const sw = withClickPath();
      await sw.push({ data: callData({ callToken: makeJwt(NOW_S - 30) }) });
      expect(sw.lastNotification().options.data.url).toBe(`${ORIGIN}/app/chat`);
      await sw.click(sw.lastNotification().options.data);
      expect(String(sw.clientsApi.openWindow.mock.calls[0][0])).toContain('/app/chat');
    });

    it('falls back to the origin root when no click path is configured', async () => {
      const sw = loadWorker();
      const done = sw.push({ data: callData() });
      await sw.advance(0);
      expect(sw.lastNotification().options.data.url).toBe(`${ORIGIN}/`);
      await sw.advance(61_000);
      await done;
    });
  });

  describe('a push without callId', () => {
    const noId = () => callData({ callId: undefined });

    it('goes by the room on both sides: one notification, tag call:room:<room>', async () => {
      const sw = loadWorker();
      const done = sw.push({ data: noId() });
      await sw.advance(0);
      expect(sw.shown.map((n) => n.tag)).toEqual(['call:room:app1_a-app1_b']);
      // the page ringing the same call replaces it (same tag), it does not add
      await sw.registration.showNotification('Incoming video call · Alice', {
        tag: 'call:room:app1_a-app1_b',
      });
      expect(sw.shown).toHaveLength(1);
      await sw.advance(61_000);
      await done;
    });

    it('the ack handshake and the later swap use that key too', async () => {
      const sw = loadWorker();
      const tab = ackWith(sw);
      sw.windowClients.push(tab);
      await sw.push({ data: noId() });
      expect(sw.registration.showNotification).not.toHaveBeenCalled();
    });

    it('a room given as a full jid has the same key', async () => {
      const sw = loadWorker();
      const done = sw.push({ data: callData({ callId: undefined, room: undefined, jid: 'app1_a-app1_b@conference.xmpp.test' }) });
      await sw.advance(0);
      expect(sw.shown.map((n) => n.tag)).toEqual(['call:room:app1_a-app1_b']);
      await sw.advance(61_000);
      await done;
      expect(sw.shown.map((n) => n.tag)).toEqual(['missed-call:app1_a-app1_b']);
    });

    it('is shown once, not swapped for a false "Missed" while the page keeps ringing', async () => {
      const sw = loadWorker();
      const done = sw.push({ data: noId() });
      await sw.advance(30_000);
      // the page's ring ended: it closed the shared tag
      sw.shown[0].close();
      await sw.advance(31_000);
      await done;
      expect(sw.shown).toHaveLength(0);
    });
  });
});

// ── Answer / tap, Decline: which window gets them ─────────────
describe('service worker call click: picking the window', () => {
  const answer = (sw: ReturnType<typeof loadWorker>, action = 'answer', data: Record<string, unknown> = callData()) =>
    sw.fire('notificationclick', {
      action,
      notification: { data, title: 'x', body: 'y', close: vi.fn() },
    });

  it('hands the click to every open window and the one that took it ends the wait', async () => {
    const sw = loadWorker();
    const host = hostTab(sw, `${ORIGIN}/apps`, { focused: true });
    const chat = takesClicks(sw, await readyTab(sw, `${ORIGIN}/chat`));

    await answer(sw);

    // /apps was focused last, but it has no chat: the ready tab is the one focused
    expect(chat.focus).toHaveBeenCalledTimes(1);
    expect(host.focus).not.toHaveBeenCalled();
    expect(host.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'PUSH_NOTIFICATION_CLICK', action: 'answer' }));
    expect(chat.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'PUSH_NOTIFICATION_CLICK', action: 'answer' }));
    expect(host.navigate).not.toHaveBeenCalled();
    expect(chat.navigate).not.toHaveBeenCalled();
    expect(sw.clientsApi.openWindow).not.toHaveBeenCalled();
    // an ack means nothing is left for a later page load to replay
    expect((await sw.requestPending()).postMessage).not.toHaveBeenCalled();
  });

  it('a plain tap goes the same way', async () => {
    const sw = loadWorker();
    hostTab(sw, `${ORIGIN}/apps`, { focused: true });
    const chat = takesClicks(sw, await readyTab(sw));
    await answer(sw, '');
    expect(chat.postMessage.mock.calls.some(([m]: any[]) => m.type === 'PUSH_NOTIFICATION_CLICK' && !('action' in m))).toBe(true);
    expect(sw.clientsApi.openWindow).not.toHaveBeenCalled();
  });

  it('focuses the window that took it when that is not the one it focused first', async () => {
    const sw = loadWorker();
    const first = await readyTab(sw, `${ORIGIN}/chat`, { focused: true });
    const second = takesClicks(sw, await readyTab(sw, `${ORIGIN}/chat?x=1`));
    await answer(sw);
    expect(first.focus).toHaveBeenCalledTimes(1);
    expect(second.focus).toHaveBeenCalledTimes(1);
    expect(first.navigate).not.toHaveBeenCalled();
  });

  it('with only a host page open (no chat on it) does not wait: it focuses and navigates that tab and keeps the click', async () => {
    const sw = loadWorker();
    const apps = hostTab(sw, `${ORIGIN}/apps`);
    await answer(sw); // resolves without the clock moving: nothing to wait for
    expect(apps.postMessage).not.toHaveBeenCalled();
    expect(apps.focus).toHaveBeenCalledTimes(1);
    expect(apps.navigate).toHaveBeenCalledWith(`${ORIGIN}/`);
    expect(apps.focus.mock.invocationCallOrder[0]).toBeLessThan(apps.navigate.mock.invocationCallOrder[0]);
    expect(sw.clientsApi.openWindow).not.toHaveBeenCalled();
    const reply = await sw.requestPending();
    const sent = reply.postMessage.mock.calls[0][0];
    expect(sent).toMatchObject({ type: 'PUSH_NOTIFICATION_CLICK', action: 'answer' });
    expect(sent.data.callId).toBe('c-1');
  });

  it('navigates to the configured click path', async () => {
    const sw = loadWorker('?clickPath=%2Fapp%2Fchat');
    const apps = hostTab(sw, `${ORIGIN}/apps`);
    await answer(sw);
    expect(apps.navigate).toHaveBeenCalledWith(`${ORIGIN}/app/chat`);
  });

  it('opens a window when no open tab can be navigated, and when navigate is refused', async () => {
    const swA = loadWorker();
    const refusing = hostTab(swA);
    refusing.navigate = vi.fn(async () => {
      throw new TypeError('uncontrolled client');
    });
    await answer(swA);
    expect(swA.clientsApi.openWindow).toHaveBeenCalledWith(`${ORIGIN}/`);
    expect((await swA.requestPending()).postMessage).toHaveBeenCalledTimes(1);

    const swB = loadWorker();
    const noNavigate = hostTab(swB);
    delete (noNavigate as any).navigate;
    await answer(swB);
    expect(swB.clientsApi.openWindow).toHaveBeenCalledTimes(1);
  });

  it('tries the next tab when the first one refuses to navigate', async () => {
    const sw = loadWorker();
    const first = hostTab(sw, `${ORIGIN}/a`, { focused: true });
    first.navigate = vi.fn(async () => {
      throw new TypeError('uncontrolled client');
    });
    const second = hostTab(sw, `${ORIGIN}/b`);
    await answer(sw);
    expect(second.navigate).toHaveBeenCalledWith(`${ORIGIN}/`);
    expect(sw.clientsApi.openWindow).not.toHaveBeenCalled();
  });

  it('a refused openWindow (user activation spent) is swallowed and the click waits for the next page load', async () => {
    const sw = loadWorker();
    sw.clientsApi.openWindow.mockRejectedValueOnce(new Error('not allowed'));
    const tab = await readyTab(sw);
    const pending = answer(sw);
    await sw.advance(1500);
    await expect(pending).resolves.toBeUndefined();
    expect(tab.navigate).not.toHaveBeenCalled();
    expect((await sw.requestPending()).postMessage).toHaveBeenCalledTimes(1);
  });

  it('a ready window that never acks: after 1500 ms the click is kept and another tab is navigated, never the ready one', async () => {
    const sw = loadWorker();
    const silent = await readyTab(sw, `${ORIGIN}/chat`);
    const apps = hostTab(sw, `${ORIGIN}/apps`);
    const pending = answer(sw);
    await sw.advance(1499);
    expect(apps.navigate).not.toHaveBeenCalled();
    await sw.advance(2);
    await pending;
    expect(silent.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'PUSH_NOTIFICATION_CLICK' }));
    expect(silent.navigate).not.toHaveBeenCalled();
    expect(apps.navigate).toHaveBeenCalledWith(`${ORIGIN}/`);
    expect((await sw.requestPending()).postMessage).toHaveBeenCalledTimes(1);
  });

  it('only ready windows and none acks: opens a window rather than reloading a tab that may be mid-call', async () => {
    const sw = loadWorker();
    const silent = await readyTab(sw);
    const pending = answer(sw);
    await sw.advance(1500);
    await pending;
    expect(silent.navigate).not.toHaveBeenCalled();
    expect(sw.clientsApi.openWindow).toHaveBeenCalledTimes(1);
  });

  it('an ack for another call does not end the wait', async () => {
    const sw = loadWorker();
    const tab = await readyTab(sw);
    tab.postMessage = vi.fn(() => {
      void sw.fire('message', { data: { type: 'CALL_PUSH_ANSWER_ACK', callId: 'other' }, source: { id: tab.id } });
    });
    const pending = answer(sw);
    await sw.advance(1500);
    await pending;
    expect(sw.clientsApi.openWindow).toHaveBeenCalledTimes(1);
  });

  it('a window that says it can no longer take calls is not asked', async () => {
    const sw = loadWorker();
    const tab = await readyTab(sw);
    await sw.fire('message', { data: { type: 'CALL_CLIENT_READY', ready: false }, source: { id: tab.id } });
    await answer(sw);
    expect(tab.postMessage).not.toHaveBeenCalled();
    expect(tab.navigate).toHaveBeenCalledTimes(1);
  });

  it('a window gone from the open list is forgotten', async () => {
    const sw = loadWorker();
    const gone = await readyTab(sw);
    sw.windowClients.splice(sw.windowClients.indexOf(gone), 1);
    const other = hostTab(sw);
    await answer(sw);
    expect(other.navigate).toHaveBeenCalledTimes(1);
    expect(gone.postMessage).not.toHaveBeenCalled();
  });

  it('with no window open it still opens the app and keeps the click', async () => {
    const sw = loadWorker();
    await answer(sw);
    expect(sw.clientsApi.openWindow).toHaveBeenCalledWith(`${ORIGIN}/`);
    expect((await sw.requestPending()).postMessage).toHaveBeenCalledTimes(1);
  });

  describe('a worker that has just started', () => {
    it('probes the open windows, and gives them a moment to answer before deciding nobody can take the call', async () => {
      const chat: any = makeClient(`${ORIGIN}/chat`, { id: 'early' });
      const sw = loadWorker('', [chat]);
      await sw.tick();
      expect(chat.postMessage).toHaveBeenCalledWith({ type: 'CALL_CLIENT_PROBE' });
      takesClicks(sw, chat);
      sw.windowClients.push(chat);

      const pending = answer(sw);
      await sw.advance(100);
      // the page answers its probe
      await sw.fire('message', { data: { type: 'CALL_CLIENT_READY' }, source: { id: 'early' } });
      await sw.advance(300);
      await pending;
      expect(chat.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'PUSH_NOTIFICATION_CLICK' }));
      expect(chat.navigate).not.toHaveBeenCalled();
    });

    it('moves on after the grace when no page answers the probe', async () => {
      const apps: any = makeClient(`${ORIGIN}/apps`, { id: 'early' });
      const sw = loadWorker('', [apps]);
      await sw.tick();
      sw.windowClients.push(apps);
      const pending = answer(sw);
      await sw.advance(299);
      expect(apps.navigate).not.toHaveBeenCalled();
      await sw.advance(2);
      await pending;
      expect(apps.navigate).toHaveBeenCalledWith(`${ORIGIN}/`);
    });
  });
});

describe('service worker call decline: picking the window', () => {
  const decline = (sw: ReturnType<typeof loadWorker>) =>
    sw.fire('notificationclick', {
      action: 'decline',
      notification: { data: callData(), title: 'x', body: 'y', close: vi.fn() },
    });
  const authCache = (sw: ReturnType<typeof loadWorker>) =>
    sw.cacheStore.set(
      `${ORIGIN}/__ethora_call_auth__`,
      new Response(JSON.stringify({ apiBaseUrl: 'https://api.test', token: 'user-jwt' }))
    );

  it('asks every open window, and an ack from any of them is the decline', async () => {
    const sw = loadWorker();
    authCache(sw);
    const host = hostTab(sw, `${ORIGIN}/apps`, { focused: true });
    const chat = await readyTab(sw);
    chat.postMessage = vi.fn((msg: any) => {
      if (msg.type === 'CALL_PUSH_DECLINE') {
        void sw.fire('message', { data: { type: 'CALL_PUSH_DECLINE_ACK', callId: msg.data.callId }, source: { id: chat.id } });
      }
    });
    await decline(sw);
    expect(host.postMessage).toHaveBeenCalledWith({ type: 'CALL_PUSH_DECLINE', data: callData() });
    expect(chat.postMessage).toHaveBeenCalledWith({ type: 'CALL_PUSH_DECLINE', data: callData() });
    expect(sw.fetchMock).not.toHaveBeenCalled();
    expect(sw.clientsApi.openWindow).not.toHaveBeenCalled();
  });

  it('declines over REST once when no window takes it', async () => {
    const sw = loadWorker();
    authCache(sw);
    hostTab(sw, `${ORIGIN}/apps`, { focused: true });
    hostTab(sw, `${ORIGIN}/other`);
    const pending = decline(sw);
    await sw.advance(1500);
    await pending;
    expect(sw.fetchMock).toHaveBeenCalledTimes(1);
  });
});

// ── a ring a page shows ───────────────────────────────────────
describe('service worker: a ring shown by a page', () => {
  const pageRing = (sw: ReturnType<typeof loadWorker>, key = 'c-1') =>
    sw.registration.showNotification('Incoming video call · Alice', {
      tag: `call:${key}`,
      requireInteraction: true,
      data: { type: 'call', callId: key, callToken: makeJwt(NOW_S + 30), room: 'app1_a-app1_b', kind: 'video', callerName: 'Alice' },
    });
  const ringShown = (sw: ReturnType<typeof loadWorker>, extra: Record<string, unknown> = {}) =>
    sw.fire('message', {
      data: {
        type: 'CALL_RING_SHOWN',
        key: 'c-1',
        exp: (NOW_S + 30) * 1000,
        data: { callId: 'c-1', room: 'app1_a-app1_b', kind: 'video', callerName: 'Alice' },
        ...extra,
      },
      source: { id: 'page' },
    });

  it('ends it at the token exp: the ring is swapped for "Missed call" with no page left to do it', async () => {
    const sw = loadWorker();
    await pageRing(sw);
    const handled = ringShown(sw);
    await sw.advance(29_999);
    expect(sw.shown.map((n) => n.tag)).toEqual(['call:c-1']);
    await sw.advance(2);
    await handled;
    expect(sw.shown.map((n) => n.tag)).toEqual(['missed-call:app1_a-app1_b']);
    expect(sw.lastNotification().title).toBe('Missed video call · Alice');
    expect(sw.lastNotification().options.data).toMatchObject({ type: 'missed-call', missedCallId: 'c-1', jid: 'app1_a-app1_b' });
  });

  it('never holds a ring longer than 60 s, with a far exp or none', async () => {
    for (const exp of [(NOW_S + 300) * 1000, null, undefined]) {
      const sw = loadWorker();
      await pageRing(sw);
      const handled = ringShown(sw, { exp });
      await sw.advance(59_999);
      expect(sw.shown.map((n) => n.tag)).toEqual(['call:c-1']);
      await sw.advance(2);
      await handled;
      expect(sw.shown.map((n) => n.tag)).toEqual(['missed-call:app1_a-app1_b']);
    }
  });

  it('leaves nothing behind when the ring was answered or dismissed first', async () => {
    const sw = loadWorker();
    await pageRing(sw);
    const handled = ringShown(sw);
    await sw.advance(10_000);
    sw.shown[0].close();
    await sw.advance(30_000);
    await handled;
    expect(sw.shown).toEqual([]);
  });

  it('a second notice for the same ring does not make a second Missed call', async () => {
    const sw = loadWorker();
    await pageRing(sw);
    const a = ringShown(sw);
    const b = ringShown(sw);
    await sw.advance(31_000);
    await Promise.all([a, b]);
    const missed = (sw.registration.showNotification.mock.calls as any[]).filter(([, o]) => String(o.tag).startsWith('missed-call:'));
    expect(missed).toHaveLength(1);
  });

  it('keeps the worker alive for the ring: the message handler waits until it is over', async () => {
    const sw = loadWorker();
    await pageRing(sw);
    let settled = false;
    const handled = ringShown(sw).then(() => {
      settled = true;
    });
    await sw.advance(10_000);
    expect(settled).toBe(false);
    await sw.advance(21_000);
    await handled;
    expect(settled).toBe(true);
  });

  it('works for a call that has no callId (keyed by room)', async () => {
    const sw = loadWorker();
    await sw.registration.showNotification('Incoming video call', {
      tag: 'call:room:app1_a-app1_b',
      data: { type: 'call', room: 'app1_a-app1_b', kind: 'video' },
    });
    const handled = sw.fire('message', {
      data: { type: 'CALL_RING_SHOWN', key: 'room:app1_a-app1_b', exp: (NOW_S + 5) * 1000, data: { room: 'app1_a-app1_b', kind: 'video' } },
      source: {},
    });
    await sw.advance(6_000);
    await handled;
    expect(sw.shown.map((n) => n.tag)).toEqual(['missed-call:app1_a-app1_b']);
  });

  it('ignores a notice with no key', async () => {
    const sw = loadWorker();
    await sw.fire('message', { data: { type: 'CALL_RING_SHOWN', exp: 1, data: {} }, source: {} });
    expect(sw.registration.getNotifications).not.toHaveBeenCalled();
  });
});

// ── Missed call: one alert, and it always lands ───────────────
describe('service worker: the "Missed call" notification', () => {
  const fakeLocks = () => {
    let tail: Promise<unknown> = Promise.resolve();
    return {
      request: vi.fn((_name: string, cb: (lock: unknown) => Promise<unknown>) => {
        const run = tail.then(() => cb({}));
        tail = run.then(
          () => undefined,
          () => undefined
        );
        return run;
      }),
    };
  };
  const staleCall = () => callData({ callToken: makeJwt(NOW_S - 30) });

  it('two ends of the same ring at once show it once (the page and the worker share a lock)', async () => {
    const sw = loadWorker();
    const locks = fakeLocks();
    sw.sandbox.navigator = { locks };
    await Promise.all([sw.push({ data: staleCall() }), sw.push({ data: staleCall() })]);
    expect(sw.registration.showNotification).toHaveBeenCalledTimes(1);
    expect(locks.request).toHaveBeenCalledWith('ethora-missed-call:missed-call:app1_a-app1_b', expect.any(Function));
  });

  it('still shows it when Web Locks is missing or refuses', async () => {
    const swA = loadWorker();
    await swA.push({ data: staleCall() });
    expect(swA.registration.showNotification).toHaveBeenCalledTimes(1);

    const swB = loadWorker();
    swB.sandbox.navigator = { locks: { request: vi.fn(async () => { throw new Error('SecurityError'); }) } };
    await swB.push({ data: staleCall() });
    expect(swB.registration.showNotification).toHaveBeenCalledTimes(1);
  });

  it('a timer that fires a millisecond early still ends the ring', async () => {
    const sw = loadWorker();
    const realSetTimeout = sw.sandbox.setTimeout;
    let early = true;
    sw.sandbox.setTimeout = (cb: () => void, ms: number) => {
      const shortBy = early ? 1 : 0;
      early = false;
      return realSetTimeout(cb, Math.max(0, ms - shortBy));
    };
    const done = sw.push({ data: callData() });
    await sw.advance(60_000);
    await done;
    expect(sw.shown.map((n) => n.tag)).toEqual(['missed-call:app1_a-app1_b']);
  });
});
