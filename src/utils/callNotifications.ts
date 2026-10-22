// OS notifications for an incoming call, shared by the page and (by tag) the
// service worker. Everything is keyed on `call:<callId>`, the tag the worker
// uses for its own call notification, so the page and the worker can never
// leave two notifications for one call: a second showNotification with the
// same tag replaces the first.

import { postToPushServiceWorker } from './pushServiceWorkerBridge';
import { withWebLock } from './webLock';

export const CALL_NOTIFICATION_ACTIONS = [
  { action: 'answer', title: 'Answer' },
  { action: 'decline', title: 'Decline' },
];

export const callNotificationTag = (key: string): string => `call:${key}`;

const CALL_TAG_PREFIX = 'call:';
const MISSED_TAG_PREFIX = 'missed-call:';

/**
 * The key one call goes by in the page and in the service worker: its callId,
 * or `room:<room bare name>` when the push or token carries none. Both sides
 * must derive it the same way (the worker has its own copy, callKeyOf in
 * firebase-messaging-sw.js), otherwise a call without a callId gets two
 * notifications and the worker later swaps its own for a false "Missed call".
 */
export const callNotificationKey = (
  callId: string | null | undefined,
  roomRef: string | null | undefined
): string => {
  if (callId) return callId;
  const bare = String(roomRef || '').split('@')[0].trim();
  return bare ? `room:${bare}` : 'incoming-call';
};

// Notifications made with `new Notification` (no service worker) cannot be
// found through registration.getNotifications, so they are tracked here.
const pageNotifications = new Map<string, Notification>();

const getRegistration = async (
  scope: string
): Promise<ServiceWorkerRegistration | null> => {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }
  try {
    return (await navigator.serviceWorker.getRegistration(scope)) || null;
  } catch {
    return null;
  }
};

const ROOM_FIELDS = ['callRoom', 'room', 'roomJid', 'jid', 'chatId'] as const;

const roomBareOf = (data: any): string => {
  for (const f of ROOM_FIELDS) {
    const v = data?.[f];
    if (v !== undefined && v !== null && String(v).trim() !== '') {
      return String(v).trim().split('@')[0].trim();
    }
  }
  return '';
};

/**
 * Closes any other ring for the same room. The page keys a ring by callId, or
 * by room:<bare> when its call token carries no callId (the server sometimes
 * drops it), while the worker may key the same call by the push's callId: two
 * tags, two notifications for one call. The worker does the same before its
 * own ring (closeOtherRingsForRoom in firebase-messaging-sw.js).
 */
async function closeOtherRingsForRoom(
  registration: ServiceWorkerRegistration,
  keepTag: string,
  data: any
): Promise<void> {
  const room =
    roomBareOf(data) ||
    (keepTag.startsWith(`${CALL_TAG_PREFIX}room:`)
      ? keepTag.slice(`${CALL_TAG_PREFIX}room:`.length)
      : '');
  if (!room) return;
  let open: Notification[] = [];
  try {
    open = await registration.getNotifications();
  } catch {
    return;
  }
  open.forEach((n) => {
    const tag = String(n.tag || '');
    if (!tag.startsWith(CALL_TAG_PREFIX) || tag === keepTag) return;
    // Only when one side did not know the callId: two different callIds are two calls.
    const roomKey = `${CALL_TAG_PREFIX}room:`;
    if (!tag.startsWith(roomKey) && !keepTag.startsWith(roomKey)) return;
    if (tag !== `${roomKey}${room}` && roomBareOf(n.data) !== room) return;
    try {
      n.close();
    } catch {
      // Already gone.
    }
  });
}

/**
 * Shows the "incoming call" notification. With a service worker registration
 * (`useServiceWorker`) it goes through registration.showNotification, which is
 * the only way to get Answer / Decline actions and to have the tap handled by
 * the worker. Without one it falls back to `new Notification`, which cannot
 * carry actions (the constructor throws on them), so they are dropped there.
 *
 * A ring shown through the registration is persistent (requireInteraction), so
 * the worker is told (CALL_RING_SHOWN) and ends it at `expiresAt` (swapping it
 * for "Missed call") even when this tab is closed before the ring is over.
 */
export async function showCallNotification(
  title: string,
  options: NotificationOptions & { data?: any; tag: string },
  opts: {
    scope?: string;
    useServiceWorker?: boolean;
    onClick?: () => void;
    /** When the call stops ringing (the token's exp), ms since epoch, if known. */
    expiresAt?: number | null;
  } = {}
): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  if (opts.useServiceWorker) {
    const registration = await getRegistration(opts.scope || '/');
    if (registration?.active) {
      await closeOtherRingsForRoom(registration, options.tag, options.data);
      try {
        await registration.showNotification(title, {
          ...options,
          actions: CALL_NOTIFICATION_ACTIONS,
        } as NotificationOptions);
      } catch {
        // fall through to the page notification
        return showPageCallNotification(title, options, opts);
      }
      const info = options.data || {};
      void postToPushServiceWorker({
        type: 'CALL_RING_SHOWN',
        key: options.tag.startsWith(CALL_TAG_PREFIX)
          ? options.tag.slice(CALL_TAG_PREFIX.length)
          : options.tag,
        exp: opts.expiresAt ?? null,
        // Only what the "Missed call" needs; never the call token.
        data: {
          callId: info.callId || '',
          room: info.room || '',
          kind: info.kind || '',
          callerName: info.callerName || '',
        },
        icon: options.icon,
        badge: options.badge,
      });
      return;
    }
  }

  showPageCallNotification(title, options, opts);
}

