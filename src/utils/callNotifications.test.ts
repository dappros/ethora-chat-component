import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CALL_NOTIFICATION_ACTIONS,
  callNotificationKey,
  closeAllCallNotifications,
  closeCallNotifications,
  showCallNotification,
  showMissedCallNotification,
} from './callNotifications';

const OPTIONS = { body: 'Tap to answer', tag: 'call:c-1', requireInteraction: true, data: { callId: 'c-1' } };

describe('call notifications', () => {
  let notificationCtor: ReturnType<typeof vi.fn>;
  let instances: { title: string; options: any; close: ReturnType<typeof vi.fn>; onclick: any }[];
  let registration: any;
  let open: { tag: string; close: ReturnType<typeof vi.fn> }[];

  beforeEach(() => {
    instances = [];
    notificationCtor = vi.fn();
    (window as any).Notification = function (title: string, options: any) {
      notificationCtor(title, options);
      const instance = { title, options, data: options?.data, close: vi.fn(), onclick: null };
      instances.push(instance);
      return instance;
    };
    (window as any).Notification.permission = 'granted';
    open = [];
    registration = {
      active: {},
      showNotification: vi.fn(async () => undefined),
      getNotifications: vi.fn(async ({ tag }: { tag: string }) => open.filter((n) => n.tag === tag)),
    };
    (navigator as any).serviceWorker = { getRegistration: vi.fn(async () => registration) };
  });

  afterEach(() => {
    delete (window as any).Notification;
    delete (navigator as any).serviceWorker;
  });

  it('prefers the service worker registration and gives the notification Answer / Decline actions', async () => {
    await showCallNotification('Incoming call', OPTIONS, { useServiceWorker: true });
    expect(registration.showNotification).toHaveBeenCalledWith('Incoming call', {
      ...OPTIONS,
      actions: CALL_NOTIFICATION_ACTIONS,
    });
    expect(notificationCtor).not.toHaveBeenCalled();
  });

  it('replaces the worker ring of the same call when one side keyed it by room (no callId)', async () => {
    const workerRing = { tag: 'call:c-9', data: { jid: 'app1_room1@conference.x' }, close: vi.fn() };
    const otherRoom = { tag: 'call:room:app1_other', data: { room: 'app1_other@conference.x' }, close: vi.fn() };
    const otherCall = { tag: 'call:c-7', data: { jid: 'app1_room1@conference.x' }, close: vi.fn() };
    registration.getNotifications = vi.fn(async () => [workerRing, otherRoom, otherCall]);
    await showCallNotification(
      'Incoming call',
      { ...OPTIONS, tag: 'call:room:app1_room1', data: { room: 'app1_room1@conference.x' } },
      { useServiceWorker: true }
    );
    expect(workerRing.close).toHaveBeenCalled();
    expect(otherRoom.close).not.toHaveBeenCalled();
    // A callId-keyed ring of the same room is closed only because ours has no callId.
    expect(otherCall.close).toHaveBeenCalled();
    expect(registration.showNotification).toHaveBeenCalled();
  });

  it('leaves another call of the same room alone when both carry a callId', async () => {
    const otherCall = { tag: 'call:c-7', data: { jid: 'app1_room1@conference.x' }, close: vi.fn() };
    registration.getNotifications = vi.fn(async () => [otherCall]);
    await showCallNotification('Incoming call', { ...OPTIONS, data: { callId: 'c-1', room: 'app1_room1@conference.x' } }, { useServiceWorker: true });
    expect(otherCall.close).not.toHaveBeenCalled();
  });

  it('falls back to new Notification, without actions (the constructor throws on them)', async () => {
    registration = null;
    await showCallNotification('Incoming call', OPTIONS, { useServiceWorker: true });
    expect(notificationCtor).toHaveBeenCalledWith('Incoming call', OPTIONS);
    expect(notificationCtor.mock.calls[0][1].actions).toBeUndefined();
  });

  it('uses new Notification when no service worker is wanted', async () => {
    await showCallNotification('Incoming call', OPTIONS, { useServiceWorker: false });
    expect(registration.showNotification).not.toHaveBeenCalled();
    expect(notificationCtor).toHaveBeenCalledTimes(1);
  });

  it('falls back when the registration refuses the notification', async () => {
    registration.showNotification.mockRejectedValueOnce(new TypeError('no'));
    await showCallNotification('Incoming call', OPTIONS, { useServiceWorker: true });
    expect(notificationCtor).toHaveBeenCalledTimes(1);
  });

  it('shows nothing without permission', async () => {
    (window as any).Notification.permission = 'denied';
    await showCallNotification('Incoming call', OPTIONS, { useServiceWorker: true });
    expect(registration.showNotification).not.toHaveBeenCalled();
    expect(notificationCtor).not.toHaveBeenCalled();
  });

  it('closes the page notification and everything the worker shows under the call tag', async () => {
    await showCallNotification('Incoming call', OPTIONS, { useServiceWorker: false });
    const fromWorker = { tag: 'call:c-1', close: vi.fn() };
    const other = { tag: 'call:c-2', close: vi.fn() };
    open.push(fromWorker, other);

    await closeCallNotifications('c-1');

    expect(instances[0].close).toHaveBeenCalledTimes(1);
    expect(registration.getNotifications).toHaveBeenCalledWith({ tag: 'call:c-1' });
    expect(fromWorker.close).toHaveBeenCalledTimes(1);
    expect(other.close).not.toHaveBeenCalled();
  });

  it('closing with nothing open, or no worker, is harmless', async () => {
    registration = null;
    await expect(closeCallNotifications('nope')).resolves.toBeUndefined();
    delete (navigator as any).serviceWorker;
    await expect(closeCallNotifications('nope')).resolves.toBeUndefined();
  });

  describe('telling the worker about a ring the page shows (CALL_RING_SHOWN)', () => {
    let controller: { postMessage: ReturnType<typeof vi.fn> };
    beforeEach(() => {
      controller = { postMessage: vi.fn() };
      (navigator as any).serviceWorker = {
        getRegistration: vi.fn(async () => registration),
        controller,
      };
    });
    const RING = {
      body: 'Tap to answer',
      tag: 'call:c-1',
      icon: '/i.png',
      badge: '/b.png',
      requireInteraction: true,
      data: {
        type: 'call',
        callId: 'c-1',
        callToken: 'SECRET.TOKEN.VALUE',
        room: 'a-b',
        kind: 'video',
        callerName: 'Alice',
        callerXmppUsername: 'a',
      },
    };

    it('posts the key, the exp and only what the Missed call needs, never the token', async () => {
      await showCallNotification('Incoming call', RING, { useServiceWorker: true, expiresAt: 1_700_000_030_000 });
      await vi.waitFor(() => expect(controller.postMessage).toHaveBeenCalledTimes(1));
      const sent = controller.postMessage.mock.calls[0][0];
      expect(sent).toEqual({
        type: 'CALL_RING_SHOWN',
        key: 'c-1',
        exp: 1_700_000_030_000,
        data: { callId: 'c-1', room: 'a-b', kind: 'video', callerName: 'Alice' },
        icon: '/i.png',
        badge: '/b.png',
      });
      expect(JSON.stringify(sent)).not.toContain('SECRET');
    });

    it('sends a null exp when the token has none, and keys a room-only call by its room', async () => {
      await showCallNotification(
        'Incoming call',
        { ...RING, tag: 'call:room:a-b', data: { type: 'call', room: 'a-b', kind: 'audio' } },
        { useServiceWorker: true }
      );
      await vi.waitFor(() => expect(controller.postMessage).toHaveBeenCalledTimes(1));
      expect(controller.postMessage.mock.calls[0][0]).toMatchObject({ key: 'room:a-b', exp: null });
    });

    it('does not post for a notification the page makes itself (no worker to end it)', async () => {
      await showCallNotification('Incoming call', RING, { useServiceWorker: false });
      registration = null;
      await showCallNotification('Incoming call', RING, { useServiceWorker: true });
      await new Promise((r) => setTimeout(r, 0));
      expect(controller.postMessage).not.toHaveBeenCalled();
    });

    it('does not post when the registration refused the ring', async () => {
      registration.showNotification.mockRejectedValueOnce(new TypeError('no'));
      await showCallNotification('Incoming call', RING, { useServiceWorker: true });
      await new Promise((r) => setTimeout(r, 0));
      expect(controller.postMessage).not.toHaveBeenCalled();
      expect(notificationCtor).toHaveBeenCalledTimes(1);
    });
  });

  describe('closeAllCallNotifications', () => {
    it('closes every ring and missed call, the page\'s own and the worker\'s, and nothing else', async () => {
      await showCallNotification('Incoming call', OPTIONS, { useServiceWorker: false });
      const ring = { tag: 'call:c-2', close: vi.fn() };
      const missed = { tag: 'missed-call:room-x', close: vi.fn() };
      const message = { tag: 'ethora-room-abc', close: vi.fn() };
      registration.getNotifications = vi.fn(async () => [ring, missed, message]);

      await closeAllCallNotifications();

      expect(instances[0].close).toHaveBeenCalledTimes(1);
      expect(ring.close).toHaveBeenCalledTimes(1);
      expect(missed.close).toHaveBeenCalledTimes(1);
      expect(message.close).not.toHaveBeenCalled();
      // the page's own one is forgotten, so closing again does not touch it
      await closeAllCallNotifications();
      expect(instances[0].close).toHaveBeenCalledTimes(1);
    });

    it('is harmless with no worker', async () => {
      registration = null;
      await expect(closeAllCallNotifications()).resolves.toBeUndefined();
      delete (navigator as any).serviceWorker;
      await expect(closeAllCallNotifications()).resolves.toBeUndefined();
    });
  });

  describe('callNotificationKey', () => {
    it('is the callId when there is one', () => {
      expect(callNotificationKey('c-1', 'room@conference.x')).toBe('c-1');
    });

    it('falls back to the room bare name, for a bare name or a full jid alike', () => {
      expect(callNotificationKey(null, 'a-b')).toBe('room:a-b');
      expect(callNotificationKey('', 'a-b@conference.xmpp.test')).toBe('room:a-b');
      expect(callNotificationKey(undefined, ' a-b ')).toBe('room:a-b');
    });

    it('has a last resort when it knows nothing', () => {
      expect(callNotificationKey(null, null)).toBe('incoming-call');
    });
  });

  describe('showMissedCallNotification', () => {
    const MISSED = { key: 'c-1', kind: 'video' as const, callerName: 'Alice', roomBareName: 'a-b' };

    it('shows the worker\'s "Missed call" through the registration: same tag, same data fields', async () => {
      await showMissedCallNotification(MISSED, { useServiceWorker: true, icon: '/i.png', badge: '/b.png' });
      expect(registration.showNotification).toHaveBeenCalledTimes(1);
      const [title, options] = registration.showNotification.mock.calls[0];
      expect(title).toBe('Missed video call · Alice');
      expect(options).toMatchObject({
        tag: 'missed-call:a-b',
        body: 'Tap to open the chat',
        requireInteraction: false,
        renotify: true,
        icon: '/i.png',
        badge: '/b.png',
        data: { type: 'missed-call', jid: 'a-b', callerName: 'Alice', missedCallId: 'c-1', source: 'missed-call' },
      });
      expect(options.actions).toBeUndefined();
      expect(options.data.callId).toBeUndefined();
    });

    it('uses a bare room name for a full jid, and the audio wording', async () => {
      await showMissedCallNotification(
        { ...MISSED, kind: 'audio', callerName: null, roomBareName: 'a-b@conference.x' },
        { useServiceWorker: true }
      );
      const [title, options] = registration.showNotification.mock.calls[0];
      expect(title).toBe('Missed audio call');
      expect(options.tag).toBe('missed-call:a-b');
      expect(options.data.jid).toBe('a-b');
    });

    it('leaves it alone when the same missed call is already showing', async () => {
      open.push({ tag: 'missed-call:a-b', close: vi.fn(), data: { missedCallId: 'c-1' } } as any);
      await showMissedCallNotification(MISSED, { useServiceWorker: true });
      expect(registration.showNotification).not.toHaveBeenCalled();
    });

    it('replaces the missed call of an earlier call in the room', async () => {
      open.push({ tag: 'missed-call:a-b', close: vi.fn(), data: { missedCallId: 'c-0' } } as any);
      await showMissedCallNotification(MISSED, { useServiceWorker: true });
      expect(registration.showNotification).toHaveBeenCalledTimes(1);
    });

    it('falls back to new Notification without a worker, once per call', async () => {
      await showMissedCallNotification(MISSED, { useServiceWorker: false });
      await showMissedCallNotification(MISSED, { useServiceWorker: false });
      expect(registration.showNotification).not.toHaveBeenCalled();
      expect(notificationCtor).toHaveBeenCalledTimes(1);
      expect(notificationCtor.mock.calls[0][1].tag).toBe('missed-call:a-b');
    });

    it('shows it once when the page and the worker end the ring at the same moment (one lock for the check and the show)', async () => {
      let tail: Promise<unknown> = Promise.resolve();
      const requests: string[] = [];
      (navigator as any).locks = {
        request: (name: string, cb: (lock: unknown) => Promise<unknown>) => {
          requests.push(name);
          const run = tail.then(() => cb({}));
          tail = run.then(() => undefined, () => undefined);
          return run;
        },
      };
      // the registration remembers what was shown, like the real one
      registration.showNotification = vi.fn(async (_t: string, o: any) => {
        open.push({ tag: o.tag, close: vi.fn(), data: o.data } as any);
      });
      try {
        await Promise.all([
          showMissedCallNotification(MISSED, { useServiceWorker: true }),
          showMissedCallNotification(MISSED, { useServiceWorker: true }),
        ]);
      } finally {
        delete (navigator as any).locks;
      }
      expect(registration.showNotification).toHaveBeenCalledTimes(1);
      expect(requests).toEqual(['ethora-missed-call:missed-call:a-b', 'ethora-missed-call:missed-call:a-b']);
    });

    it('shows nothing without permission', async () => {
      (window as any).Notification.permission = 'denied';
      await showMissedCallNotification(MISSED, { useServiceWorker: true });
      expect(registration.showNotification).not.toHaveBeenCalled();
      expect(notificationCtor).not.toHaveBeenCalled();
    });
  });
});
