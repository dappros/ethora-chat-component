import { buildNotificationUrl, PushPayloadLike } from './notificationPolicy';

/**
 * showBrowserNotification()
 * Triggers a native browser notification.
 * @param title - The notification title.
 * @param options - Standard NotificationOptions plus Ethora-specific data.
 * @param serviceWorkerScope - Optional SW scope for better integration.
 */
export async function showBrowserNotification(
  title: string,
  options: NotificationOptions & { data?: any },
  serviceWorkerScope = '/',
  onClick?: (event: Event) => void
): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  try {
    const notif = new Notification(title, options);
    if (onClick) {
      notif.onclick = (e) => {
        onClick(e);
        window.focus();
      };
    }
  } catch (err) {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.getRegistration(serviceWorkerScope);
      if (registration) {
        await registration.showNotification(title, options);
      }
    }
  }
}

/**
 * Only http(s) URLs and same-origin paths are usable as a notification icon;
 * anything else is dropped rather than handed to the browser.
 */
export function sanitizeIconUrl(value: unknown): string {
  const url = typeof value === 'string' ? value.trim() : '';
  if (!url) return '';
  if (url.startsWith('/') && !url.startsWith('//')) return url;
  return /^https?:\/\/\S+$/i.test(url) ? url : '';
}

/**
 * The icon a push asks for: its own icon first (data.icon, notification.icon),
 * then the picture it carries (notification.image, what this used to return
 * unconditionally), then the favicon. The service worker applies the same
 * preference for a backgrounded tab.
 */
export function pickPushIcon(payload: PushPayloadLike): string {
  const data = (payload?.data ?? {}) as Record<string, unknown>;
  const notification = (payload?.notification ?? {}) as Record<string, unknown>;
  return (
    sanitizeIconUrl(data.icon) ||
    sanitizeIconUrl(notification.icon) ||
    sanitizeIconUrl(notification.image) ||
    '/favicon.ico'
  );
}

/**
 * Helper to extract common data from a message/payload for browser notifications.
 */
export function getBrowserNotificationData(
  payload: PushPayloadLike,
  origin: string
) {
  const data = payload?.data ?? {};
  const title = payload.notification?.title || data.title || 'New message';
  const body = payload.notification?.body || data.body || 'You have a new message.';
  const url = buildNotificationUrl(payload, origin);
  
  return {
    title,
    body,
    url,
    icon: pickPushIcon(payload),
    badge: '/favicon.ico',
    tag: 'ethora-notification',
  };
}