function showPageCallNotification(
  title: string,
  options: NotificationOptions & { data?: any; tag: string },
  opts: { onClick?: () => void }
): void {
  try {
    const notif = new Notification(title, options);
    pageNotifications.set(options.tag, notif);
    notif.onclick = () => {
      opts.onClick?.();
      window.focus();
    };
  } catch {
    // Notifications unavailable (some mobile browsers); the ring modal stays.
  }
}

/**
 * Closes the OS notification of a call, wherever it was shown: the page's own
 * Notification, and anything with the call's tag in the worker registration
 * (including the one the worker showed while no page was listening).
 */
export async function closeCallNotifications(
  key: string,
  scope = '/'
): Promise<void> {
  const tag = callNotificationTag(key);
  const own = pageNotifications.get(tag);
  if (own) {
    pageNotifications.delete(tag);
    try {
      own.close();
    } catch {
      // already closed
    }
  }
  const registration = await getRegistration(scope);
  if (!registration?.getNotifications) return;
  try {
    const open = await registration.getNotifications({ tag });
    open.forEach((n) => n.close());
  } catch {
    // nothing to close
  }
}

/**
 * Closes every call notification of this origin, rings and "Missed call" alike.
 * For logout: whoever logs in next must not find the previous user's call
 * notifications (their Answer / Decline would act on a call that is not theirs).
 */
export async function closeAllCallNotifications(scope = '/'): Promise<void> {
  pageNotifications.forEach((notif, tag) => {
    if (tag.startsWith(CALL_TAG_PREFIX) || tag.startsWith(MISSED_TAG_PREFIX)) {
      try {
        notif.close();
      } catch {
        // already closed
      }
    }
  });
  pageNotifications.clear();
  const registration = await getRegistration(scope);
  if (!registration?.getNotifications) return;
  try {
    const open = await registration.getNotifications();
    open.forEach((n) => {
      if (n.tag.startsWith(CALL_TAG_PREFIX) || n.tag.startsWith(MISSED_TAG_PREFIX)) {
        n.close();
      }
    });
  } catch {
    // nothing to close
  }
}

/**
 * The "Missed call" notification, the same one the service worker shows when
 * it is the one that sees a ring end (same tag, same data), so whichever gets
 * there first wins and the other leaves it alone. A hidden tab can reach the
 * ring's end before the worker does, and the worker then finds nothing to swap;
 * showing it from here as well makes the outcome independent of that order.
 * `missedCallId` tells a repeat of the same call (skipped) from the next missed
 * call in the room (replaces, and renotifies).
 */
export async function showMissedCallNotification(
  call: {
    key: string;
    kind: 'audio' | 'video';
    callerName?: string | null;
    roomBareName?: string | null;
  },
  opts: {
    icon?: string;
    badge?: string;
    scope?: string;
    useServiceWorker?: boolean;
    onClick?: () => void;
  } = {}
): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  const room = String(call.roomBareName || '').split('@')[0].trim();
  const tag = `missed-call:${room || call.key}`;
  const title = `Missed ${call.kind === 'audio' ? 'audio' : 'video'} call${
    call.callerName ? ` · ${call.callerName}` : ''
  }`;
  const options = {
    body: 'Tap to open the chat',
    icon: opts.icon,
    badge: opts.badge,
    tag,
    renotify: true,
    requireInteraction: false,
    data: {
      type: 'missed-call',
      jid: room,
      callerName: call.callerName || '',
      missedCallId: call.key,
      urlExplicit: false,
      source: 'missed-call',
    },
  } as NotificationOptions & { renotify: boolean };

  // One step under the lock the worker takes for the same tag: when the page
  // and the worker both see the ring end, the second one finds the first one's
  // notification and leaves it (one alert, not two).
  await withWebLock(`ethora-missed-call:${tag}`, async () => {
    const registration = opts.useServiceWorker
      ? await getRegistration(opts.scope || '/')
      : null;
    if (registration?.active) {
      try {
        const existing = await registration.getNotifications({ tag });
        if (existing.some((n) => n.data?.missedCallId === call.key)) return;
        await registration.showNotification(title, options);
        return;
      } catch {
        // fall through to the page notification
      }
    }

    try {
      if (pageNotifications.get(tag)?.data?.missedCallId === call.key) return;
      const notif = new Notification(title, options);
      pageNotifications.set(tag, notif);
      notif.onclick = () => {
        opts.onClick?.();
        window.focus();
      };
    } catch {
      // Notifications unavailable (some mobile browsers).
    }
  });
}
